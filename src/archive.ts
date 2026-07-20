import type { FeedResult, FeedFailure } from "./email";
import type { Article } from "./parser";

export interface ArchiveEntry {
  date: string;        // "2026-07-20"
  total: number;
  feeds: { name: string; articles: { title: string; link: string }[] }[];
}

const PREFIX = "archive:";
const INDEX_KEY = "archive-index";
const MAX_INDEX = 90; // keep 90 days in the index

/** Save today's digest to KV for the archive. */
export async function saveArchive(
  kv: KVNamespace,
  date: Date,
  feeds: FeedResult[],
): Promise<void> {
  const dateStr = toDateStr(date);

  const entry: ArchiveEntry = {
    date: dateStr,
    total: feeds.reduce((s, f) => s + f.articles.length, 0),
    feeds: feeds.map((f) => ({
      name: f.name,
      articles: f.articles.map((a) => ({ title: a.title, link: a.link })),
    })),
  };

  await kv.put(`${PREFIX}${dateStr}`, JSON.stringify(entry), {
    expirationTtl: MAX_INDEX * 24 * 60 * 60,
  });

  // Update the index (list of date strings, newest first)
  const raw = await kv.get(INDEX_KEY);
  const index: string[] = raw ? JSON.parse(raw) : [];
  const updated = [dateStr, ...index.filter((d) => d !== dateStr)].slice(
    0,
    MAX_INDEX,
  );
  await kv.put(INDEX_KEY, JSON.stringify(updated), {
    expirationTtl: MAX_INDEX * 24 * 60 * 60,
  });
}

/** Render the archive index page. */
export async function renderArchiveIndex(kv: KVNamespace): Promise<string> {
  const raw = await kv.get(INDEX_KEY);
  const index: string[] = raw ? JSON.parse(raw) : [];

  if (index.length === 0) {
    return page("Archive", "<p>No issues yet.</p>");
  }

  const rows = index
    .map((d) => `<li><a href="/archive/${d}">${d}</a></li>`)
    .join("\n");

  return page("Archive", `<h1>Archive</h1><ul>${rows}</ul>`);
}

/** Render a single past issue. */
export async function renderArchiveDay(
  kv: KVNamespace,
  dateStr: string,
): Promise<string | null> {
  const raw = await kv.get(`${PREFIX}${dateStr}`);
  if (!raw) return null;

  const entry: ArchiveEntry = JSON.parse(raw);

  const sections = entry.feeds
    .map((f) => {
      const items = f.articles
        .map((a) => `<li><a href="${a.link}">${a.title}</a></li>`)
        .join("\n");
      return `<h2>${f.name}</h2><ul>${items}</ul>`;
    })
    .join("\n");

  return page(
    `Digest · ${entry.date}`,
    `<h1>Daily Digest · ${entry.date}</h1>
     <p>${entry.total} stories</p>
     ${sections}
     <p><a href="/archive">← All issues</a></p>`,
  );
}

// ─── Weekly recap ─────────────────────────────────────────────────────────────

export interface WeeklyArticle {
  title: string;
  link: string;
  source: string;
  date: string;
}

/**
 * Pull the last 7 days from KV and return the top articles per source,
 * de-duplicated, for the weekly recap email.
 */
export async function buildWeeklyRecap(
  kv: KVNamespace,
): Promise<WeeklyArticle[]> {
  const raw = await kv.get(INDEX_KEY);
  const index: string[] = raw ? JSON.parse(raw) : [];
  const last7 = index.slice(0, 7);

  const seen = new Set<string>();
  const articles: WeeklyArticle[] = [];

  await Promise.all(
    last7.map(async (dateStr) => {
      const entryRaw = await kv.get(`${PREFIX}${dateStr}`);
      if (!entryRaw) return;
      const entry: ArchiveEntry = JSON.parse(entryRaw);
      for (const feed of entry.feeds) {
        for (const a of feed.articles) {
          if (!seen.has(a.link)) {
            seen.add(a.link);
            articles.push({ title: a.title, link: a.link, source: feed.name, date: dateStr });
          }
        }
      }
    }),
  );

  // Sort by most recent first, then take top 3 per source
  const bySource: Record<string, WeeklyArticle[]> = {};
  for (const a of articles) {
    bySource[a.source] = bySource[a.source] ?? [];
    if (bySource[a.source].length < 3) bySource[a.source].push(a);
  }

  return Object.values(bySource).flat();
}

// ─── JSON API data (consumed by the mobile app) ───────────────────────────────

export interface LatestDigest {
  date: string;
  aiIntro: string;
  total: number;
  feeds: { name: string; articles: { title: string; link: string; summary: string }[] }[];
  failures: { name: string; reason: string }[];
}

export async function saveLatestDigest(kv: KVNamespace, digest: LatestDigest): Promise<void> {
  await kv.put("latest-digest", JSON.stringify(digest), {
    expirationTtl: 7 * 24 * 60 * 60,
  });
}

export async function getLatestDigest(kv: KVNamespace): Promise<LatestDigest | null> {
  const raw = await kv.get("latest-digest");
  return raw ? JSON.parse(raw) : null;
}

export async function getArchiveIndex(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(INDEX_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function getArchiveEntry(kv: KVNamespace, dateStr: string): Promise<ArchiveEntry | null> {
  const raw = await kv.get(`${PREFIX}${dateStr}`);
  return raw ? JSON.parse(raw) : null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toDateStr(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(date);
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Daily Digest</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
       max-width:680px;margin:40px auto;padding:0 20px;color:#111;}
  h1{font-size:22px;margin-bottom:4px;}
  h2{font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;
     color:#ea580c;margin:28px 0 8px;}
  ul{padding-left:18px;margin:0;}
  li{margin:6px 0;line-height:1.45;}
  a{color:#111;text-decoration:none;border-bottom:1px solid #e5e7eb;}
  a:hover{border-color:#ea580c;color:#ea580c;}
  p{color:#6b7280;font-size:14px;}
</style>
</head>
<body>${body}</body>
</html>`;
}
