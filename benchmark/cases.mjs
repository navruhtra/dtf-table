// DTF Table benchmark — the test art. Drawn here from shapes, at 300 dpi, with a fixed seed, so every run sees the
// same pixels and the referee knows the truth (which pixels are fades, which strokes are thin). Nothing is downloaded.
//
// Each case: { id, W, H, rgba, truth: { fade: Uint8Array (1 = a pixel the art means as a fade), strokes: [...] } }
// strokes: { mm, mask: Uint8Array } for line-weight cases, so preflight's thin-line flags can be scored.

export const DPI = 300;
const PX_PER_MM = DPI / 25.4;

/** Area coverage of a pixel by a shape given as a signed distance (inside < 0), by 4 × 4 supersampling. */
function cover(sdf, x, y) { let n = 0; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (sdf(x + (i + 0.5) / 4, y + (j + 0.5) / 4) < 0) n++; return n / 16; }

function blank(W, H) { return { W, H, rgba: new Uint8ClampedArray(W * H * 4), fade: new Uint8Array(W * H) }; }
/** Paint colour c over a pixel with coverage a (straight alpha, "over" compositing). */
function paint(img, p, c, a) {
  if (a <= 0) return; const o = p * 4, da = img.rgba[o + 3] / 255, oa = a + da * (1 - a);
  for (let k = 0; k < 3; k++) img.rgba[o + k] = Math.round((c[k] * a + img.rgba[o + k] * da * (1 - a)) / oa);
  img.rgba[o + 3] = Math.round(oa * 255);
}

const disc = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const box = (x0, y0, x1, y1) => (x, y) => Math.max(x0 - x, x - x1, y0 - y, y - y1);
const ring = (cx, cy, r0, r1) => (x, y) => { const d = Math.hypot(x - cx, y - cy); return Math.max(r0 - d, d - r1); };
const star = (cx, cy, R, r, n) => (x, y) => { const a = Math.atan2(y - cy, x - cx), d = Math.hypot(x - cx, y - cy), t = ((a / (2 * Math.PI / n)) % 1 + 1) % 1, k = Math.abs(t - 0.5) * 2; return d - (r + (R - r) * Math.pow(k, 1.5)); };

/** Hard-edged logo: shapes with 1 px anti-aliased rims, no fades. Tests white under colour at the edges. */
function logo() {
  const img = blank(900, 600);
  const shapes = [[disc(200, 200, 140), [220, 40, 40]], [star(620, 230, 170, 80, 5), [250, 200, 20]], [box(80, 400, 820, 520), [20, 90, 200]],
    [ring(200, 200, 60, 90), [255, 255, 255]], [box(150, 440, 750, 455), [250, 250, 250]]];
  for (const [sdf, c] of shapes) for (let y = 0; y < img.H; y++) for (let x = 0; x < img.W; x++) paint(img, y * img.W + x, c, cover(sdf, x, y));
  return { id: "logo", ...img };
}

/** A disc with a 120 px (10 mm) glow around it: the glow is a fade. */
function glow() {
  const img = blank(900, 900), R = 240, G = 120;
  for (let y = 0; y < 900; y++) for (let x = 0; x < 900; x++) {
    const d = Math.hypot(x + 0.5 - 450, y + 0.5 - 450), p = y * 900 + x;
    if (d < R) paint(img, p, [230, 60, 40], Math.min(1, R - d + 0.5 >= 1 ? 1 : R - d + 0.5));
    else if (d < R + G) { const t = 1 - (d - R) / G; paint(img, p, [230, 60, 40], t * t); if (d > R + 2 && d < R + G - 2) img.fade[p] = 1; }
  }
  return { id: "glow", ...img };
}

/** A shape with a soft drop shadow (50 % black, 8 mm blur) behind it. */
function shadow() {
  const img = blank(900, 700), S = 95, sh = box(240, 200, 700, 520), sb = 90;
  for (let y = 0; y < 700; y++) for (let x = 0; x < 900; x++) { const d = sh(x - S * 0.4, y - S * 0.4), p = y * 900 + x;
    const a = 0.5 * Math.max(0, Math.min(1, 0.5 - d / sb)); if (a > 0) { paint(img, p, [0, 0, 0], a); if (a < 0.49 && a > 0.01) img.fade[p] = 1; } }
  for (let y = 0; y < 700; y++) for (let x = 0; x < 900; x++) { const a = cover(sh, x, y), p = y * 900 + x; if (a > 0) { paint(img, p, [40, 170, 90], a); if (a > 0.99) img.fade[p] = 0; } }
  return { id: "shadow", ...img };
}

