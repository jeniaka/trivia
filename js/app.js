/* =========================================================
   מוח חד: לוגיקת המשחק
   ========================================================= */
(() => {
  const POINTS = { 'קל': 10, 'בינוני': 20, 'קשה': 30 };
  const HINT_FACTOR = 0.6;                 // שימוש ברמז: 60% מהניקוד
  const DIFFS = ['קל', 'בינוני', 'קשה'];
  const DCLS = { 'קל': 'easy', 'בינוני': 'med', 'קשה': 'hard' };
  const KEYS = ['א', 'ב', 'ג', 'ד'];
  const STORE_KEY = 'logic-riddles-he-v1';
  const TOTAL = PUZZLES.length;
  const VALID = new Set(PUZZLES.map(p => p.id));
  const RING_C = 2 * Math.PI * 52;

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  /* ---------- מצב ---------- */
  const fresh = () => ({ solved: [], attempted: [], score: 0, streak: 0, best: 0, correct: 0, wrong: 0, hints: 0, hardNoHint: 0, nick: '' });
  const num = x => { x = Number(x); return isFinite(x) && x > 0 ? Math.floor(x) : 0; };
  const ids = a => Array.isArray(a) ? [...new Set(a.filter(x => VALID.has(x)))] : [];
  const cleanNick = s => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20) : '';
  function sanitize(s) {
    if (!s || typeof s !== 'object') return fresh();
    return {
      solved: ids(s.solved), attempted: ids(s.attempted),
      score: num(s.score), streak: num(s.streak), best: num(s.best),
      correct: num(s.correct), wrong: num(s.wrong), hints: num(s.hints), hardNoHint: num(s.hardNoHint),
      nick: cleanNick(s.nick)
    };
  }
  function loadLocal() { try { return sanitize(JSON.parse(localStorage.getItem(STORE_KEY))); } catch (e) { return fresh(); } }
  function saveLocal() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }
  function save() { saveLocal(); Board.submit(); }

  let state = loadLocal();
  let filter = 'הכל';
  let current = null, order = [], answered = false, hintUsed = false, busy = false;

  const isSolved = id => state.solved.includes(id);
  const pool = () => filter === 'הכל' ? PUZZLES : PUZZLES.filter(p => p.difficulty === filter);
  const solvedOf = d => PUZZLES.filter(p => p.difficulty === d && isSolved(p.id)).length;
  const totalOf = d => PUZZLES.filter(p => p.difficulty === d).length;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function mergeRemote(raw) {
    const r = sanitize(raw);
    const before = JSON.stringify(state);
    state.solved = [...new Set([...state.solved, ...r.solved])];
    state.attempted = [...new Set([...state.attempted, ...r.attempted])];
    ['score', 'best', 'correct', 'wrong', 'hints', 'hardNoHint'].forEach(k => { state[k] = Math.max(state[k], r[k]); });
    if (!state.streak) state.streak = r.streak;
    if (!state.nick) state.nick = r.nick;
    saveLocal();
    renderHome();
    return JSON.stringify(state) !== before || JSON.stringify(sanitize(state)) !== JSON.stringify(r);
  }

  /* =========================================================
     הישגים
     ========================================================= */
  const ACH = [
    { id: 'first', icon: '🌱', name: 'צעד ראשון', desc: 'לפתור חידה ראשונה', test: s => s.solved.length >= 1 },
    { id: 's10', icon: '🔥', name: 'מתחמם', desc: 'לפתור 10 חידות', test: s => s.solved.length >= 10 },
    { id: 's25', icon: '🧩', name: 'רבע מהדרך', desc: 'לפתור 25 חידות', test: s => s.solved.length >= 25 },
    { id: 's50', icon: '⛰️', name: 'חצי הדרך', desc: 'לפתור 50 חידות', test: s => s.solved.length >= 50 },
    { id: 'st5', icon: '⚡', name: 'על הגל', desc: 'רצף של 5 תשובות נכונות', test: s => s.best >= 5 },
    { id: 'st10', icon: '🚀', name: 'בלתי ניתן לעצירה', desc: 'רצף של 10 תשובות נכונות', test: s => s.best >= 10 },
    { id: 'st25', icon: '☄️', name: 'מכונת היגיון', desc: 'רצף של 25 תשובות נכונות', test: s => s.best >= 25 },
    { id: 'nohint', icon: '🧠', name: 'בלי עזרה', desc: 'לפתור 10 חידות קשות בלי רמז', test: s => s.hardNoHint >= 10 },
    { id: 'easy', icon: '🌿', name: 'יסודות חזקים', desc: 'לפתור את כל החידות הקלות', test: () => solvedOf('קל') === totalOf('קל') },
    { id: 'med', icon: '💧', name: 'חשיבה צלולה', desc: 'לפתור את כל החידות הבינוניות', test: () => solvedOf('בינוני') === totalOf('בינוני') },
    { id: 'hard', icon: '💎', name: 'גאון אמיתי', desc: 'לפתור את כל החידות הקשות', test: () => solvedOf('קשה') === totalOf('קשה') },
    { id: 'p1000', icon: '🏅', name: 'מועדון האלף', desc: 'לצבור 1,000 נקודות', test: s => s.score >= 1000 },
    { id: 'p2000', icon: '🏆', name: 'אלפיים', desc: 'לצבור 2,000 נקודות', test: s => s.score >= 2000 },
    { id: 'all', icon: '👑', name: 'אלוף ההיגיון', desc: 'לפתור את כל 100 החידות', test: s => s.solved.length === TOTAL }
  ];
  const unlocked = () => new Set(ACH.filter(a => a.test(state)).map(a => a.id));

  function renderAch() {
    const on = unlocked();
    $('#achCount').textContent = on.size + '/' + ACH.length;
    const g = $('#achGrid');
    g.textContent = '';
    ACH.forEach(a => {
      const d = document.createElement('div');
      d.className = 'ach' + (on.has(a.id) ? ' on' : '');
      const b = document.createElement('span'); b.className = 'badge'; b.textContent = a.icon;
      const t = document.createElement('div');
      const n = document.createElement('b'); n.textContent = a.name;
      const sm = document.createElement('small'); sm.textContent = a.desc;
      t.append(n, sm);
      d.append(b, t);
      g.appendChild(d);
    });
  }

  /* =========================================================
     טבלת מובילים
     ========================================================= */
  let lbAnimated = false;
  function renderLeaderboard() {
    const B = Board.state;
    const note = $('#lbNote'), list = $('#lbList'), form = $('#nickForm');
    list.textContent = '';
    form.hidden = !(B.canWrite && B.myKey && B.mode !== 'off');
    if (!form.hidden && document.activeElement !== $('#nickInput')) $('#nickInput').value = state.nick;

    let msg = '';
    if (B.mode === 'off') {
      msg = B.reason === 'not_configured'
        ? 'טבלת המובילים עוד לא הוגדרה בשרת. ההתקדמות שלך נשמרת במכשיר הזה.'
        : B.reason === 'error'
          ? 'טבלת המובילים לא זמינה כרגע. ההתקדמות שלך נשמרת במכשיר הזה.'
          : 'טבלת המובילים פעילה באתר המשחק. כאן ההתקדמות נשמרת רק במכשיר הזה.';
    } else if (!B.loaded) {
      msg = B.reason === 'slow' ? 'הטבלה נטענת לאט. ננסה שוב ברקע.' : 'טוען את טבלת המובילים…';
    }
    const rows = B.mode !== 'off' && B.loaded ? Board.rows() : [];
    if (B.mode !== 'off' && B.loaded) {
      if (!rows.length) msg = 'הטבלה ריקה. פתרו חידה ראשונה ותפסו את המקום הראשון.';
      if (B.mode === 'claude' && B.myKey && !B.canWrite) msg += (msg ? ' ' : '') + 'אפשר לצפות בטבלה, אבל אין לך הרשאה להופיע בה.';
      if (B.mode === 'claude' && !B.signedIn) msg += (msg ? ' ' : '') + 'כדי להופיע בטבלה צריך להתחבר ל-Claude.';
      if (B.mode === 'cloud' && !state.nick && state.score > 0) msg += (msg ? ' ' : '') + 'בחרו שם כדי שחברים יזהו אתכם בטבלה.';
    }
    note.textContent = msg;
    note.hidden = !msg;

    const mk = (r, rank) => {
      const li = document.createElement('li');
      li.className = (rank <= 3 ? 'podium p' + rank : '') + (r.k === B.myKey ? ' me' : '');
      if (lbAnimated) li.style.animation = 'none';
      else li.style.animationDelay = Math.min(rank, 10) * 35 + 'ms';
      const rk = document.createElement('span'); rk.className = 'rk'; rk.textContent = rank;
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = Board.displayName(r);
      if (r.k === B.myKey) { const t = document.createElement('span'); t.className = 'me-tag'; t.textContent = 'את/ה'; nm.appendChild(t); }
      const sv = document.createElement('span'); sv.className = 'sv'; sv.textContent = r.solved + '/' + TOTAL;
      const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = r.score.toLocaleString('he-IL');
      li.append(rk, nm, sv, sc);
      return li;
    };
    rows.slice(0, 10).forEach((r, i) => list.appendChild(mk(r, i + 1)));
    const mine = rows.findIndex(r => r.k === B.myKey);
    if (mine >= 10) {
      const gap = document.createElement('li'); gap.className = 'gap'; gap.textContent = '• • •';
      list.appendChild(gap);
      list.appendChild(mk(rows[mine], mine + 1));
    }
    if (rows.length) lbAnimated = true;
    renderRankLine();
  }

  function renderRankLine() {
    const el = $('#rankLine');
    el.textContent = '';
    const r = Board.myRank();
    if (r > 0) {
      el.append('המקום שלך בטבלה: ');
      const b = document.createElement('b'); b.textContent = r;
      el.append(b, ' מתוך ' + Board.rows().length);
    }
  }

  /* =========================================================
     הנתונים שלי
     ========================================================= */
  function renderMe() {
    const answers = state.correct + state.wrong;
    $('#meAcc').textContent = answers ? Math.round(state.correct / answers * 100) + '%' : '–';
    $('#meOk').textContent = state.correct;
    $('#meBad').textContent = state.wrong;
    $('#meHints').textContent = state.hints;
    const box = $('#catList');
    box.textContent = '';
    [...new Set(PUZZLES.map(p => p.category))].map(c => {
      const all = PUZZLES.filter(p => p.category === c);
      return { c, total: all.length, done: all.filter(p => isSolved(p.id)).length };
    }).sort((a, b) => b.total - a.total).forEach(x => {
      const row = document.createElement('div'); row.className = 'cat-row';
      const lbl = document.createElement('div'); lbl.className = 'lbl';
      const n = document.createElement('span'); n.textContent = x.c;
      const v = document.createElement('span'); v.textContent = x.done + '/' + x.total;
      lbl.append(n, v);
      const bar = document.createElement('div'); bar.className = 'bar';
      const i = document.createElement('i'); bar.appendChild(i);
      row.append(lbl, bar);
      box.appendChild(row);
      requestAnimationFrame(() => { i.style.width = (x.done / x.total * 100) + '%'; });
    });
  }

  /* =========================================================
     מסך הבית
     ========================================================= */
  function renderRing() {
    const seg = [['.ring-easy', solvedOf('קל')], ['.ring-med', solvedOf('בינוני')], ['.ring-hard', solvedOf('קשה')]];
    let start = 0;
    seg.forEach(([sel, n]) => {
      const el = $(sel);
      const len = n / TOTAL * RING_C;
      const vis = Math.max(len - (len > 6 ? 4 : 0), 0);
      el.style.strokeDasharray = vis + ' ' + RING_C;
      el.style.strokeDashoffset = -start;
      el.style.opacity = n ? 1 : 0;
      start += len;
    });
  }

  function animateNumber(el, to) {
    const from = Number(el.dataset.v || 0);
    el.dataset.v = to;
    if (from === to || FX.reduced) { el.textContent = to.toLocaleString('he-IL'); return; }
    const t0 = performance.now(), d = 700;
    const step = t => {
      const k = Math.min(1, (t - t0) / d);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e).toLocaleString('he-IL');
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderHome() {
    animateNumber($('#progNum'), state.solved.length);
    $('#progTotal').textContent = TOTAL;
    renderRing();
    $('#miniEasyT').textContent = solvedOf('קל') + '/' + totalOf('קל');
    $('#miniMedT').textContent = solvedOf('בינוני') + '/' + totalOf('בינוני');
    $('#miniHardT').textContent = solvedOf('קשה') + '/' + totalOf('קשה');
    animateNumber($('#stScore'), state.score);
    animateNumber($('#stStreak'), state.streak);
    animateNumber($('#stBest'), state.best);

    $$('.seg').forEach(c => {
      const on = c.dataset.f === filter;
      c.classList.toggle('active', on);
      c.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    const allDone = pool().every(x => isSolved(x.id));
    $('#doneNote').classList.toggle('show', allDone);
    $('#startLabel').textContent = allDone ? 'תרגול חוזר' : (state.attempted.length ? 'המשך לפתור' : 'התחל לפתור');

    renderGrid();
    renderAch();
    renderMe();
    renderLeaderboard();
    moveTabInd();
  }

  function renderGrid() {
    const g = $('#grid');
    if (!g.children.length) {
      PUZZLES.forEach(p => {
        const t = document.createElement('button');
        t.className = 'tile ' + DCLS[p.difficulty];
        t.textContent = p.id;
        t.dataset.id = p.id;
        t.title = 'חידה ' + p.id + ', ' + p.difficulty + ', ' + p.category;
        t.setAttribute('aria-label', t.title);
        t.addEventListener('click', () => { FX.sfx.tap(); goPlay(p); });
        g.appendChild(t);
      });
    }
    [...g.children].forEach(t => {
      const p = PUZZLES[Number(t.dataset.id) - 1];
      t.classList.toggle('solved', isSolved(p.id));
      t.classList.toggle('hide', filter !== 'הכל' && p.difficulty !== filter);
    });
  }

  function moveTabInd() {
    const a = $('.tab.active');
    const ind = $('#tabInd');
    if (!a || !a.offsetWidth) return;
    const w = Math.min(64, a.offsetWidth * 0.6);
    ind.style.width = w + 'px';
    ind.style.left = (a.offsetLeft + (a.offsetWidth - w) / 2) + 'px';
  }

  /* =========================================================
     מעברי מסכים
     ========================================================= */
  function showScreen(name) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    const el = $('#' + name);
    el.classList.add('active');
    if (!FX.reduced) el.animate([{ opacity: 0, transform: 'translateY(18px) scale(.99)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,0,0,1)' });
    window.scrollTo({ top: 0 });
    if (name === 'home') requestAnimationFrame(moveTabInd);
  }

  function goPlay(p) {
    showScreen('play');
    fillPuzzle(p);
    entrance(false);
  }

  function pickNext(excludeId) {
    const p = pool();
    let c = p.filter(x => !isSolved(x.id) && x.id !== excludeId);
    if (!c.length) c = p.filter(x => x.id !== excludeId);
    if (!c.length) c = p;
    return pick(c);
  }

  /* ---------- מעבר תלת ממדי בין חידות: סיבוב קובייה ---------- */
  function cubeOrigin(card) { return '50% 50% ' + (-card.offsetWidth / 2) + 'px'; }

  function entrance(fromCube) {
    const card = $('#card');
    if (FX.reduced) return Promise.resolve();
    card.style.transformOrigin = fromCube ? cubeOrigin(card) : '50% 50%';
    const kf = fromCube
      ? [{ transform: 'rotateY(-90deg)', opacity: .35 }, { transform: 'rotateY(6deg)', opacity: 1, offset: .75 }, { transform: 'rotateY(0deg)', opacity: 1 }]
      : [{ transform: 'rotateX(16deg) translateY(40px) scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }];
    const anim = card.animate(kf, { duration: fromCube ? 520 : 560, easing: 'cubic-bezier(.2,0,0,1)' });
    return anim.finished.then(() => { card.style.transformOrigin = ''; }).catch(() => {});
  }

  async function transitionTo(p) {
    if (busy) return;
    busy = true;
    tilt.style.transform = '';
    const card = $('#card');
    FX.sfx.flip();
    if (!FX.reduced) {
      card.style.transformOrigin = cubeOrigin(card);
      try {
        await card.animate(
          [{ transform: 'rotateY(0deg)', opacity: 1 }, { transform: 'rotateY(90deg)', opacity: .35 }],
          { duration: 320, easing: 'cubic-bezier(.3,0,.8,.15)', fill: 'forwards' }
        ).finished;
      } catch (e) {}
    }
    window.scrollTo({ top: 0 });
    fillPuzzle(p);
    card.getAnimations().forEach(a => a.cancel());
    await entrance(true);
    busy = false;
  }

  /* =========================================================
     מסך החידה
     ========================================================= */
  function updatePts() {
    const el = $('#tPts');
    const practice = isSolved(current.id);
    el.className = 'pts' + (practice ? ' practice' : '');
    el.textContent = practice ? 'תרגול, ללא ניקוד' : (hintUsed ? Math.round(POINTS[current.difficulty] * HINT_FACTOR) : POINTS[current.difficulty]) + ' נקודות';
  }

  function updateHud(gained) {
    $('#hScore').textContent = state.score.toLocaleString('he-IL');
    $('#hStreak').textContent = state.streak;
    $('#hudStreak').classList.toggle('hot', state.streak >= 3);
    if (gained > 0) {
      const hud = $('#hudScore');
      hud.classList.add('bump');
      setTimeout(() => hud.classList.remove('bump'), 320);
      const f = document.createElement('span');
      f.className = 'float';
      f.textContent = '+' + gained;
      hud.appendChild(f);
      setTimeout(() => f.remove(), 1250);
    }
  }

  function fillPuzzle(p) {
    current = p; answered = false; hintUsed = false;
    order = shuffle([0, 1, 2, 3]);
    const card = $('#card');
    card.classList.remove('shake', 'pop');

    const d = $('#tDiff');
    d.textContent = p.difficulty;
    d.className = 'diff ' + DCLS[p.difficulty];
    $('#tCat').textContent = p.category;
    $('#tId').textContent = 'חידה ' + p.id;
    updatePts();

    $('#question').textContent = p.question;
    $('#hintText').textContent = p.hint;
    ['#hintWrap', '#fbWrap'].forEach(sel => {
      const el = $(sel);
      el.style.transition = 'none';
      el.classList.remove('open');
      void el.offsetHeight;
      el.style.transition = '';
    });
    const hb = $('#hintBtn');
    hb.disabled = false;
    hb.classList.remove('used');
    $('#hintLabel').textContent = 'רמז';
    $('#hintCost').textContent = isSolved(p.id) ? '' : 'מוריד 40% מהניקוד';

    const box = $('#options');
    box.textContent = '';
    order.forEach((orig, i) => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.style.animationDelay = (120 + i * 60) + 'ms';
      const k = document.createElement('span'); k.className = 'key'; k.textContent = KEYS[i];
      const t = document.createElement('span'); t.className = 'txt'; t.textContent = p.options[orig];
      const m = document.createElement('span'); m.className = 'mark2 msr fill';
      b.append(k, t, m);
      b.addEventListener('click', () => choose(i));
      box.appendChild(b);
    });

    $('#feedback').classList.remove('open');
    updateHud(0);
  }

  function revealHint() {
    if (!current || $('#hintBtn').disabled) return;
    if (!answered && !isSolved(current.id)) { hintUsed = true; state.hints++; saveLocal(); }
    FX.sfx.hint();
    $('#hintWrap').classList.add('open');
    const hb = $('#hintBtn');
    hb.disabled = true;
    hb.classList.add('used');
    $('#hintLabel').textContent = 'הרמז גלוי';
    $('#hintCost').textContent = hintUsed ? 'הניקוד הופחת' : '';
    updatePts();
  }

  function choose(i) {
    if (answered || !current || busy) return;
    answered = true;
    const p = current;
    const ok = order[i] === p.correctIndex;
    const first = !isSolved(p.id);
    const before = unlocked();
    const btns = $$('.opt');

    btns.forEach((b, j) => {
      b.disabled = true;
      b.style.animationDelay = '0ms';
      const m = b.querySelector('.mark2');
      if (order[j] === p.correctIndex) { b.classList.add('correct'); m.textContent = 'check'; }
      else if (j === i) { b.classList.add('wrong'); m.textContent = 'close'; }
      else b.classList.add('dim');
    });

    let gained = 0, bonus = 0;
    if (ok) {
      state.correct++;
      state.streak++;
      state.best = Math.max(state.best, state.streak);
      if (first) {
        bonus = Math.min(state.streak - 1, 5) * 2;
        gained = (hintUsed ? Math.round(POINTS[p.difficulty] * HINT_FACTOR) : POINTS[p.difficulty]) + bonus;
        state.score += gained;
        state.solved.push(p.id);
        if (p.difficulty === 'קשה' && !hintUsed) state.hardNoHint++;
      }
    } else {
      state.wrong++;
      state.streak = 0;
    }
    if (!state.attempted.includes(p.id)) state.attempted.push(p.id);
    save();
    updateHud(gained);

    const card = $('#card');
    if (ok) {
      FX.sfx.correct();
      card.classList.add('pop');
      FX.burstFrom(btns[i], { count: first ? 90 : 40, power: first ? 1 : .7 });
    } else {
      FX.sfx.wrong();
      card.classList.add('shake');
    }

    const fb = $('#feedback');
    fb.className = 'feedback open ' + (ok ? 'ok' : 'bad');
    $('#fbIcon').textContent = ok ? 'check' : 'close';
    $('#fbTitle').textContent = ok
      ? pick(['נכון, כל הכבוד!', 'מבריק. בדיוק כך.', 'יש! מוח חד באמת.', 'פתרת את זה.'])
      : pick(['לא הפעם.', 'כמעט, אבל לא.', 'טעות. ועכשיו תדע.']);
    const chips = [];
    if (ok && first) {
      chips.push('+' + gained + ' נקודות');
      if (hintUsed) chips.push('עם רמז');
      if (bonus) chips.push('בונוס רצף +' + bonus);
    } else if (ok) {
      chips.push('כבר פתרת אותה, בלי ניקוד נוסף');
    } else {
      chips.push('הרצף התאפס');
    }
    if (ok) chips.push('רצף ' + state.streak);
    const r = Board.myRank();
    if (ok && first && r > 0) chips.push('מקום ' + r + ' בטבלה');
    const sub = $('#fbSub');
    sub.textContent = '';
    chips.forEach(c => { const sp = document.createElement('span'); sp.className = 'fb-chip'; sp.textContent = c; sub.appendChild(sp); });
    $('#fbExp').textContent = p.explanation;
    if (!hintUsed) { $('#hintLabel').textContent = 'הצג רמז'; $('#hintCost').textContent = ''; }
    updatePts();

    const after = unlocked();
    ACH.filter(a => after.has(a.id) && !before.has(a.id)).forEach((a, k) => {
      setTimeout(() => { FX.sfx.achieve(); FX.burst(window.innerWidth / 2, window.innerHeight - 40, { count: 60, power: 1.2 }); }, 700 + k * 900);
      toast(a.icon + ' הישג חדש: ' + a.name);
    });

    $('#fbWrap').classList.add('open');
    setTimeout(() => {
      const rect = $('#fbWrap').getBoundingClientRect();
      if (rect.top > window.innerHeight * 0.6) window.scrollBy({ top: rect.top - window.innerHeight * 0.32, behavior: FX.reduced ? 'auto' : 'smooth' });
    }, 280);
  }

  function goNext() {
    if (!current || busy) return;
    transitionTo(pickNext(current.id));
  }

  /* ---------- Snackbar ---------- */
  const q = [];
  let showing = false;
  function toast(msg) { q.push(msg); if (!showing) nextToast(); }
  function nextToast() {
    const m = q.shift();
    if (!m) { showing = false; return; }
    showing = true;
    const t = $('#toast');
    t.textContent = m;
    t.classList.add('show');
    setTimeout(() => { t.classList.remove('show'); setTimeout(nextToast, 420); }, 2400);
  }

  /* ---------- ערכת צבעים וצליל ---------- */
  function applyTheme(t, persist) {
    document.documentElement.dataset.theme = t;
    $('#themeIcon').textContent = t === 'dark' ? 'light_mode' : 'dark_mode';
    $('#themeBtn').setAttribute('aria-label', t === 'dark' ? 'מצב בהיר' : 'מצב כהה');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'dark' ? '#0E1411' : '#F4F8F5';
    if (persist) { try { localStorage.setItem('trivia-theme', t); } catch (e) {} }
  }
  function applySound() {
    const m = FX.isMuted();
    ['#soundIcon', '#soundIcon2'].forEach(s => { $(s).textContent = m ? 'volume_off' : 'volume_up'; });
    ['#soundBtn', '#soundBtn2'].forEach(s => $(s).setAttribute('aria-label', m ? 'הפעלת צלילים' : 'השתקת צלילים'));
  }

  /* =========================================================
     אירועים
     ========================================================= */
  $$('.seg').forEach(c => c.addEventListener('click', () => { filter = c.dataset.f; FX.sfx.tap(); renderHome(); }));
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => { const on = x === t; x.classList.toggle('active', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $$('.tab-body').forEach(b => b.classList.toggle('active', b.id === 'tab-' + t.dataset.tab));
    if (t.dataset.tab === 'lb') { lbAnimated = false; renderLeaderboard(); }
    FX.sfx.tap();
    moveTabInd();
  }));
  window.addEventListener('resize', moveTabInd);

  $('#startBtn').addEventListener('click', () => { FX.sfx.tap(); goPlay(pickNext(null)); });
  $('#backBtn').addEventListener('click', () => { renderHome(); showScreen('home'); });
  $('#hintBtn').addEventListener('click', revealHint);
  $('#nextBtn').addEventListener('click', goNext);
  $('#skipBtn').addEventListener('click', goNext);
  $('#themeBtn').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true));
  ['#soundBtn', '#soundBtn2'].forEach(s => $(s).addEventListener('click', () => { FX.setMuted(!FX.isMuted()); applySound(); FX.sfx.tap(); }));

  $('#nickForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = cleanNick($('#nickInput').value);
    if (v === state.nick) { toast('השם לא השתנה'); return; }
    state.nick = v;
    save();
    renderLeaderboard();
    toast(v ? 'השם נשמר: ' + v : 'השם נמחק');
  });

  let armed = false, armTimer;
  $('#resetBtn').addEventListener('click', () => {
    const b = $('#resetBtn');
    if (!armed) {
      armed = true;
      b.classList.add('armed');
      $('#resetLabel').textContent = 'לחץ שוב כדי לאפס הכל';
      armTimer = setTimeout(() => { armed = false; b.classList.remove('armed'); $('#resetLabel').textContent = 'איפוס התקדמות'; }, 3500);
      return;
    }
    clearTimeout(armTimer);
    armed = false;
    b.classList.remove('armed');
    $('#resetLabel').textContent = 'איפוס התקדמות';
    const nick = state.nick;
    state = fresh();
    state.nick = nick;
    save();
    renderHome();
    toast('ההתקדמות אופסה');
  });

  document.addEventListener('keydown', e => {
    if (!$('#play').classList.contains('active') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (['1', '2', '3', '4'].includes(k)) choose(+k - 1);
    else if (k === 'h' || k === 'י') revealHint();
    else if (k === 's' || k === 'ד') goNext();
    else if (k === 'enter' && answered) { e.preventDefault(); goNext(); }
    else if (k === 'escape') { renderHome(); showScreen('home'); }
  });

  /* ---------- פרלקסה והטיה ---------- */
  const bgs = $('#bgShapes');
  window.addEventListener('pointermove', e => {
    if (FX.reduced || e.pointerType !== 'mouse') return;
    bgs.style.setProperty('--px', (e.clientX / window.innerWidth - .5).toFixed(3));
    bgs.style.setProperty('--py', (e.clientY / window.innerHeight - .5).toFixed(3));
  }, { passive: true });
  const stage = $('#stage'), tilt = $('#tilt');
  stage.addEventListener('pointermove', e => {
    if (FX.reduced || e.pointerType !== 'mouse' || busy) return;
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    tilt.style.transform = 'rotateY(' + (x * 5).toFixed(2) + 'deg) rotateX(' + (-y * 4).toFixed(2) + 'deg)';
  });
  stage.addEventListener('pointerleave', () => { tilt.style.transform = ''; });

  /* ---------- הפעלה ---------- */
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', false);
  applySound();
  renderHome();
  Board.init({ getState: () => state, mergeRemote, onChange: () => { renderLeaderboard(); } });

  // לבדיקות אוטומטיות בלבד
  window.__trivia = { get state() { return state; }, get current() { return current; }, get order() { return order; }, get busy() { return busy; } };
})();
