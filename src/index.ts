import { FEEDS, FETCH_TIMEOUT_MS, ITEMS_PER_FEED, type FeedSource } from "./feeds";
import { parseFeed, type Article } from "./parser";
import {
  buildEmailHtml,
  buildEmailText,
  buildWeeklyEmailHtml,
  type FeedFailure,
  type FeedResult,
} from "./email";
import { sendTelegramDigest } from "./telegram";
import {
  saveArchive,
  saveLatestDigest,
  getLatestDigest,
  getArchiveIndex,
  getArchiveEntry,
  renderArchiveIndex,
  renderArchiveDay,
  buildWeeklyRecap,
  toDateStr,
} from "./archive";
import { scoreAndSort } from "./scoring";

export interface Env {
  RESEND_API_KEY: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TO_EMAIL: string;
  FROM_EMAIL: string;
  SEEN_ARTICLES: KVNamespace;
  AI: Ai;
}

const USER_AGENT =
  "daily-rss-digest/1.0 (Cloudflare Worker; +https://developers.cloudflare.com/workers/)";

// ─── KV deduplication ────────────────────────────────────────────────────────

const DEDUP_TTL = 7 * 24 * 60 * 60;

async function filterSeen(env: Env, articles: Article[]): Promise<Article[]> {
  if (!articles.length) return [];
  const checks = await Promise.all(articles.map((a) => env.SEEN_ARTICLES.get(a.link)));
  return articles.filter((_, i) => checks[i] === null);
}

async function markSeen(env: Env, articles: Article[]): Promise<void> {
  await Promise.all(
    articles.map((a) => env.SEEN_ARTICLES.put(a.link, "1", { expirationTtl: DEDUP_TTL })),
  );
}

// ─── Pause / unsubscribe ──────────────────────────────────────────────────────

const PAUSE_KEY = "pause-until";
const HOUR_KEY = "preferred-hour";
const DEFAULT_SEND_HOUR_UTC = 4; // 09:00 PKT

async function getPreferredHour(env: Env): Promise<number> {
  const raw = await env.SEEN_ARTICLES.get(HOUR_KEY);
  return raw ? Number(raw) : DEFAULT_SEND_HOUR_UTC;
}

async function setPreferredHour(env: Env, utcHour: number): Promise<void> {
  await env.SEEN_ARTICLES.put(HOUR_KEY, String(utcHour));
}

async function isPaused(env: Env): Promise<boolean> {
  const raw = await env.SEEN_ARTICLES.get(PAUSE_KEY);
  if (!raw) return false;
  return new Date(raw) > new Date();
}

async function setPause(env: Env, days: number): Promise<void> {
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await env.SEEN_ARTICLES.put(PAUSE_KEY, until.toISOString(), {
    expirationTtl: days * 24 * 60 * 60,
  });
}

// ─── Workers AI ───────────────────────────────────────────────────────────────

/** Per-article one-liner rewrite. Skips articles already short enough. */
async function enrichWithAI(env: Env, articles: Article[]): Promise<Article[]> {
  const results = await Promise.allSettled(
    articles.map(async (article): Promise<Article> => {
      const input = article.summary || article.title;
      if (input.length <= 80) return article;

      const response = await (env.AI.run as Function)("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          {
            role: "system",
            content:
              "You are a news editor. Rewrite the following into ONE short sentence under 80 characters. Be direct and punchy. No fluff, no quotes, no period at the end.",
          },
          { role: "user", content: input },
        ],
        max_tokens: 60,
      });

      const generated =
        (response as any)?.response?.trim() ||
        (response as any)?.result?.response?.trim() ||
        "";

      return { ...article, summary: generated.length > 10 ? generated : article.summary };
    }),
  );

  return results.map((r, i) => (r.status === "fulfilled" ? r.value : articles[i]));
}

/**
 * Generate a 2-3 sentence "Today in AI" overview from all article titles.
 * Single AI call — much faster than per-article.
 */
