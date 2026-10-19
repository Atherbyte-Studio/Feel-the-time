'use strict';
/* ===== CONFIG: grading thresholds (seconds, inclusive) — edit here ===== */
const GRADES = [
  { id: 'PERFECT', max: 0.05, pts: 1000, pose: 'dance',   win: true,  msg: ['PERFECT!'] },
  { id: 'AMAZING', max: 0.15, pts: 600,  pose: 'excited', win: true,  msg: ['مذهل! تقريبًا بالضبط!', 'AMAZING! Wow!'] },
  { id: 'GREAT',   max: 0.35, pts: 300,  pose: 'happy',   win: true,  msg: ['واو! كنت قريبًا جدًا!', 'So close! Great!'] },
  { id: 'CLOSE',   max: 0.75, pts: 100,  pose: 'meh',     win: false, msg: ['قريب... بس مش كفاية!', 'Hmm... not quite!'] },
  { id: 'MISS',    max: Infinity, pts: 0, pose: 'sad',    win: false, msg: ['أوووه! جرّب مرة ثانية', 'Oh no... try again!'] }
];
const LEVEL_MULT = { 1: 1, 3: 1.25, 5: 1.5 }, KEYMAP = { Digit1: 1, Digit2: 3, Digit3: 5 };
const MIN_PRESS_MS = 150, LOCK_MS = 450, STREAK_BONUS = 25, STREAK_CAP = 10, KEY = 'stopTheTimer.v1';
const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, A = reduced ? 0.25 : 1;
const fresh = () => ({ rounds: 0, perfects: 0, streak: 0, bestStreak: 0, points: 0, best: {}, sound: true });
let store = fresh();
try { store = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };

