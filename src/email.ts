import type { Article } from "./parser";

export interface FeedResult {
  name: string;
  url: string;
  articles: Article[];
}

export interface FeedFailure {
  name: string;
  reason: string;
}

const COLORS = {
  bg: "#f4f5f7",
  card: "#ffffff",
  border: "#e5e7eb",
  heading: "#111827",
  body: "#374151",
  muted: "#6b7280",
  accent: "#ea580c",
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(url: string): string {
  return /^https?:\/\//i.test(url) ? escapeHtml(url) : "#";
}

function renderArticle(article: Article, index: number, total: number): string {
  const isLast = index === total - 1;
  const border = isLast ? "" : `border-bottom:1px solid ${COLORS.border};`;

  const summary = article.summary
    ? `<div style="margin:5px 0 0;font-family:${FONT};font-size:13px;line-height:19px;color:${COLORS.muted};">${escapeHtml(article.summary)}</div>`
    : "";

  return `
              <tr>
                <td style="padding:12px 0;${border}">
                  <a href="${safeHref(article.link)}" style="font-family:${FONT};font-size:15px;line-height:22px;font-weight:600;color:${COLORS.heading};text-decoration:none;">${escapeHtml(article.title)}</a>
                  ${summary}
                </td>
              </tr>`;
}

function renderSection(feed: FeedResult): string {
  const articles = feed.articles
    .map((a, i) => renderArticle(a, i, feed.articles.length))
    .join("");

  return `
        <tr>
          <td style="padding:0 0 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:10px;">
              <tr>
                <td class="px" style="padding:18px 24px 4px;">
                  <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:${COLORS.accent};">${escapeHtml(feed.name)}</div>
                </td>
              </tr>
              <tr>
                <td class="px" style="padding:0 24px 6px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${articles}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

function renderAIIntro(intro: string): string {
  if (!intro) return "";
  return `
        <tr>
          <td style="padding:0 0 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
              <tr>
                <td class="px" style="padding:16px 24px;">
                  <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:${COLORS.accent};margin-bottom:8px;">Today in AI</div>
                  <div style="font-family:${FONT};font-size:15px;line-height:23px;color:${COLORS.body};">${escapeHtml(intro)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

function renderFailures(failures: FeedFailure[]): string {
  if (failures.length === 0) return "";
  const items = failures
    .map((f) => `${escapeHtml(f.name)} — ${escapeHtml(f.reason)}`)
    .join("<br>");
  return `
        <tr>
          <td style="padding:0 0 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
              <tr>
                <td class="px" style="padding:14px 24px;font-family:${FONT};font-size:13px;line-height:20px;color:#92400e;">
                  <strong>Skipped ${failures.length} feed${failures.length === 1 ? "" : "s"}:</strong><br>${items}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

function renderPauseLink(baseUrl: string): string {
  return `<a href="${baseUrl}/pause?days=7" style="color:${COLORS.muted};text-decoration:underline;">Pause for 7 days</a>`;
}

export function buildEmailHtml(
  feeds: FeedResult[],
  failures: FeedFailure[],
  date: Date,
  options: { aiIntro?: string; archiveUrl?: string; pauseBaseUrl?: string } = {},
): string {
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Karachi",
  }).format(date);

  const total = feeds.reduce((sum, f) => sum + f.articles.length, 0);
  const archiveLink = options.archiveUrl
    ? `<a href="${escapeHtml(options.archiveUrl)}/archive" style="color:${COLORS.muted};text-decoration:underline;">Archive</a> · `
    : "";
  const pauseLink = options.pauseBaseUrl ? renderPauseLink(options.pauseBaseUrl) : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>Daily Digest</title>
<style>
  @media only screen and (max-width:600px){
    .wrap{width:100% !important;padding:16px !important;}
    .px{padding-left:16px !important;padding-right:16px !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${total} stories across ${feeds.length} sources — ${options.aiIntro ?? ""}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.bg};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
          <tr>
            <td style="padding:0 0 20px;">
              <div style="font-family:${FONT};font-size:26px;line-height:32px;font-weight:700;color:${COLORS.heading};">Daily Digest</div>
              <div style="font-family:${FONT};font-size:14px;line-height:20px;color:${COLORS.muted};padding-top:4px;">${escapeHtml(dateLabel)} · ${total} stories</div>
            </td>
          </tr>
${renderAIIntro(options.aiIntro ?? "")}
${feeds.map(renderSection).join("")}${renderFailures(failures)}
          <tr>
            <td style="padding:8px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted};text-align:center;">
              ${archiveLink}${pauseLink}
            </td>
          </tr>
          <tr>
            <td style="padding:4px 0 8px;font-family:${FONT};font-size:11px;line-height:16px;color:#d1d5db;text-align:center;">
              Assembled at the edge by a Cloudflare Worker.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildWeeklyEmailHtml(
  articles: { title: string; link: string; source: string; date: string }[],
  date: Date,
): string {
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Karachi",
  }).format(date);

  // Group by source
  const bySource: Record<string, typeof articles> = {};
  for (const a of articles) {
    bySource[a.source] = bySource[a.source] ?? [];
    bySource[a.source].push(a);
  }

  const sections = Object.entries(bySource)
    .map(([source, items]) => {
      const rows = items
        .map(
          (a) => `
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid ${COLORS.border};">
                  <div style="font-family:${FONT};font-size:11px;color:${COLORS.muted};margin-bottom:3px;">${escapeHtml(a.date)}</div>
                  <a href="${safeHref(a.link)}" style="font-family:${FONT};font-size:15px;font-weight:600;color:${COLORS.heading};text-decoration:none;">${escapeHtml(a.title)}</a>
                </td>
              </tr>`,
        )
        .join("");
      return `
        <tr>
          <td style="padding:0 0 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:10px;">
              <tr><td class="px" style="padding:18px 24px 4px;"><div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:${COLORS.accent};">${escapeHtml(source)}</div></td></tr>
              <tr><td class="px" style="padding:0 24px 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>
            </table>
          </td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Week in Review</title>
<style>
  @media only screen and (max-width:600px){
    .wrap{width:100% !important;padding:16px !important;}
    .px{padding-left:16px !important;padding-right:16px !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.bg};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
          <tr>
            <td style="padding:0 0 20px;">
              <div style="font-family:${FONT};font-size:26px;font-weight:700;color:${COLORS.heading};">Week in Review</div>
              <div style="font-family:${FONT};font-size:14px;color:${COLORS.muted};padding-top:4px;">Top stories from the past 7 days · ${escapeHtml(dateLabel)}</div>
            </td>
          </tr>
          ${sections}
          <tr>
            <td style="padding:4px 0 8px;font-family:${FONT};font-size:11px;color:#d1d5db;text-align:center;">Assembled at the edge by a Cloudflare Worker.</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildEmailText(feeds: FeedResult[], date: Date): string {
  const header = `DAILY DIGEST — ${date.toISOString().slice(0, 10)}\n`;
  const body = feeds
    .map((feed) => {
      const lines = feed.articles
        .map((a) => `  - ${a.title}\n    ${a.link}`)
        .join("\n");
      return `\n${feed.name.toUpperCase()}\n${lines}`;
    })
    .join("\n");
  return `${header}${body}\n`;
}
