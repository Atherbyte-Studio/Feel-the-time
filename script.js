'use strict';
/* ===== CONFIG: grading, in MILLISECONDS away from the target (inclusive) — edit here =====
   PERFECT is the exact millisecond (the time shown on screen equals the target, e.g. 3.00). The big celebration is
   only for PERFECT, a smaller one for AMAZING and GREAT; GOOD is a polite smile; further away the rabbit gets sadder
   the further you were (see sadFor). */
const GRADES = [
  { id: 'PERFECT', max: 0,   pts: 1000, pose: 'dance',   win: true,  msg: ['PERFECT!'] },
  { id: 'AMAZING', max: 15,  pts: 600,  pose: 'excited', win: true,  msg: ['مذهل! تقريبًا بالضبط!', 'AMAZING! Wow!'] },
  { id: 'GREAT',   max: 40,  pts: 300,  pose: 'happy',   win: true,  msg: ['واو! كنت قريبًا جدًا!', 'So close! Great!'] },
  { id: 'GOOD',    max: 90,  pts: 120,  pose: 'smile',   win: true,  msg: ['جيد! حاول بدقة أكبر', 'Good! A little closer…'] },
  { id: 'CLOSE',   max: 250, pts: 30,   pose: 'meh',     win: false, msg: ['قريب... بس مش كفاية!', 'Hmm... not quite!'] },
  { id: 'MISS',    max: Infinity, pts: 0, pose: 'sad',  win: false, msg: ['أوووه! جرّب مرة ثانية', 'Oh no... try again!'] }
];
const sadFor = ms => Math.min(1, Math.max(0, (ms - 250) / 1000));   // 0 just past CLOSE .. 1 a full second away: how sad the rabbit is
const LEVEL_MULT = { 1: 1, 3: 1.25, 5: 1.5 }, KEYMAP = { Digit1: 1, Digit2: 3, Digit3: 5 };
const MIN_PRESS_MS = 150, LOCK_MS = 450, STREAK_BONUS = 25, STREAK_CAP = 10, KEY = 'stopTheTimer.v1';
const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fresh = () => ({ rounds: 0, perfects: 0, streak: 0, bestStreak: 0, points: 0, best: {}, sound: true });
let store = fresh();
try { store = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };

/* ===== Character: the rabbit is drawn by rabbit.js (no image) ===== */
let mood = 'idle', moodT = 0, hopAt = -9, waveT = 0, sadLevel = 0.5;
const ptr = { x: 0, y: 0 };
const cv3 = $('c3d'), g = cv3.getContext('2d');
let dpr = 1;
function fit() { dpr = Math.min(devicePixelRatio || 1, 2); cv3.width = cv3.clientWidth * dpr; cv3.height = cv3.clientHeight * dpr; }
new ResizeObserver(fit).observe($('stage')); fit();
const now = () => performance.now() / 1000;
const P = Rabbit.initial(), SNAPPY = new Set(['hop', 'lean', 'shake', 'headRot', 'lx', 'ly', 'rx', 'ry', 'fl', 'fr', 'squash', 'eye', 'earWig']);
let lastFrame = now();
function frame() {
  requestAnimationFrame(frame);
  const w = cv3.clientWidth, h = cv3.clientHeight; if (!w || !h) return;
  const t = now(), dt = Math.min(0.05, t - lastFrame); lastFrame = t;
  const tg = Rabbit.pose(mood, t, sadLevel);
  for (const k of Rabbit.KEYS) P[k] += (tg[k] - P[k]) * (1 - Math.exp(-dt * (SNAPPY.has(k) ? 24 : 9)));   // frame-rate independent easing
  const hd = t - hopAt, extra = hd < 0.5 ? Math.sin(hd / 0.5 * Math.PI) * 60 : 0;                              // a small jump on a tap
  const s = Math.min(h * 0.97 / Rabbit.H, w * 0.95 / Rabbit.W), fx = w / 2, fy = h * 0.97;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  g.save(); g.translate(fx, fy - 8 * s); g.scale(1, 0.2);                  // glowing platform (shrinks while jumping)
  const R = Rabbit.W * s * 0.6 * (1 - Math.min(0.25, (P.hop + extra) / 400)), pg = g.createRadialGradient(0, 0, 0, 0, 0, R); pg.addColorStop(0, 'rgba(139,92,246,.6)'); pg.addColorStop(1, 'rgba(139,92,246,0)');
  g.fillStyle = pg; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(34,211,238,.65)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, R * 0.8, 0, Math.PI * 2); g.stroke(); g.restore();
  g.save(); g.translate(fx, fy); g.scale(s, s); g.translate(-Rabbit.W / 2, -Rabbit.FLOOR);
  Rabbit.draw(g, Object.assign({}, P, { hop: P.hop + extra }), t, mood, ptr, reduced);
  g.restore();
}
frame();
function setMood(m, level) { mood = m; moodT = now(); if (level != null) sadLevel = level; }
const hop = () => { hopAt = now(); };
addEventListener('pointermove', e => { ptr.x = (e.clientX / innerWidth - 0.5) * 2; ptr.y = (e.clientY / innerHeight - 0.5) * 2; });
$('stage').addEventListener('pointerdown', () => {
  if (state !== 'menu') return;
  audio(); SFX.boing(); musicSync(); setMood('wave'); hop();
  clearTimeout(waveT); waveT = setTimeout(() => { if (state === 'menu' && mood === 'wave') setMood('idle'); }, 1500);
});