async function generateDailyIntro(env: Env, feeds: FeedResult[]): Promise<string> {
  const titles = feeds
    .flatMap((f) => f.articles.map((a) => a.title))
    .slice(0, 20)
    .join("\n");

  try {
    const response = await (env.AI.run as Function)("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        {
          role: "system",
          content:
            "You are a sharp tech journalist. Given these headlines, write 2-3 punchy sentences summarising the biggest themes in AI and tech today. Be direct. No lists, no bullet points, plain prose only.",
        },
        { role: "user", content: titles },
      ],
      max_tokens: 120,
    });

    const text =
      (response as any)?.response?.trim() ||
      (response as any)?.result?.response?.trim() ||
      "";

    return text.length > 20 ? text : "";
  } catch {
    return "";
  }
}

// ─── Feed fetching ────────────────────────────────────────────────────────────

async function fetchFeed(source: FeedSource): Promise<FeedResult> {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

  const articles = parseFeed(await response.text(), ITEMS_PER_FEED);
  if (!articles.length) throw new Error("feed parsed but contained no usable articles");

  return { name: source.name, url: source.url, articles };
}

async function collectFeeds(env: Env): Promise<{
  feeds: FeedResult[];
  failures: FeedFailure[];
}> {
  const settled = await Promise.allSettled(FEEDS.map(fetchFeed));

  const feeds: FeedResult[] = [];
  const failures: FeedFailure[] = [];

  await Promise.all(
    settled.map(async (result, i) => {
      const source = FEEDS[i];
      if (result.status === "rejected") {
        const reason =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
        failures.push({ name: source.name, reason });
        console.error(`[feed failed] ${source.name}: ${reason}`);
        return;
      }

      const fresh = await filterSeen(env, result.value.articles);
      if (!fresh.length) {
        console.log(`[feed skip] ${source.name}: all articles already seen`);
        return;
      }

      const enriched = await enrichWithAI(env, fresh);
      await markSeen(env, enriched);
      feeds.push({ name: source.name, url: source.url, articles: enriched });
      console.log(`[feed ok] ${source.name}: ${enriched.length} new articles`);
    }),
  );

  return { feeds, failures };
}

// ─── Email delivery ───────────────────────────────────────────────────────────

async function sendEmail(
  env: Env,
  subject: string,
  html: string,
  text: string,
): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: env.TO_EMAIL.split(",").map((a) => a.trim()).filter(Boolean),
      subject,
      html,
      text,
    }),
  });

  const payload = await response.text();
  if (!response.ok) throw new Error(`Resend returned ${response.status}: ${payload}`);
  console.log(`[resend ok] ${payload}`);
}

// ─── Sunday weekly recap ──────────────────────────────────────────────────────

async function runWeeklyRecap(env: Env, now: Date): Promise<void> {
  const articles = await buildWeeklyRecap(env.SEEN_ARTICLES);
  if (!articles.length) {
    console.log("[weekly] no archive data yet, skipping");
    return;
  }

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Karachi",
  }).format(now);

  await sendEmail(
    env,
    `Week in Review · ${dateLabel}`,
    buildWeeklyEmailHtml(articles, now),
    articles.map((a) => `${a.source}: ${a.title}\n${a.link}`).join("\n\n"),
  );

  console.log(`[weekly] sent ${articles.length} stories`);
}

// ─── Main digest ──────────────────────────────────────────────────────────────

