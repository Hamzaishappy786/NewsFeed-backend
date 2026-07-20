/**
 * Feed sources for the daily digest.
 *
 * `name` is used as the section heading in the email, so keep it short.
 * Reorder this array to reorder the email — sections are rendered in this order.
 */
export interface FeedSource {
  name: string;
  url: string;
}

export const FEEDS: FeedSource[] = [
  // --- AI ---
  { name: "OpenAI", url: "https://openai.com/news/rss.xml" },
  { name: "The Verge · AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { name: "TechCrunch · AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "r/artificial", url: "https://www.reddit.com/r/artificial/.rss" },

  // --- General tech ---
  { name: "Hacker News", url: "https://news.ycombinator.com/rss" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },

  // r/technology returns HTTP 429 to datacenter IPs essentially every time, so
  // it is left out by default. Smaller subreddits (r/artificial above) are fine.
  // { name: "r/technology", url: "https://www.reddit.com/r/technology/.rss" },
];

/** Max articles pulled from each feed. */
export const ITEMS_PER_FEED = 5;

/** Per-feed fetch timeout, so one slow origin can't stall the whole run. */
export const FETCH_TIMEOUT_MS = 10_000;
