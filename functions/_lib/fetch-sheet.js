// Netlify Function: fetches ONE published Google Sheet as CSV so the page can load it (browsers often block this directly).
// Safety: it only ever contacts docs.google.com/spreadsheets, caps the size, and never returns anything but CSV text.
// Environment variables: optional ALLOWED_ORIGIN.

const hits = new Map();
const MAX = 1000000; // 1 MB
const reply = (code, obj, origin) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: JSON.stringify(obj) });

// Turns what the user pasted into a CSV address on docs.google.com, or returns null.
function toCsvUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com' || !u.pathname.startsWith('/spreadsheets/')) return null;
  // Published link: /spreadsheets/d/e/<key>/pub?output=csv  (use as is, force csv)
  if (/^\/spreadsheets\/d\/e\/[\w-]+\/pub/.test(u.pathname)) {
    const o = new URL(u.origin + u.pathname);
    o.searchParams.set('output', 'csv');
    const gid = u.searchParams.get('gid'); if (gid && /^\d+$/.test(gid)) o.searchParams.set('gid', gid);
    const single = u.searchParams.get('single'); if (single) o.searchParams.set('single', 'true');
    return o.toString();
  }
  // Ordinary share link: /spreadsheets/d/<id>/edit#gid=123  (works only if shared with anyone who has the link)
  const m = u.pathname.match(/^\/spreadsheets\/d\/([\w-]+)/);
  if (m) {
    let gid = u.searchParams.get('gid');
    if (!gid && u.hash) { const h = u.hash.match(/gid=(\d+)/); if (h) gid = h[1]; }
    let out = 'https://docs.google.com/spreadsheets/d/' + m[1] + '/export?format=csv';
    if (gid && /^\d+$/.test(gid)) out += '&gid=' + gid;
    return out;
  }
  return null;
}

exports.toCsvUrl = toCsvUrl;
exports.handler = async (event) => {
  const origin = process.env.ALLOWED_ORIGIN || '*';
  if (event.httpMethod === 'OPTIONS') return reply(204, {}, origin);
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Use POST' }, origin);
  const ro = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  if (process.env.ALLOWED_ORIGIN && ro && ro !== process.env.ALLOWED_ORIGIN) return reply(403, { ok: false, error: 'Origin not allowed' }, origin);
  const ip = (event.headers && (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'])) || 'unknown';
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (arr.length >= 30) return reply(429, { ok: false, error: 'Too many requests. Try again later.' }, origin);
  arr.push(now); hits.set(ip, arr);
  let raw = event.body || ''; if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8');
  if (raw.length > 4000) return reply(413, { ok: false, error: 'Too large' }, origin);
  let body; try { body = JSON.parse(raw); } catch (e) { return reply(400, { ok: false, error: 'Bad JSON' }, origin); }
  const url = toCsvUrl(body && body.url);
  if (!url) return reply(400, { ok: false, error: 'Paste a Google Sheets link (it must start with https://docs.google.com/spreadsheets/).' }, origin);
  try {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers: { accept: 'text/csv,text/plain' } });
    clearTimeout(timer);
    let host = ''; try { host = new URL(r.url).hostname; } catch (e) {}
    if (!(host === 'docs.google.com' || host.endsWith('.googleusercontent.com'))) return reply(502, { ok: false, error: 'The link did not lead to a Google Sheet.' }, origin);
    if (!r.ok) return reply(502, { ok: false, error: 'Google would not share that sheet (status ' + r.status + '). Publish it to the web as CSV, or set sharing to anyone with the link.' }, origin);
    const ct = String(r.headers.get('content-type') || '');
    if (/text\/html/i.test(ct)) return reply(502, { ok: false, error: 'That link opened a web page, not data. Use File, Share, Publish to web, and choose CSV.' }, origin);
    const text = await r.text();
    if (text.length > MAX) return reply(413, { ok: false, error: 'The sheet is larger than 1 MB. Load a shorter date range.' }, origin);
    if (!text.trim()) return reply(502, { ok: false, error: 'The sheet is empty.' }, origin);
    return reply(200, { ok: true, csv: text }, origin);
  } catch (e) {
    return reply(502, { ok: false, error: 'Could not reach Google Sheets.' }, origin);
  }
};
