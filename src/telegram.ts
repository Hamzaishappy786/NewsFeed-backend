import type { FeedResult } from "./email";

const TELEGRAM_API = "https://api.telegram.org";
const TOP_N = 5; // headlines to push per Telegram message

export async function sendTelegramDigest(
  botToken: string,
  chatId: string,
  feeds: FeedResult[],
  date: Date,
): Promise<void> {
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Karachi",
  }).format(date);

  // Pull the top article from each feed in round-robin order so no single
  // source dominates the Telegram highlights.
  const highlights: { source: string; title: string; link: string }[] = [];
  let round = 0;
  while (highlights.length < TOP_N) {
    let added = false;
    for (const feed of feeds) {
      if (highlights.length >= TOP_N) break;
      if (feed.articles[round]) {
        highlights.push({
          source: feed.name,
          title: feed.articles[round].title,
          link: feed.articles[round].link,
        });
        added = true;
      }
    }
    if (!added) break;
    round++;
  }

  const lines = highlights
    .map((h, i) => `${i + 1}. <b>${h.source}</b>\n<a href="${h.link}">${h.title}</a>`)
    .join("\n\n");

  const text = `📰 <b>Daily Digest · ${dateLabel}</b>\n\n${lines}`;

  const response = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });

  const payload = await response.text();
  if (!response.ok) {
    throw new Error(`Telegram returned ${response.status}: ${payload}`);
  }
  console.log(`[telegram ok] sent ${highlights.length} headlines`);
}
