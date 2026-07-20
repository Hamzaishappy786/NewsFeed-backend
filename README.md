# Daily RSS Digest

A Cloudflare Worker that fetches a set of RSS/Atom feeds once a day, aggregates the
top 5 articles from each, and emails you a single mobile-responsive digest via
[Resend](https://resend.com). Runs entirely on Cloudflare's free tier.

## Layout

| File | Purpose |
| --- | --- |
| `src/index.ts` | Cron + HTTP handlers, feed orchestration, Resend delivery |
| `src/feeds.ts` | The feed list and tuning constants — **edit this to change sources** |
| `src/parser.ts` | RSS 2.0 / Atom → normalised articles (via `fast-xml-parser`) |
| `src/email.ts` | Inline-styled HTML + plain-text email rendering |

## Setup

```bash
npm install
npx wrangler login
```

### 1. Get a Resend API key

1. Sign up at [resend.com](https://resend.com) (free tier: 100 emails/day, 3,000/month).
2. **API Keys → Create API Key**, permission `Sending access`. Copy the `re_...` value —
   it is shown only once.
3. For `FROM_EMAIL` you have two options:
   - **Fastest:** use `onboarding@resend.dev`. Works with zero setup, but it can
     **only send to the email address that owns the Resend account**.
   - **Proper:** add your own domain under **Domains**, add the DKIM/SPF records it
     gives you, and then send from e.g. `digest@yourdomain.com` to anywhere.

### 2. Local secrets

```bash
cp .dev.vars.example .dev.vars
```

Fill in your real key. `.dev.vars` is gitignored — Wrangler loads it automatically
for `wrangler dev`. Never commit it.

### 3. Cloudflare secrets

`TO_EMAIL` and `FROM_EMAIL` are non-sensitive and already live in `wrangler.toml`
under `[vars]` — edit them there. Only the API key needs to be a real secret:

```bash
npx wrangler secret put RESEND_API_KEY
```

Paste the key at the prompt. It is encrypted at rest and never readable again.

**Via the dashboard instead:** Workers & Pages → `daily-rss-digest` → Settings →
Variables and Secrets → Add → type **Secret** → name `RESEND_API_KEY` → Deploy.

> Secrets set with `wrangler secret put` apply to the deployed Worker only.
> Local `wrangler dev` reads `.dev.vars`. The two are separate; set both.

### 4. Deploy

```bash
npm run deploy
```

The cron trigger registers automatically from `wrangler.toml`.

## Testing

```bash
npm run dev
```

Then, in a browser or another terminal:

- `http://localhost:8787/preview` — renders the digest HTML **without sending email**.
  Use this while tweaking styles.
- `http://localhost:8787/run` — fetches feeds and **actually sends** the email.
- `curl "http://localhost:8787/__scheduled?cron=0+4+*+*+*"` — simulates the cron event
  end to end (`npm run dev` passes `--test-scheduled` for this).

Both routes exist on the deployed Worker too, at `https://daily-rss-digest.<subdomain>.workers.dev`.

Live logs from the deployed Worker:

```bash
npm run tail
```

## Schedule

Cloudflare evaluates cron triggers in **UTC**. Pakistan is UTC+5 with no DST, so:

| Cron | Fires at (PKT) |
| --- | --- |
| `0 4 * * *` | 09:00 — **current setting** |
| `0 8 * * *` | 13:00 |

Change `crons` in `wrangler.toml` and redeploy.

## Adding feeds

Add an entry to `FEEDS` in `src/feeds.ts`:

```ts
{ name: "Simon Willison", url: "https://simonwillison.net/atom/everything/" },
```

Both RSS 2.0 and Atom work. Sections render in array order.

### A note on Reddit

Reddit rate-limits datacenter IPs hard, and Cloudflare Workers egress from shared
addresses. `r/technology` returns HTTP 429 essentially every time and is commented
out for that reason; smaller subreddits like `r/artificial` are usually fine. If a
Reddit feed starts failing, that's why — the digest still sends, with the source
listed in the "Skipped feeds" panel.

## Error handling

Feeds are fetched concurrently with `Promise.allSettled` and a 10s per-feed timeout.
A feed that 404s, times out, or returns unparseable XML is logged, listed in a warning
panel at the bottom of the email, and skipped — the digest still goes out. The run
only aborts (without sending) if *every* feed fails.

## Costs

Free tier covers this comfortably: 100,000 Worker requests/day and 5 cron invocations
per minute against one daily trigger, plus Resend's 100 emails/day.
