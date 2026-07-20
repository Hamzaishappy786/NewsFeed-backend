import { XMLParser } from "fast-xml-parser";

export interface Article {
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
}

/**
 * Workers have no DOMParser, so we lean on fast-xml-parser (pure JS, no Node
 * built-ins). Attributes are kept because Atom stores the article URL in
 * `<link href="...">` rather than in the element body.
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  // Some feeds emit a single <item>; force arrays so callers don't branch.
  isArray: (name) => name === "item" || name === "entry",
  // Reddit's Atom escapes a whole HTML document per entry, which trips the
  // library's default 1000-expansion cap. Raised, but deliberately still
  // finite — the caps exist to stop billion-laughs style expansion bombs.
  processEntities: {
    enabled: true,
    maxTotalExpansions: 50_000,
    maxExpandedLength: 5_000_000,
  },
});

/** fast-xml-parser returns a string for text-only nodes and an object when the
 *  node carries attributes or CDATA siblings. Flatten both to a string. */
function text(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "object") {
    const record = node as Record<string, unknown>;
    return text(record["#text"] ?? "");
  }
  return "";
}

/** Atom: <link rel="alternate" href="..."/>, sometimes several per entry. */
function atomLink(node: unknown): string {
  const candidates = Array.isArray(node) ? node : [node];
  const links = candidates
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({ href: text(c["@_href"]), rel: text(c["@_rel"]) }))
    .filter((l) => l.href);

  const alternate = links.find((l) => l.rel === "alternate" || l.rel === "");
  return (alternate ?? links[0])?.href ?? "";
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Feed descriptions are HTML (Reddit ships an entire <table>). Strip it down to
 * plain text — we re-render everything with our own inline styles anyway, and
 * injecting foreign markup into the email would wreck the layout.
 */
function toPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;|&#39;/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/\s+/g, " ")
    .trim()
    // Strip trailing source attributions like "— TechCrunch" or "| Ars Technica"
    .replace(/\s*[—|]\s*\w[\w\s]+$/, "");
}

/**
 * Some feeds put navigation chrome in <description> instead of a real excerpt:
 * Hacker News ships a lone "Comments" link, Reddit appends a "submitted by"
 * footer. Strip those, then discard anything too short to be a real summary.
 */
function cleanSummary(value: string): string {
  const cleaned = value
    .replace(/submitted by\s*\/u\/\S+/gi, "")
    .replace(/\[link\]|\[comments\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length < 30 ? "" : cleaned;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  // Cut on a word boundary so we don't end mid-word.
  const clipped = value.slice(0, max);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

/**
 * Parses an RSS 2.0 or Atom document into a normalised article list.
 * Throws if the payload isn't a feed we recognise.
 */
export function parseFeed(xml: string, limit: number): Article[] {
  const doc = parser.parse(xml) as Record<string, any>;

  const rawItems: Record<string, unknown>[] =
    doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.["rdf:RDF"]?.item ?? [];

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("no <item> or <entry> elements found");
  }

  return rawItems
    .slice(0, limit)
    .map((raw): Article => {
      const link = text(raw.link) || atomLink(raw.link) || text(raw.guid);
      const summary = cleanSummary(
        toPlainText(
          text(raw.description) ||
            text(raw.summary) ||
            text(raw.content) ||
            text(raw["content:encoded"]),
        ),
      );

      return {
        title: toPlainText(text(raw.title)) || "(untitled)",
        link: link.trim(),
        summary: truncate(summary, 85),
        publishedAt: text(raw.pubDate) || text(raw.published) || text(raw.updated) || null,
      };
    })
    .filter((article) => article.link.startsWith("http"));
}
