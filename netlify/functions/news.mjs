// News feed for the News & Insights page and the homepage.
// Combines two sources, newest first:
//   1. NEWS_SHEET_CSV  - a Google Sheet published to the web as CSV (items the team adds by hand,
//                        e.g. LinkedIn posts from close connections or new team articles)
//   2. NEWS_FEEDS      - RSS/Atom feeds, one per line or comma separated, written as
//                        "Source name | https://feed-url" (the name is optional)
// Both are set as environment variables in Netlify, so adding a source needs no code change.
// Netlify's CDN caches the result for an hour (15 minutes if a source failed), so outside sites are checked at most hourly.

const MAX_ITEMS = 40;
const FETCH_TIMEOUT_MS = 8000;

const json = (status, body, cache = true) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
      "netlify-cdn-cache-control": cache ? "public, s-maxage=3600, stale-while-revalidate=86400" : "public, s-maxage=900",
    },
  });

async function getText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "OZIntelPro-News/1.0 (+https://ozintelpro.com)" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

const isHttp = (u) => /^https?:\/\//i.test(u || "");
const decode = (s) =>
  (s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&(nbsp|ensp|emsp|thinsp);/g, " ")
    .replace(/&(rsquo|lsquo);/g, "'").replace(/&(rdquo|ldquo);/g, '"')
    .replace(/&(mdash|ndash);/g, "-").replace(/&hellip;/g, "...")
    .replace(/&amp;/g, "&");
const plain = (s) => decode(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const clip = (s, n = 220) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
};
const toDate = (s) => {
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
};

