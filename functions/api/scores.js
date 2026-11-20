/**
 * Cloudflare Pages Function: טבלת המובילים הציבורית
 *
 * GET  /api/scores  → 100 המובילים
 * POST /api/scores  → עדכון שחקן { id, nick, score, solved, best }
 *
 * אחסון: Cloudflare D1, מחובר לפרויקט בשם DB
 * (Pages → Settings → Bindings → D1 database → Variable name: DB).
 * הטבלה נוצרת אוטומטית בבקשה הראשונה.
 *
 * הטבלה שומרת לכל שחקן את השיא שלו: ניקוד נמוך יותר (למשל אחרי איפוס
 * התקדמות) לא מוחק ולא מוריד את מה שכבר הושג.
 */

const TOTAL_Q = 100;
const MAX_SCORE = 3200;   // 2000 נקודות בסיס + בונוס רצף מקסימלי
const MAX_BODY = 2048;
const CACHE_SECONDS = 15;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS scores (
     k       TEXT PRIMARY KEY,
     nick    TEXT    NOT NULL DEFAULT '',
     score   INTEGER NOT NULL DEFAULT 0,
     solved  INTEGER NOT NULL DEFAULT 0,
     best    INTEGER NOT NULL DEFAULT 0,
     created INTEGER NOT NULL DEFAULT 0,
     updated INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_scores_board ON scores (score DESC, solved DESC, updated ASC)`
];

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map(sql => db.prepare(sql)));
  schemaReady = true;
}

const json = (obj, status = 200, extra) => new Response(JSON.stringify(obj), {
  status,
  headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, extra || {})
});

const int = (x, max) => {
  x = Math.floor(Number(x));
  return Number.isFinite(x) && x > 0 ? Math.min(x, max) : 0;
};

const cleanNick = s => typeof s === 'string'
  ? s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20)
  : '';

async function publicKey(id) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

const edgeCache = () => (typeof caches !== 'undefined' && caches.default) ? caches.default : null;
const cacheKey = request => new Request(new URL('/api/scores?board=1', request.url).toString());

export async function onRequestGet({ request, env, waitUntil }) {
  if (!env.DB) return json({ ok: false, error: 'not_configured' }, 503);

  const cache = edgeCache();
  if (cache) {
    const hit = await cache.match(cacheKey(request));
    if (hit) return hit;
  }

  try {
    await ensureSchema(env.DB);
    const { results } = await env.DB
      .prepare('SELECT k, nick, score, solved FROM scores WHERE score > 0 ORDER BY score DESC, solved DESC, updated ASC LIMIT 100')
      .all();
    const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE score > 0').first('n');
    const res = json(
      { ok: true, total: Number(total) || 0, rows: (results || []).map(r => ({ k: r.k, nick: cleanNick(r.nick), score: int(r.score, MAX_SCORE), solved: int(r.solved, TOTAL_Q) })) },
      200,
      { 'cache-control': 'public, max-age=0, s-maxage=' + CACHE_SECONDS }
    );
    if (cache && waitUntil) waitUntil(cache.put(cacheKey(request), res.clone()));
    return res;
  } catch (e) {
    return json({ ok: false, error: 'db_error' }, 500);
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.DB) return json({ ok: false, error: 'not_configured' }, 503);
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);

  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);
    body = JSON.parse(text);
  } catch (e) {
    return json({ ok: false, error: 'bad_json' }, 400);
  }
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'bad_json' }, 400);

  const id = typeof body.id === 'string' ? body.id : '';
  if (!/^[a-f0-9]{32}$/.test(id)) return json({ ok: false, error: 'bad_id' }, 400);

  const k = await publicKey(id);
  const nick = cleanNick(body.nick);
  const score = int(body.score, MAX_SCORE);
  const solved = int(body.solved, TOTAL_Q);
  const best = int(body.best, 1000);
  const now = Date.now();

  try {
    await ensureSchema(env.DB);
    if (score === 0) {
      // אין מה להוסיף לטבלה; רק עדכון שם אם השחקן כבר קיים בה
      await env.DB.prepare('UPDATE scores SET nick = ?2, updated = ?3 WHERE k = ?1 AND nick <> ?2').bind(k, nick, now).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO scores (k, nick, score, solved, best, created, updated)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(k) DO UPDATE SET
           nick    = excluded.nick,
           score   = MAX(scores.score, excluded.score),
           solved  = MAX(scores.solved, excluded.solved),
           best    = MAX(scores.best, excluded.best),
           updated = CASE WHEN excluded.score > scores.score OR excluded.nick <> scores.nick THEN excluded.updated ELSE scores.updated END`
      ).bind(k, nick, score, solved, best, now).run();
    }
    const row = await env.DB.prepare('SELECT nick, score, solved FROM scores WHERE k = ?1').bind(k).first();
    const cache = edgeCache();
    if (cache && waitUntil) waitUntil(cache.delete(cacheKey(request)));
    return json({ ok: true, k, record: row ? { nick: row.nick, score: row.score, solved: row.solved } : null });
  } catch (e) {
    return json({ ok: false, error: 'db_error' }, 500);
  }
}