/* ===== Character: the rabbit photo, cut into layers (legs / torso / 2 arms / head+ears) and animated on canvas ===== */
const W = 320, H = 985, CUT = 240, EAR_BASE = 118, PIV = [160, 222], HIP = [160, 590], EYES = [[123, 161], [194, 161]], SH = [[58, 305], [264, 305]];
const now = () => performance.now() / 1000;
let mood = 'idle', moodT = 0, hopAt = -9, waveT = 0, loaded = false, skin = '#b8895a', nextBlink = 2, blinkT = -9;
const ptr = { x: 0, y: 0 };
const img = new Image(); img.src = 'character.webp';
const cv3 = $('c3d'), g = cv3.getContext('2d'), mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const hc = mk(W, CUT), hg = hc.getContext('2d'); let legsC, torsoC, armC = [];
let dpr = 1;
function fit() { dpr = Math.min(devicePixelRatio || 1, 2); cv3.width = cv3.clientWidth * dpr; cv3.height = cv3.clientHeight * dpr; }
new ResizeObserver(fit).observe($('stage')); fit();
const sn = Math.sin, ab = Math.abs, PI = Math.PI;
function mask(c, x0, y0, x1, y1, horizontal) {                    // alpha ramp 0 -> 1 between two points (destination-in)
  const x = c.getContext('2d'), gr = horizontal ? x.createLinearGradient(x0, 0, x1, 0) : x.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000'); x.globalCompositeOperation = 'destination-in'; x.fillStyle = gr; x.fillRect(0, 0, c.width, c.height); x.globalCompositeOperation = 'source-over';
}
function build() {
  let x;
  legsC = mk(W, H); x = legsC.getContext('2d');
  x.drawImage(img, 62, 570, 196, 90, 62, 570, 196, 90); x.drawImage(img, 0, 660, W, H - 660, 0, 660, W, H - 660); mask(legsC, 0, 570, 0, 590);
  torsoC = mk(W, 596); x = torsoC.getContext('2d');
  x.drawImage(img, 0, 222, W, 374, 0, 222, W, 374); x.clearRect(0, 315, 70, 281); x.clearRect(244, 315, W - 244, 281);
  x.globalCompositeOperation = 'destination-in'; const fg = x.createLinearGradient(0, 576, 0, 596); fg.addColorStop(0, '#000'); fg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = fg; x.fillRect(0, 0, W, 596); x.globalCompositeOperation = 'source-over';
  [0, 1].forEach(i => {
    const c = mk(W, 660); x = c.getContext('2d'), x0 = i ? 232 : 0;
    x.drawImage(img, x0, 295, i ? W - 232 : 84, 365, x0, 295, i ? W - 232 : 84, 365); x.clearRect(i ? 232 : 60, 590, i ? 31 : 24, 70);
    if (i) mask(c, 232, 0, 246, 0, true); else { const t = c.getContext('2d'), gr = t.createLinearGradient(70, 0, 84, 0); gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)'); t.globalCompositeOperation = 'destination-in'; t.fillStyle = gr; t.fillRect(0, 0, W, 660); t.globalCompositeOperation = 'source-over'; }
    mask(c, 0, 295, 0, 315); armC[i] = c;
  });
  try { const t = mk(W, H), tx = t.getContext('2d'); tx.drawImage(img, 0, 0); const d = tx.getImageData(120, 128, 78, 6).data; let r = 0, gg = 0, b = 0, n = d.length / 4; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } skin = `rgb(${r / n | 0},${gg / n | 0},${b / n | 0})`; } catch (e) {}
  loaded = true;
}
img.onload = build;
// [hop, sway, hipShift, headRot, headDown, torsoScaleY, earDroop, earFlap, shake, scale, armL, armR, lid]
const POSE = {
  idle:    t => [0, sn(t * 1.1) * 0.025, sn(t * 0.7) * 5, sn(t * 0.6) * 0.07, 0, 1 + sn(t * 1.8) * 0.008, 5, 3, 0, 1, 0.04 + sn(t * 1.3) * 0.03, 0.04 + sn(t * 1.3 + 1) * 0.03, 0],
  wave:    t => [ab(sn(t * 6)) * 70, sn(t * 6) * 0.06, 0, sn(t * 8) * 0.12, 0, 1, 0, 14, 0, 1, 0.3, 1.1 + sn(t * 14) * 0.3, 0],
  wait:    t => [ab(sn(t * 5)) * 10, sn(t * 2.5) * 0.03, 0, sn(t * 2.2) * 0.07 - 0.04, 0, 1 + ab(sn(t * 5)) * 0.01, 0, 4, 0, 1, 0.06, 0.06, 0.12],
  anticip: t => [0, 0, 0, 0, 0, 1.01, -8, 8, 3.5, 1.05, 0.14, 0.14, 0],
  sad:     t => [0, 0, 0, -0.14, 26, 0.96, 42, 0, 0, 1, -0.04, -0.04, 0.5],
  meh:     t => [0, sn(t * 2) * 0.03, 0, sn(t * 2.4) * 0.16, 0, 1, 16, 0, 0, 1, 0.5, 0.5, 0.42],
  happy:   t => [ab(sn(t * 6)) * 85, sn(t * 6) * 0.05, 0, sn(t * 6) * 0.1, 0, 1, 0, 16, 0, 1, 0.55 + sn(t * 6) * 0.15, 0.55 - sn(t * 6) * 0.15, 1],
  excited: t => [ab(sn(t * 9)) * 150, sn(t * 9) * 0.06, 0, sn(t * 9) * 0.14, 0, 1, 0, 22, 0, 1.02, 0.95 + sn(t * 10) * 0.25, 0.95 - sn(t * 10) * 0.25, 0],
  dance:   t => [ab(sn(t * 6)) * 100, sn(t * 3) * 0.14, sn(t * 3) * 30, sn(t * 6) * 0.16, 0, 1, 0, 24, 0, 1, 0.85 + sn(t * 6) * 0.5, 0.85 - sn(t * 6) * 0.5, 1]
};
const P = POSE.idle(0);
const star = (x, y, r, rot = 0) => { g.save(); g.translate(x, y); g.rotate(rot); g.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.28 : r, a = i * PI / 4; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); g.restore(); };
function drawHead(t, droop, flap) {
  hg.clearRect(0, 0, W, CUT);
  hg.drawImage(img, 0, EAR_BASE, W, CUT - EAR_BASE, 0, EAR_BASE, W, CUT - EAR_BASE);
  for (let y = 0; y < EAR_BASE; y += 2) {                        // ears: sheared strips pinned at the base (flop + wiggle)
    const k = Math.pow((EAR_BASE - y) / EAR_BASE, 1.5), dl = -droop * k + sn(t * 9) * flap * k, dr = droop * k + sn(t * 9 + 1.6) * flap * k;
    hg.drawImage(img, 55, y, 107, 2, 55 + dl, y, 107, 2); hg.drawImage(img, 162, y, 103, 2, 162 + dr, y, 103, 2);
  }
  hg.globalCompositeOperation = 'destination-in'; const gr = hg.createLinearGradient(0, CUT - 14, 0, CUT); gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  hg.fillStyle = gr; hg.fillRect(0, 0, W, CUT); hg.globalCompositeOperation = 'source-over';
}
function faceFx(t, lidBase) {
  if (t > nextBlink) { blinkT = t; nextBlink = t + 2 + Math.random() * 3; }
  const bl = t - blinkT < 0.16 ? sn((t - blinkT) / 0.16 * PI) : 0, cover = Math.max(lidBase, bl), arc = lidBase > 0.9;
  if (cover > 0.04) EYES.forEach(([x, y], i) => {
    g.save(); g.beginPath(); g.ellipse(x, y, 9.5, 11, 0, 0, PI * 2); g.clip(); g.translate(x, y); g.rotate((i ? 1 : -1) * (mood === 'sad' ? 0.28 : 0));
    g.fillStyle = skin; const e = -11 + 22 * cover; g.fillRect(-14, -14, 28, e + 14); g.strokeStyle = '#3a2414'; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath();
    if (arc) { g.moveTo(-9, 3); g.quadraticCurveTo(0, -8, 9, 3); } else { g.moveTo(-10, e); g.lineTo(10, e); } g.stroke(); g.restore();
  });
  const glow = ['happy', 'excited', 'dance', 'wave'].includes(mood);
  if (glow) {
    [[98, 192], [222, 192]].forEach(([x, y]) => { const r = g.createRadialGradient(x, y, 0, x, y, 26); r.addColorStop(0, 'rgba(255,90,140,.4)'); r.addColorStop(1, 'rgba(255,90,140,0)'); g.fillStyle = r; g.fillRect(x - 26, y - 26, 52, 52); });
    if (!arc) EYES.forEach(([x, y], i) => { g.fillStyle = '#fff'; star(x + 5, y - 6, (6 + sn(t * 9 + i) * 2.5) * (mood === 'excited' ? 1.5 : 1)); });
  }
  if (mood === 'sad') EYES.forEach(([x, y], i) => { const q = (t * 0.8 + i * 0.45) % 1; g.globalAlpha = 1 - q; g.fillStyle = '#7df3ff'; g.beginPath(); g.ellipse(x + (i ? 6 : -6), y + 14 + q * 70, 4, 6, 0, 0, PI * 2); g.fill(); g.globalAlpha = 1; });
  if (mood === 'meh') { g.fillStyle = '#7df3ff'; g.beginPath(); g.moveTo(240, 78); g.quadraticCurveTo(254, 104, 240, 112); g.quadraticCurveTo(226, 104, 240, 78); g.fill(); }
}
function frame() {
  requestAnimationFrame(frame);
  const w = cv3.clientWidth, h = cv3.clientHeight; if (!loaded || !w || !h) return;
  const t = now(), tg = POSE[mood](t);
  for (let i = 0; i < P.length; i++) P[i] += (tg[i] - P[i]) * (i === 0 ? 0.4 : 0.14);
  const hd = t - hopAt, hp = (P[0] + (hd < 0.55 ? sn(hd / 0.55 * PI) * 90 : 0)) * A, s = Math.min(h * 0.96 / H, w * 0.8 / W), fx = w / 2, fy = h * 0.965;
  const stretch = 1 + Math.min(1, hp / 150) * 0.05 * A;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  g.save(); g.translate(fx, fy); g.scale(1, 0.2);                  // glowing platform (shrinks while jumping)
  const R = W * s * 0.75 * (1 - Math.min(0.2, hp / 800)), pg = g.createRadialGradient(0, 0, 0, 0, 0, R); pg.addColorStop(0, 'rgba(139,92,246,.6)'); pg.addColorStop(1, 'rgba(139,92,246,0)');
  g.fillStyle = pg; g.beginPath(); g.arc(0, 0, R, 0, PI * 2); g.fill(); g.strokeStyle = 'rgba(34,211,238,.65)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, R * 0.8, 0, PI * 2); g.stroke(); g.restore();
  g.save(); g.translate(fx + sn(t * 70) * P[8] * s, fy); g.scale(s * P[9] / stretch, s * P[9] * stretch); g.translate(-W / 2, -H - hp);
  g.drawImage(legsC, 0, 0);
  g.save(); g.translate(HIP[0] + P[2] * A, HIP[1]); g.rotate(P[1] * A); g.scale(1, P[5]); g.translate(-HIP[0], -HIP[1]);
  g.drawImage(torsoC, 0, 0);
  [0, 1].forEach(i => { g.save(); g.translate(SH[i][0], SH[i][1]); g.rotate((i ? -P[11] : P[10]) * (A < 1 ? 0.3 : 1)); g.translate(-SH[i][0], -SH[i][1]); g.drawImage(armC[i], 0, 0); g.restore(); });
  drawHead(t, P[6] * A, P[7] * A);
  g.save(); g.translate(PIV[0], PIV[1] + P[4]); g.rotate(P[3] * A + ptr.x * 0.1); g.translate(-PIV[0], -PIV[1]);
  g.drawImage(hc, 0, 0); faceFx(t, P[12]); g.restore(); g.restore();
  if (mood === 'excited' || mood === 'dance') { g.fillStyle = mood === 'dance' ? '#7df3ff' : '#ffd84d'; for (let i = 0; i < 7; i++) { const a = t * 3 + i * 0.9; star(160 + Math.cos(a) * 170, 150 + Math.sin(a) * 70 - 120 * (i % 2), 15, a); } }
  g.restore();
}
frame();
function setMood(m) { mood = m; moodT = now(); }
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
const fmtBest = ms => ms == null ? '—' : '±' + (ms / 1000).toFixed(3) + 's';
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
  sad: () => [0, 0.42, 0.84].forEach((d, i) => { slide(330 - i * 45, 250 - i * 45, i === 2 ? 0.7 : 0.38, 'sawtooth', d, 0.07); slide(6 + i, 5, 0.3, 'sine', d, 0.0001); }),
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
function stop() {
  if (state !== 'playing') return;
  const now = performance.now(); if (now - t0 < MIN_PRESS_MS) return;
  SFX.stop();
  setState('reveal');                                   // round locked: cannot be scored twice
  const actual = (now - t0) / 1000, diffMs = Math.round(Math.abs(actual - level) * 1000);
  const g = GRADES.find(x => diffMs / 1000 <= x.max);
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
    setMood(g.pose); say(g.msg[Math.floor(Math.random() * g.msg.length)]); SFX[g.pose]();
    if (g.id === 'PERFECT') burst(170); else if (g.id === 'AMAZING') burst(60);
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
$('stop').addEventListener('pointerdown', e => { e.preventDefault(); stop(); });
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
    if (state === 'menu') start(); else if (state === 'playing') stop(); else if (state === 'reveal' && rev) rev.done(); else if (state === 'results') toMenu();   // SPACE on results goes to menu; next SPACE starts
  } else if (KEYMAP[e.code] && !e.repeat) selectLevel(KEYMAP[e.code]);
});
addEventListener('keyup', e => { if (e.code === 'Space') e.preventDefault(); });
setMood('idle'); renderStats(); selectLevel(3, true);