// ---------- RSS / Atom ----------
// Newsletter feeds (e.g. Mailchimp) put the whole email, styles and all, in each item.
// These helpers pull out readable text, the issue's first headline, and its opening lines.
const BOILERPLATE = /(view this email in your browser|update your (email )?preferences|unsubscribe( from this list)?|past issues|translate|subscribe|rss|why did i get this\??)/gi;
function htmlOf(raw) {
  let h = decode(raw);
  if (/&lt;\w/.test(h)) h = decode(h); // double-encoded HTML
  return h
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(style|script|head|title)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/[^{}<>]*\{[^{}]*\}/g, " "); // stray CSS rules left outside <style>
}
const textOf = (h) => decode(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
function headlines(h, channel) {
  const out = [];
  for (const m of h.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)) {
    const t = textOf(m[1]);
    if (t && t.length > 8 && !(channel && t.toLowerCase().includes(channel.toLowerCase())) && !/^dear\b/i.test(t)) out.push(t);
  }
  if (!out.length) {
    for (const m of h.matchAll(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const t = textOf(m[2]);
      if (t.length >= 20 && t.length <= 140 && !(channel && t.toLowerCase().includes(channel.toLowerCase())) && !/^dear\b/i.test(t)) out.push(t);
    }
  }
  return out;
}
function intro(h) {
  let t = textOf(h).replace(BOILERPLATE, " ").replace(/\s+/g, " ").trim();
  const g = t.match(/\b(dear|hi|hello)\b[^,.!]{0,40}[,!]\s*/i);
  if (g) t = t.slice(g.index + g[0].length);
  return t;
}

function parseFeed(xml, nameOverride) {
  const channelTitle = plain(tag(xml.split(/<item[\s>]|<entry[\s>]/i)[0], "title"));
  const source = nameOverride || channelTitle || "News";
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.slice(0, 12).map((b) => {
    let link = plain(tag(b, "link"));
    if (!isHttp(link)) {
      const m = b.match(/<link[^>]*href="([^"]+)"/i);
      link = m ? decode(m[1]) : "";
    }
    const rawTitle = plain(tag(b, "title"));
    const body = htmlOf(tag(b, "content:encoded") || tag(b, "description") || tag(b, "summary") || tag(b, "content"));
    const heads = headlines(body, channelTitle);
    // Generic issue titles ("The Opportunity Zone Outlook") are swapped for the issue's lead headline.
    const generic = !rawTitle || /^(icymi|icmyi|in case you missed it)\b/i.test(rawTitle) ||
      (channelTitle && rawTitle.toLowerCase().replace(/^(icymi|icmyi|fwd?):\s*/i, "").trim() === channelTitle.toLowerCase());
    const summaryText = intro(body);
    let title = generic && heads[0] ? heads[0] : rawTitle;
    // No headline found and the title is just the newsletter name: use the issue's opening
    // sentence instead, so each issue gets its own title (and isn't merged with the others).
    if (!title || (channelTitle && title.toLowerCase().replace(/^(icymi|icmyi|fwd?):\s*/i, "").trim() === channelTitle.toLowerCase())) {
      const first = (summaryText.match(/^.{25,140}?[.!?](?=\s|$)/) || [""])[0];
      title = first || clip(summaryText, 90) || title;
    }
    return {
      title,
      link,
      date: toDate(plain(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"))),
      source,
      summary: clip(summaryText),
      type: "",
      section: "industry",
      resend: /^(icymi|icmyi|in case you missed it)\b/i.test(rawTitle),
    };
  })
  // "ICYMI" re-sends repeat an earlier issue, so drop them when that issue is already listed.
  .map((it) => ({ ...it, generic: !!channelTitle && it.title.toLowerCase() === channelTitle.toLowerCase() }))
  // The same issue can appear twice (an original plus an "ICMYI" re-send). Keep one copy,
  // preferring the copy that has a real headline, then the original send.
  .filter((it, i, all) => {
    const key = (x) => x.summary.slice(0, 120).toLowerCase();
    const twin = all.findIndex((o) => o !== it && key(o) && key(o) === key(it));
    if (twin < 0) return true;
    const o = all[twin];
    const score = (x) => (x.generic ? 0 : 2) + (x.resend ? 0 : 1);
    return score(it) > score(o) || (score(it) === score(o) && i < twin);
  })
  .map(({ resend, generic, ...it }) => it);
}

// ---------- Google Sheet (CSV) ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function sheetItems(csv) {
  const rows = parseCSV(csv).filter((r) => r.some((c) => c.trim()));
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (r, name) => (r[head.indexOf(name)] || "").trim();
  return rows.slice(1)
    .filter((r) => !/^(no|n|hide|false)$/i.test(col(r, "show")))
    .map((r) => ({
      title: col(r, "title"),
      link: col(r, "link"),
      date: toDate(col(r, "date")),
      source: col(r, "source") || "OZ Intel Pro",
      summary: clip(col(r, "summary")),
      type: col(r, "type") || "Article",
      section: /team/i.test(col(r, "section")) ? "team" : "industry",
    }));
}

export default async () => {
  const tasks = [];
  const sheetUrl = (process.env.NEWS_SHEET_CSV || "").trim();
  if (isHttp(sheetUrl)) tasks.push(getText(sheetUrl).then(sheetItems));

  const feeds = (process.env.NEWS_FEEDS || "").split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  for (const line of feeds) {
    const parts = line.split("|").map((s) => s.trim());
    const url = parts.length > 1 ? parts[1] : parts[0];
    const name = parts.length > 1 ? parts[0] : "";
    if (isHttp(url)) tasks.push(getText(url).then((x) => parseFeed(x, name)));
  }

  const results = await Promise.allSettled(tasks);
  const errors = results.filter((r) => r.status === "rejected").length;
  const seen = new Set();
  const items = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((it) => it.title && isHttp(it.link))
    .filter((it) => { const k = (it.source + '|' + it.title).toLowerCase(); if (seen.has(it.link) || seen.has(k)) return false; seen.add(it.link); seen.add(k); return true; })
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, MAX_ITEMS);

  return json(200, { updated: new Date().toISOString(), sources: tasks.length, errors, items }, errors === 0);
};

export const config = { path: "/api/news" };
