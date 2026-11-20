/* =========================================================
   אפקטים: צלילים (Web Audio), קונפטי (Canvas), גלי מגע
   ========================================================= */
const FX = (() => {
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- צלילים ---------- */
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('trivia-sound') === 'off'; } catch (e) {}

  function audio() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { ctx = new C(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, dur, type, gain, delay, slideTo) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    const t = a.currentTime + (delay || 0);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.06, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const sfx = {
    tap() { tone(600, 0.06, 'triangle', 0.035); },
    flip() { tone(240, 0.22, 'sine', 0.035, 0, 720); },
    hint() { tone(880, 0.1, 'sine', 0.045); tone(1318.5, 0.2, 'sine', 0.04, 0.07); },
    correct() {
      tone(523.25, 0.12, 'triangle', 0.07);
      tone(659.25, 0.12, 'triangle', 0.07, 0.08);
      tone(783.99, 0.28, 'triangle', 0.08, 0.16);
    },
    wrong() { tone(247, 0.18, 'square', 0.025, 0, 196); tone(185, 0.3, 'triangle', 0.05, 0.12, 150); },
    achieve() { [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => tone(f, 0.22, 'triangle', 0.055, i * 0.08)); }
  };

  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem('trivia-sound', muted ? 'off' : 'on'); } catch (e) {}
  }

  /* ---------- קונפטי ---------- */
  const canvas = document.getElementById('fx');
  const c2d = canvas ? canvas.getContext('2d') : null;
  let parts = [];
  let raf = 0;
  let dpr = 1;

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  function palette() {
    const cs = getComputedStyle(document.documentElement);
    return ['--primary', '--sky', '--berry', '--primary-c', '--sky-c', '--berry-c']
      .map(v => cs.getPropertyValue(v).trim())
      .filter(Boolean);
  }

  function burst(x, y, opts) {
    if (!c2d || reduced) return;
    const o = Object.assign({ count: 90, spread: 1, power: 1 }, opts || {});
    const cols = palette();
    for (let i = 0; i < o.count; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25 * o.spread;
      const sp = (6 + Math.random() * 9) * o.power;
      parts.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        r: 4 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        shape: i % 3,
        color: cols[i % cols.length] || '#00704A',
        life: 0,
        max: 70 + Math.random() * 40
      });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function drawShape(p) {
    const r = p.r;
    c2d.beginPath();
    if (p.shape === 0) {
      c2d.arc(0, 0, r * 0.6, 0, Math.PI * 2);
    } else if (p.shape === 1) {
      const w = r * 1.4, h = r * 0.8, rr = h / 2;
      c2d.moveTo(-w / 2 + rr, -h / 2);
      c2d.arcTo(w / 2, -h / 2, w / 2, h / 2, rr);
      c2d.arcTo(w / 2, h / 2, -w / 2, h / 2, rr);
      c2d.arcTo(-w / 2, h / 2, -w / 2, -h / 2, rr);
      c2d.arcTo(-w / 2, -h / 2, w / 2, -h / 2, rr);
    } else {
      c2d.moveTo(0, -r * 0.7);
      c2d.lineTo(r * 0.65, r * 0.5);
      c2d.lineTo(-r * 0.65, r * 0.5);
      c2d.closePath();
    }
    c2d.fill();
  }

  function tick() {
    c2d.clearRect(0, 0, canvas.width, canvas.height);
    parts = parts.filter(p => p.life < p.max);
    for (const p of parts) {
      p.life++;
      p.vx *= 0.97;
      p.vy = p.vy * 0.97 + 0.42;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      const a = 1 - Math.max(0, (p.life - p.max * 0.6) / (p.max * 0.4));
      c2d.save();
      c2d.globalAlpha = a;
      c2d.fillStyle = p.color;
      c2d.setTransform(dpr, 0, 0, dpr, p.x * dpr, p.y * dpr);
      c2d.rotate(p.rot);
      c2d.scale(1, Math.abs(Math.cos(p.life * 0.12 + p.rot)) * 0.7 + 0.3);
      drawShape(p);
      c2d.restore();
    }
    if (parts.length) raf = requestAnimationFrame(tick);
    else { raf = 0; c2d.clearRect(0, 0, canvas.width, canvas.height); }
  }

  function burstFrom(el, opts) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, opts);
  }

  /* ---------- גלי מגע (ripple) ---------- */
  document.addEventListener('pointerdown', e => {
    const host = e.target.closest('.btn, .fab, .opt');
    if (!host || host.disabled || reduced) return;
    const r = host.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.width = s.style.height = size + 'px';
    s.style.left = (e.clientX - r.left - size / 2) + 'px';
    s.style.top = (e.clientY - r.top - size / 2) + 'px';
    host.appendChild(s);
    setTimeout(() => s.remove(), 650);
  });

  return { sfx, setMuted, isMuted: () => muted, burst, burstFrom, reduced };
})();