/** A linear fade to clear across 3 in, and a radial fade. */
function fade() {
  const img = blank(900, 600);
  for (let y = 0; y < 300; y++) for (let x = 0; x < 900; x++) { const a = 1 - x / 899, p = y * 900 + x; paint(img, p, [30, 110, 220], a); if (a > 0.02 && a < 0.98) img.fade[p] = 1; }
  for (let y = 300; y < 600; y++) for (let x = 0; x < 900; x++) { const d = Math.hypot(x - 450, y - 450) / 300, a = Math.max(0, 1 - d), p = y * 900 + x; paint(img, p, [200, 40, 160], a); if (a > 0.02 && a < 0.98) img.fade[p] = 1; }
  return { id: "fade", ...img };
}

/** Strokes of known weight, horizontal and diagonal: which ones preflight must flag (under 0.5 mm) and which not. */
export const STROKE_MM = [0.2, 0.3, 0.4, 0.45, 0.55, 0.6, 0.8, 1.0];
function lines() {
  const W = 1200, H = 120 * STROKE_MM.length, img = blank(W, H), strokes = [];
  STROKE_MM.forEach((mm, i) => {
    const w = mm * PX_PER_MM, cy = i * 120 + 60, mask = new Uint8Array(W * H);
    const hor = (x, y) => Math.max(Math.abs(y - cy) - w / 2, 60 - x, x - 560);
    const dia = (x, y) => { const u = (x - 640) * 0.8 + (y - cy) * 0.6, v = -(x - 640) * 0.6 + (y - cy) * 0.8; return Math.max(Math.abs(v) - w / 2, -u, u - 500); };
    for (const sdf of [hor, dia]) for (let y = i * 120; y < i * 120 + 120; y++) for (let x = 0; x < W; x++) { const a = cover(sdf, x, y), p = y * W + x; if (a > 0) { paint(img, p, [20, 20, 20], a); if (a >= 0.5) mask[p] = 1; } }
    strokes.push({ mm, mask });
  });
  return { id: "lines", ...img, strokes };
}

export function cases() { return [logo(), glow(), shadow(), fade(), lines()]; }

/* ───────── nesting cases ───────── */

let seed = 0; const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const r2 = v => Math.round(v * 4) / 4; // design sizes to the quarter inch, as shops quote them
/** Five order mixes on a 22 in roll, fixed seed: what a gang-sheet order looks like. */
export function nestCases() {
  seed = 369;
  const mk = (id, list) => ({ id, widthIn: 22, gapIn: 0.25, pieces: list.map((p, i) => ({ id: `${id}-${i}`, ...p })) });
  return [
    mk("tees", [{ wIn: 11, hIn: 11, copies: 6 }, { wIn: 10, hIn: 12, copies: 4 }, { wIn: 4, hIn: 4, copies: 12 }, { wIn: 3.5, hIn: 3.5, copies: 10 }]),
    mk("logos", Array.from({ length: 6 }, () => ({ wIn: r2(1.5 + rand() * 3), hIn: r2(1 + rand() * 3), copies: 10 + Math.floor(rand() * 20) }))),
    mk("mixed", Array.from({ length: 18 }, () => ({ wIn: r2(2 + rand() * 10), hIn: r2(2 + rand() * 10), copies: 1 + Math.floor(rand() * 5) }))),
    mk("strips", [{ wIn: 20, hIn: 2.5, copies: 6 }, { wIn: 14, hIn: 3, copies: 8 }, { wIn: 3, hIn: 14, copies: 6 }, { wIn: 6, hIn: 6, copies: 9 }]),
    mk("random", Array.from({ length: 40 }, () => ({ wIn: r2(1 + rand() * 12), hIn: r2(1 + rand() * 12), copies: 1 }))),
  ];
}