/* ===== UI helpers, stats, audio, confetti ===== */
let state = 'menu', level = 3, t0 = 0, lockUntil = 0, rev = null;
const setState = s => { state = s; document.body.dataset.state = s; if (document.activeElement) document.activeElement.blur(); musicSync(); };
const say = () => {};
const fmtBest = ms => ms == null ? '—' : '±' + (ms / 1000).toFixed(2) + 's';
function renderStats() {
  $('stBest').textContent = fmtBest(store.best[level]); $('stPts').textContent = store.points.toLocaleString(); $('stStreak').textContent = store.streak;
  $('fRounds').textContent = store.rounds; $('fPerf').textContent = store.perfects; $('fBS').textContent = store.bestStreak;
  $('snd').textContent = store.sound ? 'SOUND ON' : 'SOUND OFF'; $('snd').setAttribute('aria-pressed', store.sound);
}
let ac = null;
function audio() {
  if (!store.sound) return null;
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (ac.state === 'suspended') ac.resume(); return ac;
}
function tone(f, d, type = 'sine', at = 0, v = 0.12) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + at;
  o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.05);
}
const mf = m => 440 * Math.pow(2, (m - 69) / 12);
function slide(f0, f1, d, type = 'sine', at = 0, v = 0.12) {
  const a = audio(); if (!a) return; const o = a.createOscillator(), gn = a.createGain(), t = a.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
  gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(gn); gn.connect(a.destination); o.start(t); o.stop(t + d + 0.05);
}
function noise(d, f0, f1, at = 0, v = 0.15, q = 1) {
  const a = audio(); if (!a) return; const buf = a.createBuffer(1, a.sampleRate * d, a.sampleRate), c = buf.getChannelData(0);
  for (let i = 0; i < c.length; i++) c[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(), fl = a.createBiquadFilter(), gn = a.createGain(), t = a.currentTime + at;
  src.buffer = buf; fl.type = 'bandpass'; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + d);
  gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d); src.connect(fl); fl.connect(gn); gn.connect(a.destination); src.start(t);
}
const arp = (notes, step, type, v) => notes.forEach((n, i) => tone(mf(n), 0.22, type, i * step, v));
const SFX = {
  click: () => tone(900, 0.05, 'square', 0, 0.04),
  boing: () => { slide(260, 720, 0.28, 'sine', 0, 0.16); slide(520, 1000, 0.2, 'triangle', 0.03, 0.05); },
  start: () => { noise(0.4, 300, 3500, 0, 0.14); arp([72, 79], 0.1, 'triangle', 0.1); },
  stop: () => { slide(200, 55, 0.25, 'sine', 0, 0.35); tone(1500, 0.03, 'square', 0, 0.07); noise(0.08, 3000, 800, 0, 0.12); },
  sad: (L = 0.5) => [0, 0.42, 0.84].forEach((d, i) => { slide(330 - i * (30 + 40 * L), 250 - i * (30 + 40 * L), i === 2 ? 0.4 + 0.6 * L : 0.38, 'sawtooth', d, 0.05 + 0.04 * L); slide(6 + i, 5, 0.3, 'sine', d, 0.0001); }),
  smile: () => arp([72, 76, 79], 0.1, 'triangle', 0.07),
  meh: () => { slide(392, 330, 0.25, 'triangle', 0, 0.1); slide(330, 262, 0.4, 'triangle', 0.25, 0.1); },
  happy: () => { arp([72, 76, 79, 84], 0.09, 'triangle', 0.11); noise(0.5, 1800, 5000, 0.1, 0.05, 2); },
  excited: () => { arp([72, 76, 79, 84, 88, 91], 0.07, 'triangle', 0.11); noise(1.2, 1200, 4000, 0.1, 0.09, 0.8); for (let i = 0; i < 8; i++) noise(0.1, 1500 + Math.random() * 2500, 3000, 0.4 + i * 0.1, 0.05, 0.8); },
  dance: () => { arp([72, 76, 79, 84, 88, 91, 96], 0.08, 'square', 0.06); arp([60, 64, 67], 0.0, 'sawtooth', 0.05); noise(2, 1000, 4500, 0.2, 0.1, 0.7); for (let i = 0; i < 24; i++) noise(0.09, 1500 + Math.random() * 3000, 3200, 0.5 + i * 0.07 + Math.random() * 0.05, 0.05, 0.8); [96, 100, 103, 108].forEach((n, i) => tone(mf(n), 0.5, 'sine', 0.7 + i * 0.1, 0.05)); }
};
/* background music: soft synth loop, plays in menu/results, fades out while a round is running */
let mGain = null, mTimer = 0, mStep = 0, mNext = 0;
const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
function musicSync() {
  const a = audio(); if (!a || !store.sound) { if (mGain && ac) mGain.gain.setTargetAtTime(0, ac.currentTime, 0.2); return; }
  if (!mGain) { mGain = a.createGain(); mGain.gain.value = 0; mGain.connect(a.destination); }
  mGain.gain.setTargetAtTime(state === 'menu' || state === 'results' ? 0.5 : 0, a.currentTime, state === 'playing' ? 0.15 : 0.6);
  if (!mTimer) { mNext = a.currentTime + 0.1; mTimer = setInterval(() => {
    if (!ac || ac.state !== 'running') return;
    while (mNext < ac.currentTime + 0.4) {
      const ch = PROG[(mStep >> 3) % 4], n = mStep % 8, t = mNext;
      const play = (f, d, type, v) => { const o = ac.createOscillator(), gn = ac.createGain(); o.type = type; o.frequency.value = f; gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(v, t + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(gn); gn.connect(mGain); o.start(t); o.stop(t + d + 0.05); };
      if (n === 0) { play(mf(ch[0] - 24), 0.9, 'sine', 0.16); play(mf(ch[0] - 12), 0.9, 'triangle', 0.05); }
      if (n === 4) play(mf(ch[0] - 24), 0.5, 'sine', 0.1);
      play(mf(ch[n % 3] + (n > 4 ? 12 : 0) + 12), 0.28, 'triangle', 0.045);
      mNext += 0.26; mStep++;
    }
  }, 120); }
}
const cv = $('fx'), cx = cv.getContext('2d'); let parts = [], raf = 0;
function burst(n) {
  if (reduced) return; cv.width = innerWidth; cv.height = innerHeight;
  const cols = ['#8b5cf6', '#22d3ee', '#ffd84d', '#ff5d8f', '#6df0a8'];
  for (let i = 0; i < n; i++) parts.push({ x: innerWidth / 2, y: innerHeight * 0.38, vx: (Math.random() - 0.5) * 15, vy: -Math.random() * 14 - 3, r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, c: cols[i % 5], star: i % 4 === 0 });
  if (!raf) loop();
}
function loop() {
  cx.clearRect(0, 0, cv.width, cv.height);
  parts.forEach(p => { p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a); cx.fillStyle = p.c;
    if (p.star) { cx.font = p.r * 3 + 'px sans-serif'; cx.fillText('★', -p.r, p.r); } else cx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6); cx.restore(); });
  parts = parts.filter(p => p.y < cv.height + 30);
  if (parts.length) raf = requestAnimationFrame(loop); else { raf = 0; cx.clearRect(0, 0, cv.width, cv.height); }
}

