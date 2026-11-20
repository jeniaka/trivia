/* =========================================================
   טבלת מובילים: שכבת חיבור לשרת
   • בתוך Claude (artifact): מאגר הנתונים המשותף של Claude
   • באתר (Cloudflare Pages): ‎/api/scores עם Workers KV
   • קובץ מקומי או שרת בלי API: מצב לא מקוון, הכל נשמר במכשיר
   ========================================================= */
const Board = (() => {
  const TOTAL_Q = 100;
  const S = {
    mode: 'loading',      // loading | claude | cloud | off
    reason: '',           // local | not_configured | error | slow
    loaded: false,
    canWrite: false,
    signedIn: true,
    rows: [],             // {k, nick, score, solved}
    names: {},
    myKey: null
  };
  let hooks = { getState: () => null, mergeRemote: () => false, onChange: () => {} };

  const num = (x, max) => { x = Math.floor(Number(x)); return Number.isFinite(x) && x > 0 ? Math.min(x, max || 1e9) : 0; };
  const cleanNick = s => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20) : '';
  const changed = () => { try { hooks.onChange(); } catch (e) {} };

  /* ---------- Claude ---------- */
  let cRef = null, cUser = null, cDb = null;
  let cWriting = false, cDirty = false, cRetries = 0;

  function claudeDoc(st) {
    return {
      nick: st.nick, score: st.score, solvedCount: st.solved.length,
      best: st.best, streak: st.streak, solved: st.solved, attempted: st.attempted,
      correct: st.correct, wrong: st.wrong, hints: st.hints, hardNoHint: st.hardNoHint,
      updatedAt: new Date().toISOString()
    };
  }

  function claudeWrite() {
    if (!cRef || !S.canWrite) return;
    if (cWriting) { cDirty = true; return; }
    cWriting = true; cDirty = false;
    cRef.set(claudeDoc(hooks.getState()))
      .then(() => { cRetries = 0; })
      .catch(e => {
        const code = e && e.code;
        if (code === 'unavailable' && cRetries < 3) { cRetries++; cDirty = true; }
        else if (code !== 'resource_exhausted') { S.canWrite = false; changed(); }
      })
      .finally(() => {
        cWriting = false;
        if (cDirty && S.canWrite) setTimeout(claudeWrite, 1200 + Math.random() * 800);
      });
  }

  async function resolveNames() {
    if (!cUser || typeof cUser.profiles !== 'function') return;
    const ids = S.rows.filter(r => !r.nick && !(r.k in S.names)).map(r => r.k).slice(0, 64);
    if (!ids.length) return;
    try {
      const ps = await cUser.profiles(ids);
      ids.forEach(id => { S.names[id] = (ps && ps[id] && ps[id].name) || ''; });
      changed();
    } catch (e) {}
  }

  async function initClaude() {
    S.mode = 'claude';
    try {
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db) { S.mode = 'off'; S.reason = 'local'; changed(); return; }
      cDb = db; cUser = user;
      const uid = user ? await user.id() : null;
      if (uid) {
        S.myKey = uid;
        cRef = db.doc('scores/' + uid);
        try { const me = typeof user.me === 'function' ? await user.me() : null; if (me && me.name) S.names[uid] = me.name; } catch (e) {}
        let cw = null;
        try { cw = typeof user.can === 'function' ? await user.can('data.write') : null; } catch (e) {}
        S.canWrite = cw !== false;
        try {
          const snap = await cRef.get();
          const st = hooks.getState();
          const need = snap.exists ? hooks.mergeRemote(snap.data()) : (st.solved.length > 0 || st.score > 0 || !!st.nick);
          if (need) claudeWrite();
        } catch (e) {}
      } else {
        S.signedIn = false;
      }
      const timer = setTimeout(() => { if (!S.loaded) { S.reason = 'slow'; changed(); } }, 10000);
      db.collection('scores').orderBy('score', 'desc').limit(200).onSnapshot(snap => {
        if (!snap.metadata.fromCache) { clearTimeout(timer); S.reason = ''; }
        S.loaded = true;
        S.rows = snap.docs.filter(d => d.exists).map(d => {
          const x = d.data() || {};
          return { k: d.id, nick: cleanNick(x.nick), score: num(x.score, 5000), solved: num(x.solvedCount, TOTAL_Q) };
        });
        resolveNames();
        changed();
      }, () => { clearTimeout(timer); S.mode = 'off'; S.reason = 'error'; changed(); });
      changed();
    } catch (e) {
      S.mode = 'off'; S.reason = 'error'; changed();
    }
  }

  /* ---------- Cloudflare ---------- */
  const API = 'api/scores';
  let cloudId = null, postTimer = 0, posting = false, postAgain = false;

  async function sha24(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
  }

  function playerId() {
    let id = null;
    try { id = localStorage.getItem('trivia-player-id'); } catch (e) {}
    if (!id || !/^[a-f0-9]{32}$/.test(id)) {
      const a = new Uint8Array(16);
      crypto.getRandomValues(a);
      id = [...a].map(b => b.toString(16).padStart(2, '0')).join('');
      try { localStorage.setItem('trivia-player-id', id); } catch (e) {}
    }
    return id;
  }

  async function fetchRows() {
    const res = await fetch(API, { cache: 'no-store', headers: { accept: 'application/json' } });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return { status: 'missing' };
    const data = await res.json();
    if (res.status === 503 || data.error === 'not_configured') return { status: 'not_configured' };
    if (!res.ok || !data.ok) return { status: 'error' };
    return {
      status: 'ok',
      rows: (data.rows || []).map(r => ({ k: String(r.k || ''), nick: cleanNick(r.nick), score: num(r.score, 5000), solved: num(r.solved, TOTAL_Q) }))
    };
  }

  async function refreshCloud() {
    try {
      const r = await fetchRows();
      if (r.status === 'ok') { S.rows = r.rows; S.loaded = true; S.reason = ''; }
      else if (!S.loaded) { S.mode = 'off'; S.reason = r.status === 'not_configured' ? 'not_configured' : 'local'; }
    } catch (e) {
      if (!S.loaded) { S.mode = 'off'; S.reason = 'local'; }
    }
    changed();
  }

  async function initCloud() {
    if (!window.crypto || !crypto.subtle || !window.fetch) { S.mode = 'off'; S.reason = 'local'; changed(); return; }
    S.mode = 'cloud';
    cloudId = playerId();
    try { S.myKey = await sha24(cloudId); } catch (e) { S.mode = 'off'; S.reason = 'local'; changed(); return; }
    await refreshCloud();
    if (S.mode !== 'cloud') return;
    S.canWrite = true;
    const st = hooks.getState();
    if (st.score > 0 || st.nick) cloudWrite();
    setInterval(() => { if (document.visibilityState === 'visible') refreshCloud(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshCloud(); });
    changed();
  }

  function cloudWrite() {
    if (S.mode !== 'cloud' || !S.canWrite) return;
    clearTimeout(postTimer);
    postTimer = setTimeout(async () => {
      if (posting) { postAgain = true; return; }
      posting = true;
      const st = hooks.getState();
      try {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: cloudId, nick: st.nick, score: st.score, solved: st.solved.length, best: st.best })
        });
        if (res.status === 503) { S.canWrite = false; S.mode = 'off'; S.reason = 'not_configured'; changed(); }
      } catch (e) {}
      posting = false;
      if (postAgain) { postAgain = false; cloudWrite(); }
    }, 900);
  }

  /* ---------- API ציבורי ---------- */
  function init(h) {
    hooks = Object.assign(hooks, h);
    if (window.claude && typeof window.claude.use === 'function') initClaude();
    else if (location.protocol === 'http:' || location.protocol === 'https:') initCloud();
    else { S.mode = 'off'; S.reason = 'local'; changed(); }
  }

  function submit() {
    if (S.mode === 'claude') claudeWrite();
    else if (S.mode === 'cloud') cloudWrite();
  }

  /** שורות לתצוגה, כשהשורה שלי תמיד מעודכנת מהמצב המקומי */
  function rows() {
    let list = S.rows.slice();
    if (S.myKey && S.canWrite) {
      const st = hooks.getState();
      list = list.filter(r => r.k !== S.myKey);
      list.push({ k: S.myKey, nick: st.nick, score: st.score, solved: st.solved.length });
    }
    list = list.filter(r => r.score > 0);
    list.sort((a, b) => b.score - a.score || b.solved - a.solved);
    return list;
  }

  function myRank() {
    if (!S.loaded || !S.canWrite || !S.myKey) return 0;
    return rows().findIndex(r => r.k === S.myKey) + 1;
  }

  function displayName(r) {
    if (r.nick) return r.nick;
    if (S.names[r.k]) return S.names[r.k];
    return S.mode === 'cloud' ? 'שחקן/ית ' + r.k.slice(0, 4).toUpperCase() : 'שחקן/ית';
  }

  return { init, submit, rows, myRank, displayName, state: S };
})();