function assertEnv(env: Env): void {
  const missing = (["RESEND_API_KEY", "TO_EMAIL", "FROM_EMAIL"] as const).filter(
    (k) => !env[k],
  );
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(", ")}`);
}

async function runDigest(env: Env, workerUrl?: string): Promise<string> {
  assertEnv(env);

  if (await isPaused(env)) {
    console.log("[digest] paused — skipping");
    return "Digest is paused.";
  }

  const { feeds: rawFeeds, failures } = await collectFeeds(env);

  if (!rawFeeds.length) {
    return failures.length
      ? `Every feed failed. Failures: ${failures.map((f) => `${f.name}: ${f.reason}`).join(" | ")}`
      : "All articles already sent — nothing new today.";
  }

  // Score + sort articles by relevance
  const feeds = scoreAndSort(rawFeeds);

  const now = new Date();
  const total = feeds.reduce((sum, f) => sum + f.articles.length, 0);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Karachi",
  }).format(now);

  // Generate "Today in AI" intro
  const aiIntro = await generateDailyIntro(env, feeds);

  await sendEmail(
    env,
    `Daily Digest · ${dateLabel} · ${total} stories`,
    buildEmailHtml(feeds, failures, now, {
      aiIntro,
      archiveUrl: workerUrl,
      pauseBaseUrl: workerUrl,
    }),
    buildEmailText(feeds, now),
  );

  // Save to archive + latest-digest (consumed by mobile app)
  await saveArchive(env.SEEN_ARTICLES, now, feeds);
  await saveLatestDigest(env.SEEN_ARTICLES, {
    date: toDateStr(now),
    aiIntro,
    total,
    feeds: feeds.map((f) => ({
      name: f.name,
      articles: f.articles.map((a) => ({
        title: a.title,
        link: a.link,
        summary: a.summary,
      })),
    })),
    failures,
  });

  // Telegram (optional)
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      await sendTelegramDigest(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, feeds, now);
    } catch (e) {
      console.error(`[telegram failed] ${e}`);
    }
  }

  return `Sent ${total} stories from ${feeds.length} feeds.`;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[cron] triggered by "${event.cron}"`);
    const now = new Date();
    const workerUrl = "https://daily-rss-digest.hamzaonly.workers.dev";

    ctx.waitUntil(
      (async () => {
        // Only fire at the user's preferred UTC hour
        const preferredHour = await getPreferredHour(env);
        if (now.getUTCHours() !== preferredHour) {
          console.log(`[cron] skipping — current hour ${now.getUTCHours()} !== preferred ${preferredHour}`);
          return;
        }

        const dayOfWeek = new Intl.DateTimeFormat("en-US", {
          weekday: "short",
          timeZone: "Asia/Karachi",
        }).format(now);

        const result = await (dayOfWeek === "Sun"
          ? runWeeklyRecap(env, now)
          : runDigest(env, workerUrl));
        if (result) console.log(`[cron] ${result}`);
      })().catch((e) => console.error(`[cron] failed: ${e}`)),
    );
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const workerUrl = url.origin;

    // CORS headers so the mobile app (and local Expo dev) can call freely
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const jsonRes = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    try {
      // ── /api/today ── latest digest as JSON
      if (pathname === "/api/today") {
        const digest = await getLatestDigest(env.SEEN_ARTICLES);
        if (!digest) return jsonRes({ error: "No digest yet. Hit /run first." }, 404);
        return jsonRes(digest);
      }

      // ── /api/archive ── index of past issues
      if (pathname === "/api/archive") {
        const issues = await getArchiveIndex(env.SEEN_ARTICLES);
        return jsonRes({ issues });
      }

      // ── /api/archive/:date ── single past issue
      const apiArchiveMatch = pathname.match(/^\/api\/archive\/(\d{4}-\d{2}-\d{2})$/);
      if (apiArchiveMatch) {
        const entry = await getArchiveEntry(env.SEEN_ARTICLES, apiArchiveMatch[1]);
        if (!entry) return jsonRes({ error: "Not found" }, 404);
        return jsonRes(entry);
      }

      // ── /api/status ── pause state
      if (pathname === "/api/status") {
        const raw = await env.SEEN_ARTICLES.get("pause-until");
        const paused = raw ? new Date(raw) > new Date() : false;
        return jsonRes({ paused, pausedUntil: paused ? raw : null });
      }

      // ── /api/run ── trigger digest
      if (pathname === "/api/run") {
        const result = await runDigest(env, url.origin);
        return jsonRes({ message: result });
      }

      // ── /api/pause ── pause for N days
      if (pathname === "/api/pause") {
        const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") ?? "7")));
        await setPause(env, days);
        const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        return jsonRes({ message: `Paused for ${days} days.`, until: until.toISOString() });
      }

      // ── /api/unpause
      if (pathname === "/api/unpause") {
        await env.SEEN_ARTICLES.delete("pause-until");
        return jsonRes({ message: "Unpaused." });
      }

      // ── /api/weekly ── trigger weekly recap
      if (pathname === "/api/weekly") {
        await runWeeklyRecap(env, new Date());
        return jsonRes({ message: "Weekly recap sent." });
      }

      // ── /api/time ── get or set preferred send hour (UTC)
      if (pathname === "/api/time") {
        if (request.method === "POST") {
          const utcHour = Number(url.searchParams.get("utc") ?? "4");
          if (isNaN(utcHour) || utcHour < 0 || utcHour > 23) {
            return jsonRes({ error: "Invalid hour" }, 400);
          }
          await setPreferredHour(env, utcHour);
          return jsonRes({ message: "Send time updated.", utcHour });
        }
        const utcHour = await getPreferredHour(env);
        return jsonRes({ utcHour, pktHour: (utcHour + 5) % 24 });
      }

      // ── /preview — render email without sending
      if (pathname === "/preview") {
        const settled = await Promise.allSettled(FEEDS.map(fetchFeed));
        const feeds: FeedResult[] = [];
        const failures: FeedFailure[] = [];
        settled.forEach((r, i) => {
          if (r.status === "fulfilled") feeds.push(r.value);
          else
            failures.push({
              name: FEEDS[i].name,
              reason: r.reason instanceof Error ? r.reason.message : String(r.reason),
            });
        });
        const scored = scoreAndSort(feeds);
        const aiIntro = await generateDailyIntro(env, scored);
        return new Response(
          buildEmailHtml(scored, failures, new Date(), { aiIntro, archiveUrl: workerUrl, pauseBaseUrl: workerUrl }),
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }

      // ── /run — fetch feeds and send the email
      if (pathname === "/run") {
        return new Response(await runDigest(env, workerUrl), { status: 200 });
      }

      // ── /weekly — send weekly recap on demand
      if (pathname === "/weekly") {
        await runWeeklyRecap(env, new Date());
        return new Response("Weekly recap sent.", { status: 200 });
      }

      // ── /pause?days=N — pause the digest
      if (pathname === "/pause") {
        const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") ?? "7")));
        await setPause(env, days);
        return new Response(
          `<html><body style="font-family:sans-serif;max-width:480px;margin:60px auto;text-align:center;">
            <h2>Digest paused for ${days} days.</h2>
            <p>You won't receive emails until then.</p>
            <p><a href="/unpause">Unpause early</a></p>
          </body></html>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }

      // ── /unpause
      if (pathname === "/unpause") {
        await env.SEEN_ARTICLES.delete(PAUSE_KEY);
        return new Response(
          `<html><body style="font-family:sans-serif;max-width:480px;margin:60px auto;text-align:center;">
            <h2>Digest unpaused.</h2><p>You'll receive tomorrow's digest as normal.</p>
          </body></html>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }

      // ── /archive
      if (pathname === "/archive") {
        return new Response(await renderArchiveIndex(env.SEEN_ARTICLES), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      // ── /archive/YYYY-MM-DD
      const archiveMatch = pathname.match(/^\/archive\/(\d{4}-\d{2}-\d{2})$/);
      if (archiveMatch) {
        const html = await renderArchiveDay(env.SEEN_ARTICLES, archiveMatch[1]);
        if (!html) return new Response("Not found", { status: 404 });
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    } catch (error) {
      console.error(error);
      return new Response(
        `Error: ${error instanceof Error ? error.message : error}`,
        { status: 500 },
      );
    }

    return new Response(
      "Daily RSS Digest · /preview · /run · /archive · /pause?days=7 · /weekly",
      { headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  },
} satisfies ExportedHandler<Env>;