/* ===== Game flow: menu -> playing -> reveal -> results ===== */
function selectLevel(n, silent) {
  if (state !== 'menu') return;
  level = n; document.querySelectorAll('.lvl').forEach(b => b.setAttribute('aria-pressed', +b.dataset.l === n));
  $('tgt').textContent = n.toFixed(2); renderStats(); if (!silent) { hop(); audio(); SFX.click(); musicSync(); }
}
function toMenu() { if (state !== 'results' || performance.now() < lockUntil) return; setState('menu'); setMood('idle'); say('Ready? جاهز؟'); renderStats(); }
function start() {
  if (state !== 'menu') return;
  clearTimeout(waveT); audio(); SFX.start(); hop();
  setState('playing'); setMood('wait'); say('Feel the time… اعتمد على إحساسك');
  t0 = performance.now();
}
function stop(stamp) {
  if (state !== 'playing') return;
  // Use the moment the finger/key actually went down (event time), not when the page got round to handling it.
  const nowMs = performance.now(), now = (stamp > t0 && stamp <= nowMs && nowMs - stamp < 250) ? stamp : nowMs;
  if (now - t0 < MIN_PRESS_MS) return;
  SFX.stop();
  setState('reveal');                                   // round locked: cannot be scored twice
  const actual = (now - t0) / 1000, diffMs = Math.round(Math.abs(actual - level) * 1000);
  const g = GRADES.find(x => diffMs <= x.max);
  store.rounds++; store.streak = g.win ? store.streak + 1 : 0; store.bestStreak = Math.max(store.bestStreak, store.streak);
  if (g.id === 'PERFECT') store.perfects++;
  const pts = Math.round((g.pts + (g.win ? Math.min(store.streak, STREAK_CAP) * STREAK_BONUS : 0)) * LEVEL_MULT[level]);
  store.points += pts;
  const isBest = store.best[level] == null || diffMs < store.best[level]; if (isBest) store.best[level] = diffMs;
  save();
  $('rGrade').textContent = g.id; $('rGrade').className = 'grade g-' + g.id;
  $('rTarget').textContent = level.toFixed(2) + 's';
  $('rDir').textContent = diffMs === 0 ? 'EXACT' : actual < level ? 'EARLY BY' : 'LATE BY';
  $('rDiff').textContent = diffMs + ' ms'; $('rPts').textContent = '+' + pts; $('rNew').textContent = isBest ? '★ NEW BEST' : '';
  // count-up reveal from 0.00 to the stopped time
  setMood('anticip'); say('…'); $('rActual').textContent = '0.00';
  const dur = Math.min(2800, Math.max(1500, actual * 260)), s0 = performance.now(); let lastK = 0;
  const done = () => {
    if (!rev) return; cancelAnimationFrame(rev.id); rev = null;
    $('rActual').textContent = actual.toFixed(2); setState('results'); lockUntil = performance.now() + LOCK_MS;
    const sad = g.pose === 'sad' ? sadFor(diffMs) : null;
    setMood(g.pose, sad); say(g.msg[Math.floor(Math.random() * g.msg.length)]); SFX[g.pose](sad);
    if (g.id === 'PERFECT') burst(170); else if (g.id === 'AMAZING') burst(60); else if (g.id === 'GREAT') burst(18);
    renderStats();
  };
  rev = { id: 0, done };
  const step = n => {
    const p = Math.min(1, (n - s0) / dur), v = actual * (1 - Math.pow(1 - p, 2.6));
    $('rActual').textContent = v.toFixed(2);
    const k = Math.floor(v * 10); if (k !== lastK) { lastK = k; tone(300 + p * 800, 0.04, 'square', 0, 0.04); }
    if (p < 1) rev.id = requestAnimationFrame(step); else done();
  };
  rev.id = requestAnimationFrame(step);
}
function again() { if (state === 'results' && performance.now() >= lockUntil) { setState('menu'); setMood('idle'); start(); } }

