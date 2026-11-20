/**
 * Cloudflare Pages Function: טבלת המובילים
 *
 * GET  /api/scores  → 100 המובילים
 * POST /api/scores  → עדכון התוצאה של שחקן { id, nick, score, solved, best }
 *
 * דורש KV namespace שמחובר לפרויקט בשם SCORES
 * (Pages → Settings → Bindings → KV namespace → Variable name: SCORES).
 * בלי החיבור הזה ה-API מחזיר 503 והמשחק עובד במצב מקומי.
 */

const TOTAL_Q = 100;
const MAX_SCORE = 3200;   // 2000 נקודות בסיס + בונוס רצף מקסימלי
const MAX_BODY = 2048;

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
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

export async function onRequestGet({ env }) {
  if (!env.SCORES) return json({ ok: false, error: 'not_configured' }, 503);
  const rows = [];
  let cursor;
  do {
    const page = await env.SCORES.list({ prefix: 'p:', cursor, limit: 1000 });
    for (const key of page.keys) {
      const m = key.metadata || {};
      rows.push({ k: key.name.slice(2), nick: cleanNick(m.n), score: int(m.s, MAX_SCORE), solved: int(m.c, TOTAL_Q) });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor && rows.length < 10000);
  rows.sort((a, b) => b.score - a.score || b.solved - a.solved);
  return json({ ok: true, total: rows.length, rows: rows.filter(r => r.score > 0).slice(0, 100) });
}

export async function onRequestPost({ request, env }) {
  if (!env.SCORES) return json({ ok: false, error: 'not_configured' }, 503);
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
  const meta = {
    n: cleanNick(body.nick),
    s: int(body.score, MAX_SCORE),
    c: int(body.solved, TOTAL_Q),
    b: int(body.best, 1000),
    t: Date.now()
  };

  // ניקוד 0 (למשל אחרי איפוס) מוריד את השחקן מהטבלה
  if (meta.s === 0) {
    await env.SCORES.delete('p:' + k);
    return json({ ok: true, k, removed: true });
  }
  await env.SCORES.put('p:' + k, '1', { metadata: meta });
  return json({ ok: true, k });
}
