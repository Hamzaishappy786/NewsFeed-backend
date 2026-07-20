import type { Article } from "./parser";
import type { FeedResult } from "./email";

/**
 * Keywords that boost an article's score.
 * Grouped by topic — add your own interests freely.
 */
const BOOST_KEYWORDS: RegExp[] = [
  // AI models & labs
  /\b(GPT|ChatGPT|Claude|Gemini|LLM|llama|mistral|openai|anthropic|deepmind|xai|grok)\b/i,
  // AI concepts
  /\b(AGI|alignment|fine.?tun|RLHF|RAG|agentic|inference|reasoning|multimodal)\b/i,
  // Open source
  /\b(open.?source|open.?weight|hugging.?face)\b/i,
  // Pakistan / local interest
  /\b(pakistan|karachi|lahore|islamabad|PTCL|jazz|telenor)\b/i,
  // Cloudflare / edge / Workers
  /\b(cloudflare|workers|edge.computing|serverless|deno|bun)\b/i,
];

/** Keywords that penalise an article — marketing fluff, low-signal noise. */
const PENALTY_KEYWORDS: RegExp[] = [
  /\b(sponsored|partner content|buy now|discount|sale|coupon|giveaway)\b/i,
  /\b(celebrity|kardashian|royal family|box office)\b/i,
];

function scoreArticle(article: Article): number {
  const text = `${article.title} ${article.summary}`;
  let score = 0;
  for (const re of BOOST_KEYWORDS) if (re.test(text)) score += 2;
  for (const re of PENALTY_KEYWORDS) if (re.test(text)) score -= 5;
  return score;
}

/**
 * Within each feed, sort articles by relevance score (highest first).
 * Articles with a score below the threshold are dropped entirely.
 * Feeds are also re-ordered so AI-heavy sources appear first.
 */
export function scoreAndSort(feeds: FeedResult[]): FeedResult[] {
  return feeds
    .map((feed) => {
      const scored = feed.articles
        .map((a) => ({ article: a, score: scoreArticle(a) }))
        .filter(({ score }) => score > -5) // drop obvious junk
        .sort((a, b) => b.score - a.score)
        .map(({ article }) => article);

      return { ...feed, articles: scored };
    })
    .filter((f) => f.articles.length > 0)
    .sort((a, b) => {
      // Feeds that contain at least one high-scoring article go first
      const topA = scoreArticle(a.articles[0]);
      const topB = scoreArticle(b.articles[0]);
      return topB - topA;
    });
}