/* ===== Wiring ===== */
document.querySelectorAll('.lvl').forEach(b => b.addEventListener('click', () => selectLevel(+b.dataset.l)));
$('start').addEventListener('click', start);
$('stop').addEventListener('pointerdown', e => { e.preventDefault(); stop(e.timeStamp); });
$('again').addEventListener('click', () => { SFX.click(); again(); });
$('change').addEventListener('click', () => { SFX.click(); toMenu(); });
$('snd').addEventListener('click', () => { store.sound = !store.sound; save(); renderStats(); if (store.sound) { audio(); SFX.click(); } musicSync(); });
$('reset').addEventListener('click', () => {
  if (state === 'playing' || state === 'reveal') return;
  if (confirm('Clear all saved stats? / مسح كل الإحصائيات؟')) { store = Object.assign(fresh(), { sound: store.sound }); save(); renderStats(); }
});
addEventListener('keydown', e => {
  if (e.code === 'Space') {                              // SPACE: start / stop / skip reveal / try again
    e.preventDefault(); if (e.repeat) return;
    if (state === 'menu') start(); else if (state === 'playing') stop(e.timeStamp); else if (state === 'reveal' && rev) rev.done(); else if (state === 'results') toMenu();   // SPACE on results goes to menu; next SPACE starts
  } else if (KEYMAP[e.code] && !e.repeat) selectLevel(KEYMAP[e.code]);
});
addEventListener('keyup', e => { if (e.code === 'Space') e.preventDefault(); });
setMood('idle'); renderStats(); selectLevel(3, true);
