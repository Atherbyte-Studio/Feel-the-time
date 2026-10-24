'use strict';
/* The rabbit. Drawn entirely with code (no image), so it is sharp on every screen and every part moves on its own joint.
 *
 *   Rabbit.pose(mood, t, sad)         -> the pose the rabbit is heading for (numbers, see POSE_KEYS)
 *   Rabbit.draw(g, P, t, mood, look)  -> draws one frame. Design box: W x H, feet on the line y = FLOOR, centred on x = W/2.
 *
 * Moods: idle, wave, wait, anticip, dance, excited, happy, smile, meh, sad (sad takes a level 0..1: the further
 * the stopped time was from the target, the sadder: ears droop more, more tears, finally crying with both hands).
 */
/* rounded rectangles for old WebViews that lack ctx.roundRect */
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
  };
}
const Rabbit = (() => {
  const W = 400, H = 600, FLOOR = 590, PI = Math.PI, sin = Math.sin, cos = Math.cos;
  const COL = { fur: '#fff4ea', shade: '#f2dfd0', line: '#33204f', pink: '#ff9fbb', pinkDeep: '#ff6f98', suit: '#7c4dff', suitDark: '#5a33d4', suitLight: '#a283ff', cyan: '#22d3ee', eye: '#2a1840', tear: '#8be9ff', mouth: '#4a1538' };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;

  /* ----- drawing helpers: every body part is a chain of circles ("stamps"), outline first, then fill ----- */
  function stamp(g, pts, fill, line, lw) {
    // pts: [[x, y, r], ...] polyline; circles are placed along it every ~3px with the radius interpolated
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0, r0] = pts[i], [x1, y1, r1] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3));
      for (let k = 0; k < n; k++) { const u = k / n; out.push([lerp(x0, x1, u), lerp(y0, y1, u), lerp(r0, r1, u)]); }
    }
    const last = pts[pts.length - 1]; out.push(last);
    if (line) { g.fillStyle = line; g.beginPath(); out.forEach(([x, y, r]) => { g.moveTo(x + r + lw, y); g.arc(x, y, r + lw, 0, PI * 2); }); g.fill(); }
    g.fillStyle = fill; g.beginPath(); out.forEach(([x, y, r]) => { g.moveTo(x + r, y); g.arc(x, y, r, 0, PI * 2); }); g.fill();
  }

  /* two-bone arm: shoulder -> elbow -> hand, so a pose is just "where the hand goes" */
  function ik(sx, sy, hx, hy, l1, l2, bend) {
    let dx = hx - sx, dy = hy - sy, d = Math.hypot(dx, dy) || 0.01;
    const max = l1 + l2 - 1, min = Math.abs(l1 - l2) + 2;
    const dd = clamp(d, min, max); dx *= dd / d; dy *= dd / d; d = dd;
    const a = Math.atan2(dy, dx), ang = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), e = a + bend * ang;
    return { ex: sx + cos(e) * l1, ey: sy + sin(e) * l1, hx: sx + dx, hy: sy + dy };
  }

  /* an ear is a curved tube: it starts at the head, leans out by `ang`, and curls over by `bend` (flopping when large) */
  function ear(g, bx, by, side, ang, bend, len0) {
    const pts = [], inner = [], N = 14, len = len0 * (1 - 0.2 * clamp(bend / 1.4, 0, 1));    // a floppy ear hangs shorter, so it stays inside the picture
    let x = bx, y = by, th = 0;
    for (let i = 0; i <= N; i++) {
      const u = i / N, r = 25 + 9 * sin(PI * clamp(u * 1.15 + 0.12, 0, 1)) - 10 * u * u;      // widest in the lower half, rounded tip
      pts.push([x, y, r]);
      if (u > 0.08 && u < 0.9) inner.push([x + side * 2 * (1 - u), y, r * 0.58]);
      th = side * (ang + bend * Math.pow(u, 1.5));
      x += sin(th) * len / N; y -= cos(th) * len / N;
    }
    stamp(g, pts, COL.fur, COL.line, 3.5);
    stamp(g, inner, COL.pink, null, 0);
    return pts[pts.length - 1];
  }

  /* ---------------------------------------------------------------------------------------------------
   * POSES. Each returns the full target set; draw() eases the live pose toward it every frame.
   *   hop       lift above the floor (px)           squash   body height scale
   *   lean      body tilt (rad)                      shake    sideways tremble (px)
   *   headRot   head tilt (rad)                      headDown head drop (px)
   *   earAng    ear lean outward (rad)               earBend  ear curl / flop (rad)    earWig  ear wiggle speed-scaled amount
   *   eye       eye openness 0..1.2                  happyEye 0..1 (^ ^ eyes)           lid  lid slant (rad, + = sad)
   *   brow      eyebrow: +raised, -worried           smile    mouth curve -1 frown .. +1 grin     open  mouth open 0..1
   *   blush     0..1                                 tears    0..1                      sweat 0..1
   *   lx,ly,rx,ry  left/right hand targets (design coords)                              fl, fr foot lift (px)
   * ------------------------------------------------------------------------------------------------- */
  const KEYS = ['hop', 'squash', 'lean', 'shake', 'headRot', 'headDown', 'earAng', 'earBend', 'earWig', 'eye', 'happyEye', 'lid', 'brow', 'smile', 'open', 'blush', 'tears', 'sweat', 'lx', 'ly', 'rx', 'ry', 'fl', 'fr', 'gaze'];
  const REST_L = [94, 514], REST_R = [306, 514];
  const abs = Math.abs;
  function pose(mood, t, sad) {
    const b = 1 + sin(t * 1.9) * 0.012;                                           // breathing
    const P = { hop: 0, squash: b, lean: 0, shake: 0, headRot: sin(t * 0.7) * 0.03, headDown: 0, earAng: 0.13, earBend: 0.1, earWig: 1, eye: 1, happyEye: 0, lid: 0, brow: 0.1, smile: 0.35, open: 0, blush: 0.3, tears: 0, sweat: 0, lx: REST_L[0] + sin(t * 1.3) * 3, ly: REST_L[1], rx: REST_R[0] - sin(t * 1.3) * 3, ry: REST_R[1], fl: 0, fr: 0, gaze: 1 };
    switch (mood) {
      case 'wave': {
        const w = sin(t * 11);
        Object.assign(P, { hop: abs(sin(t * 5)) * 22, lean: sin(t * 5) * 0.03, headRot: sin(t * 5) * 0.08, earAng: 0.2, earBend: 0.05, earWig: 3, happyEye: 0.7, brow: 0.5, smile: 1, open: 0.35, blush: 0.6, rx: 336 + w * 16, ry: 196 + abs(w) * 8 });
        break; }
      case 'wait': {                                                              // the round is running: focused, tapping a foot, looking around
        Object.assign(P, { hop: abs(sin(t * 3)) * 3, squash: 1 + sin(t * 3) * 0.006, headRot: sin(t * 0.9) * 0.05, earAng: 0.07, earBend: 0, eye: 0.92, brow: -0.1, smile: 0.0, blush: 0.15, lx: 172 + sin(t * 2) * 3, ly: 436, rx: 228 - sin(t * 2) * 3, ry: 436, fr: Math.max(0, sin(t * 5.5)) * 14, gaze: 1 });
        break; }
      case 'anticip': {                                                           // waiting for the result: nervous, trembling, hands at the mouth
        Object.assign(P, { shake: 1.6, squash: 1.01, earAng: 0.02, earBend: -0.05, earWig: 0.3, eye: 1.18, brow: 0.9, smile: -0.05, open: 0.18, blush: 0.1, sweat: 1, lx: 176, ly: 316, rx: 224, ry: 316, headDown: -4 });
        break; }
      case 'dance': {                                                             // PERFECT: wild celebration
        const s = sin(t * 6), c = cos(t * 6);
        Object.assign(P, { hop: abs(s) * 70, lean: sin(t * 3) * 0.1, shake: 0, headRot: sin(t * 3) * 0.14, earAng: 0.35 + c * 0.12, earBend: 0.12, earWig: 5, eye: 1, happyEye: 1, brow: 1, smile: 1, open: 0.9 + c * 0.1, blush: 1, lx: 76 - s * 10, ly: 190 - c * 34, rx: 324 + s * 10, ry: 190 + c * 34, fl: Math.max(0, s) * 20, fr: Math.max(0, -s) * 20 });
        break; }
      case 'excited': {                                                           // AMAZING: jumping with both hands up
        const s = sin(t * 8);
        Object.assign(P, { hop: abs(s) * 55, lean: s * 0.05, headRot: s * 0.1, earAng: 0.3, earBend: 0.06, earWig: 4, happyEye: 1, brow: 1, smile: 1, open: 0.75, blush: 0.9, lx: 82, ly: 188 - abs(s) * 18, rx: 318, ry: 188 - abs(s) * 18 });
        break; }
      case 'happy': {                                                             // GREAT: happy little hops
        const s = sin(t * 6);
        Object.assign(P, { hop: abs(s) * 30, lean: s * 0.04, headRot: s * 0.07, earAng: 0.22, earWig: 3, happyEye: 0.9, brow: 0.7, smile: 1, open: 0.4, blush: 0.8, lx: 92, ly: 300 - abs(s) * 8, rx: 308, ry: 300 - abs(s) * 8 });
        break; }
      case 'smile': {                                                             // GOOD: pleased, no party
        Object.assign(P, { hop: abs(sin(t * 3)) * 8, headRot: sin(t * 1.5) * 0.06, earAng: 0.16, happyEye: 0.35, brow: 0.4, smile: 0.85, blush: 0.65 });
        break; }
      case 'meh': {                                                               // CLOSE: unimpressed, shrugging
        Object.assign(P, { headRot: sin(t * 1.6) * 0.1 - 0.04, headDown: 4, earAng: 0.2, earBend: 0.55, earWig: 0.4, eye: 0.58, lid: 0.12, brow: -0.15, smile: -0.12, blush: 0, sweat: 0.7, lx: 88, ly: 430 + sin(t * 2) * 5, rx: 312, ry: 430 - sin(t * 2) * 5, gaze: 0.5 });
        break; }
      case 'sad': {                                                               // MISS: sadness grows with the distance
        const L = clamp(sad == null ? 0.5 : sad, 0, 1), sob = L > 0.55 ? sin(t * 9) * (L - 0.55) * 2.4 : 0;
        Object.assign(P, { squash: 1 - 0.035 * L + sin(t * 1.4) * 0.006, lean: 0.015 + 0.03 * L, shake: abs(sob) * 2.2, headRot: -0.05 - 0.09 * L + sob * 0.01, headDown: 6 + 24 * L, earAng: 0.3 + 0.2 * L, earBend: 0.7 + 0.65 * L, earWig: 0.15, eye: 0.78 - 0.15 * L, lid: 0.18 + 0.32 * L, brow: -0.35 - 0.6 * L, smile: -0.35 - 0.65 * L, open: L > 0.6 ? (L - 0.6) * 1.8 + sob * 0.12 : 0, blush: 0, tears: 0.12 + 0.88 * L, sweat: 0, lx: 98 + 12 * L, ly: 480, rx: 302 - 12 * L, ry: 480, gaze: 0 });
        if (L > 0.62) {                                                           // really crying: both hands rub the eyes
          const k = clamp((L - 0.62) / 0.2, 0, 1), rub = sin(t * 10) * 5;
          P.lx = lerp(P.lx, 160 + rub, k); P.ly = lerp(P.ly, 252, k); P.rx = lerp(P.rx, 240 - rub, k); P.ry = lerp(P.ry, 252, k);
        }
        break; }
    }
    return P;
  }
  const initial = () => pose('idle', 0);

  /* ---------------------------------------------------------------------------------------------------
   * DRAW
   * ------------------------------------------------------------------------------------------------- */
  function star(g, x, y, r, rot) {
    g.save(); g.translate(x, y); g.rotate(rot); g.beginPath();
    for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.3 : r, a = i * PI / 4; g.lineTo(cos(a) * rr, sin(a) * rr); }
    g.closePath(); g.fill(); g.restore();
  }

  function eyeAt(g, x, y, side, P, t, lookX, lookY, blink) {
    const open = clamp(P.eye * (1 - blink), 0, 1.25), rx = 17, ry = 24;
    if (P.happyEye > 0.5) {                                                       // ^ ^ happy eyes
      g.strokeStyle = COL.eye; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath();
      g.moveTo(x - 17, y + 8); g.quadraticCurveTo(x, y - 20 - P.happyEye * 4, x + 17, y + 8); g.stroke();
      return;
    }
    g.save(); g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, PI * 2); g.clip();
    g.fillStyle = COL.eye; g.fillRect(x - rx - 2, y - ry - 2, rx * 2 + 4, ry * 2 + 4);
    const px = x + lookX * 5, py = y + lookY * 6;                                  // highlights follow the gaze
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(px + 5, py - 8, 6.5, 7.5, 0, 0, PI * 2); g.fill();
    g.beginPath(); g.arc(px - 6, py + 8, 3.2, 0, PI * 2); g.fill();
    if (P.tears > 0.25) { g.fillStyle = 'rgba(139,233,255,.55)'; g.beginPath(); g.ellipse(x, y + ry * 0.62, rx + 2, ry * 0.5, 0, 0, PI * 2); g.fill(); }   // watery eye
    // lid: covers the top (1 - open) of the eye, slanted when sad
    const cover = clamp(1 - open, 0, 1) * ry * 2;
    g.fillStyle = COL.fur; g.translate(x, y); g.rotate(side * P.lid);
    g.fillRect(-rx - 12, -ry - 14, rx * 2 + 24, 14 + cover);
    g.strokeStyle = COL.line; g.lineWidth = 3; g.beginPath(); g.moveTo(-rx - 8, -ry + cover); g.lineTo(rx + 8, -ry + cover); g.stroke();
    g.restore();
    if (open < 0.9 || P.lid > 0.05) { /* outline of the eye */ }
    g.strokeStyle = COL.line; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, PI * 2); g.stroke();
  }

  function face(g, P, t, look, blink) {
    const cx = 200, ey = 244, ex = 44;
    // cheeks
    g.fillStyle = 'rgba(255,111,152,' + (0.12 + 0.5 * P.blush) + ')';
    g.beginPath(); g.ellipse(cx - 76, ey + 38, 24, 14, 0, 0, PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx + 76, ey + 38, 24, 14, 0, 0, PI * 2); g.fill();
    // eyes
    eyeAt(g, cx - ex, ey, -1, P, t, look.x * P.gaze, look.y * P.gaze, blink);
    eyeAt(g, cx + ex, ey, 1, P, t, look.x * P.gaze, look.y * P.gaze, blink);
    // eyebrows: raised when happy/surprised, slanting up in the middle when worried
    g.strokeStyle = COL.line; g.lineWidth = 6; g.lineCap = 'round';
    [-1, 1].forEach(s => {
      const bx = cx + s * ex, by = ey - 38 - P.brow * 12, tilt = P.brow < 0 ? -P.brow * 12 : 0;
      // inner end (towards the nose) goes up when worried; the whole brow arches higher when happy
      g.beginPath(); g.moveTo(bx - s * 16, by - tilt * 0.55); g.quadraticCurveTo(bx, by - 6 - Math.max(0, P.brow) * 3, bx + s * 16, by + tilt * 0.55); g.stroke();
    });
    // buck teeth (hidden when sad), then nose and mouth on top
    const my = ey + 40;
    if (P.smile > -0.25 && P.open < 0.4) {
      g.fillStyle = '#fff'; g.strokeStyle = COL.line; g.lineWidth = 3;
      g.beginPath(); g.roundRect(cx - 12, my + 6, 24, 22, 6); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(cx, my + 8); g.lineTo(cx, my + 27); g.stroke();
    }
    if (P.open > 0.02) {                                                          // open mouth with a tongue
      const h = 6 + 34 * P.open;
      g.fillStyle = COL.mouth; g.beginPath(); g.moveTo(cx - 26, my - P.smile * 8 + 2); g.quadraticCurveTo(cx, my + 4 + h * 1.5, cx + 26, my - P.smile * 8 + 2); g.quadraticCurveTo(cx, my - 6, cx - 26, my - P.smile * 8 + 2); g.fill();
      g.save(); g.beginPath(); g.moveTo(cx - 26, my - P.smile * 8 + 2); g.quadraticCurveTo(cx, my + 4 + h * 1.5, cx + 26, my - P.smile * 8 + 2); g.quadraticCurveTo(cx, my - 6, cx - 26, my - P.smile * 8 + 2); g.clip();
      g.fillStyle = COL.pinkDeep; g.beginPath(); g.ellipse(cx, my + 4 + h * 0.95, 15, 10 + h * 0.18, 0, 0, PI * 2); g.fill(); g.restore();
    }
    g.strokeStyle = COL.line; g.lineWidth = 4; g.lineCap = 'round';
    const endY = my - P.smile * 10, ctrlY = my + P.smile * 11;                      // "w" mouth: smile up, frown down
    g.beginPath(); g.moveTo(cx, ey + 30); g.lineTo(cx, my - 4);
    g.moveTo(cx, my - 4); g.quadraticCurveTo(cx - 13, ctrlY, cx - 28, endY);
    g.moveTo(cx, my - 4); g.quadraticCurveTo(cx + 13, ctrlY, cx + 28, endY); g.stroke();
    // nose
    g.fillStyle = COL.pinkDeep; g.strokeStyle = COL.line; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx - 12, ey + 18); g.quadraticCurveTo(cx, ey + 12, cx + 12, ey + 18); g.quadraticCurveTo(cx + 9, ey + 32, cx, ey + 34); g.quadraticCurveTo(cx - 9, ey + 32, cx - 12, ey + 18); g.fill(); g.stroke();
    // whiskers
    g.strokeStyle = 'rgba(51,32,79,.45)'; g.lineWidth = 2.5;
    [-1, 1].forEach(s => [-8, 6, 20].forEach((dy, i) => { const wv = sin(t * 2 + i + s) * 2; g.beginPath(); g.moveTo(cx + s * 96, ey + 40 + dy * 0.6); g.quadraticCurveTo(cx + s * 140, ey + 34 + dy + wv, cx + s * 168, ey + 38 + dy * 1.5 + wv); g.stroke(); }));
    // tears: drops running down the face, more of them and bigger the sadder it is
    if (P.tears > 0.05) {
      const n = 2 + Math.round(P.tears * 4);
      g.fillStyle = COL.tear; g.strokeStyle = 'rgba(139,233,255,.5)'; g.lineWidth = 5;
      [-1, 1].forEach(s => {
        const x0 = cx + s * (ex + 6);
        if (P.tears > 0.3) { g.beginPath(); g.moveTo(x0, ey + 24); g.lineTo(x0 + s * 6, ey + 24 + 62 * P.tears); g.stroke(); }
        for (let i = 0; i < n; i++) {
          const q = (t * (0.7 + P.tears * 0.5) + i / n + (s > 0 ? 0.37 : 0)) % 1, y = ey + 24 + q * (110 + 60 * P.tears), r = (3 + 4 * P.tears) * (1 - q * 0.4);
          g.globalAlpha = 1 - q * q; g.beginPath(); g.ellipse(x0 + s * 8 * q, y, r, r * 1.5, 0, 0, PI * 2); g.fill();
        }
      });
      g.globalAlpha = 1;
    }
    if (P.sweat > 0.05) {                                                          // sweat drop at the temple
      const q = (t * 0.8) % 1, y = 176 + q * 60;
      g.globalAlpha = P.sweat * (1 - q * 0.6); g.fillStyle = COL.tear; g.strokeStyle = COL.line; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(cx + 104, y - 14); g.quadraticCurveTo(cx + 120, y + 8, cx + 104, y + 14); g.quadraticCurveTo(cx + 88, y + 8, cx + 104, y - 14); g.fill(); g.stroke(); g.globalAlpha = 1;
    }
  }

  function draw(g, P, t, mood, look, reduced) {
    const k = reduced ? 0.3 : 1;
    const blink = (() => { const c = t % 3.4; return c < 0.14 ? sin(c / 0.14 * PI) : 0; })();
    const hop = P.hop * k, shake = sin(t * 70) * P.shake * k, lx = look.x, ly = look.y;
    g.save();
    g.translate(shake, -hop);
    // --- legs and feet ---
    [-1, 1].forEach(s => {
      const lift = (s < 0 ? P.fl : P.fr) * k, fx = 200 + s * 58, fy = FLOOR - 18 - lift;
      stamp(g, [[200 + s * 38, 508, 30], [fx - s * 4, fy - 20, 26]], COL.fur, COL.line, 3.5);
      g.fillStyle = COL.line; g.beginPath(); g.ellipse(fx, fy + 3, 52, 25, 0, 0, PI * 2); g.fill();
      g.fillStyle = COL.fur; g.beginPath(); g.ellipse(fx, fy, 49, 22, 0, 0, PI * 2); g.fill();
      g.fillStyle = COL.pink; g.beginPath(); g.ellipse(fx + s * 8, fy + 3, 17, 9, 0, 0, PI * 2); g.fill();
    });
    // --- body (hoodie), tilted and squashed around the hips ---
    g.save(); g.translate(200, 520); g.rotate(P.lean * k); g.scale(1 / Math.sqrt(P.squash), P.squash); g.translate(-200, -520);
    const bg = g.createLinearGradient(0, 330, 0, 540); bg.addColorStop(0, COL.suitLight); bg.addColorStop(1, COL.suitDark);
    stamp(g, [[200, 500, 92], [200, 410, 80], [200, 350, 60]], bg, COL.line, 3.5);
    g.strokeStyle = 'rgba(51,32,79,.35)'; g.lineWidth = 3; g.fillStyle = 'rgba(255,255,255,.12)';
    g.beginPath(); g.roundRect(146, 448, 108, 56, 22); g.fill(); g.stroke();             // pocket
    g.strokeStyle = COL.cyan; g.lineWidth = 5; g.lineCap = 'round';                        // hood strings
    g.beginPath(); g.moveTo(184, 352); g.quadraticCurveTo(178, 392, 182, 420); g.moveTo(216, 352); g.quadraticCurveTo(222, 392, 218, 420); g.stroke();
    g.fillStyle = COL.cyan; [[182, 424], [218, 424]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 6, 0, PI * 2); g.fill(); });
    g.restore();
    // --- head (ears, face) ---
    g.save(); g.translate(0, P.headDown * k); g.translate(200, 330); g.rotate((P.headRot + lx * 0.04) * k); g.translate(-200, -330);
    const ew = P.earWig * k, eL = sin(t * 9 + 0.5) * 0.05 * ew + (t % 5 < 0.25 ? sin(t * 40) * 0.08 * k : 0), eR = sin(t * 9 + 2.1) * 0.05 * ew;
    ear(g, 152, 176, -1, P.earAng + eL, P.earBend, 205);
    ear(g, 248, 176, 1, P.earAng + eR, P.earBend, 205);
    const hg = g.createRadialGradient(190, 200, 20, 200, 244, 125); hg.addColorStop(0, '#fffaf4'); hg.addColorStop(1, COL.shade);
    g.fillStyle = COL.line; g.beginPath(); g.ellipse(200, 244, 115, 99, 0, 0, PI * 2); g.fill();
    g.fillStyle = hg; g.beginPath(); g.ellipse(200, 244, 111.5, 95.5, 0, 0, PI * 2); g.fill();
    face(g, P, t, { x: lx, y: ly }, blink);
    g.restore();
    // --- arms (drawn last so hands can come up to the face) ---
    [-1, 1].forEach(s => {
      const sx = 200 + s * 82, sy = 386, hx = s < 0 ? P.lx : P.rx, hyy = s < 0 ? P.ly : P.ry;
      const a = ik(sx, sy, hx, hyy, 72, 66, s < 0 ? 1 : -1);
      stamp(g, [[sx, sy, 27], [a.ex, a.ey, 23], [a.hx, a.hy, 21]], COL.suit, COL.line, 3.5);
      g.fillStyle = COL.line; g.beginPath(); g.arc(a.hx, a.hy, 21, 0, PI * 2); g.fill();
      g.fillStyle = COL.fur; g.beginPath(); g.arc(a.hx, a.hy, 17.5, 0, PI * 2); g.fill();
      g.fillStyle = COL.pink; g.beginPath(); g.arc(a.hx + s * 4, a.hy + 5, 6, 0, PI * 2); g.fill();
    });
    g.restore();
    // --- sparkles for the happy moods ---
    if (mood === 'dance' || mood === 'excited' || mood === 'happy') {
      const n = mood === 'dance' ? 9 : mood === 'excited' ? 6 : 3;
      g.fillStyle = mood === 'dance' ? '#7df3ff' : '#ffd84d';
      for (let i = 0; i < n; i++) { const a = t * 2.4 + i * 6.283 / n, r = 150 + (i % 3) * 22; star(g, 200 + cos(a) * r * 1.1, 250 + sin(a) * r * 0.55 - 40 - hop * 0.5, 9 + (i % 3) * 4 + sin(t * 8 + i) * 2.5, t * 2 + i); }
    }
  }

  return { W, H, FLOOR, KEYS, pose, initial, draw };
})();
