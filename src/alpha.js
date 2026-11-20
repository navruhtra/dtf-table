// @ts-check
// DTF Table — alpha repair. Pure functions, no DOM.
//
// DTF film cannot print partial alpha: a pixel either gets ink (and white and powder) or it does not. A PNG with soft
// edges, glows, shadows or fades has pixels between 0 and 255 alpha, and a RIP that meets them either drops them, prints
// them solid, or prints thin ink with thin white that washes out. This module removes every such pixel before the RIP
// sees the file:
//   - Edge pixels (the 1–2 px anti-aliased rim of a hard shape) are cut at a threshold: in or out.
//   - Fade pixels (a soft area wider than the rim: a glow, a shadow, a gradient to clear) become halftone dots whose
//     area is the pixel's alpha, so the fade prints as a fade of whole dots.
// The halftone is the Separation Table's: screenAxes, shapeDot, dotOn and the scatter at both ends come from its engine,
// so a DTF fade and a screen-print fade are screened the same way.
import { minFilter, screenAxes, shapeDot, dotOn, bayerCell, scatterHoles, SCATTER_FLOOR } from "./vendor/separation-table/engine.js";

/** @typedef {{ mode?: "halftone" | "threshold", edgePx?: number, cut?: number, floor?: number, dpi?: number, lpi?: number,
 *    angle?: number, shape?: "round" | "ellipse" | "square" | "line", minDot?: number, maxDot?: number, gain?: number,
 *    scatter?: boolean, x0?: number, y0?: number }} AlphaOptions */

/** Defaults. lpi, minDot and maxDot are a starting point, not a measured limit: the smallest dot a DTF film holds
    through powder, cure and press depends on the printer, ink and powder, and the minimum-dot test target measures it. */
export const ALPHA_DEFAULTS = Object.freeze({
  mode: /** @type {"halftone"} */ ("halftone"),
  edgePx: 1,      // a soft band this many px wide (or less) on each side of an edge is a rim, cut at `cut`; wider is a fade
  cut: 128,       // rim threshold: alpha ≥ cut prints, below does not
  floor: 8,       // alpha below this is treated as clear everywhere (export haze, stray near-clear pixels)
  dpi: 300,
  lpi: 35,        // DTF halftones are coarse: a 35 LPI cell is 0.73 mm
  angle: 22.5,
  shape: /** @type {"round"} */ ("round"),
  minDot: 0.1,
  maxDot: 0.9,
  gain: 0,
  scatter: true,  // past both ends whole smallest dots (or holes) spread out instead of stopping in a hard line
});

/** Number of pixels whose alpha is neither 0 nor 255. The target after repair is 0. */
export function countSemi(rgba) {
  let n = 0; for (let i = 3; i < rgba.length; i += 4) { const a = rgba[i]; if (a > 0 && a < 255) n++; } return n;
}

/** Fade mask: 1 where a pixel is part of a soft area wider than the rim (2·edgePx + 1 px across), 0 elsewhere.
    A morphological opening of the partial-alpha mask: erode by edgePx, then grow back by edgePx. A 1 or 2 px rim around
    a hard shape does not survive the erosion; a glow, a shadow or a gradient does. */
/** @param {Uint8ClampedArray | Uint8Array} rgba @param {number} W @param {number} H @param {number} [edgePx] @param {number} [floor] */
export function fadeMask(rgba, W, H, edgePx = ALPHA_DEFAULTS.edgePx, floor = ALPHA_DEFAULTS.floor) {
  const P = W * H, part = new Float32Array(P);
  for (let p = 0; p < P; p++) { const a = rgba[p * 4 + 3]; part[p] = a >= floor && a < 255 ? 1 : 0; }
  const out = new Uint8Array(P);
  if (edgePx <= 0) { for (let p = 0; p < P; p++) out[p] = part[p]; return out; }
  const core = minFilter(part, W, H, edgePx), inv = new Float32Array(P);
  for (let p = 0; p < P; p++) inv[p] = 1 - core[p];
  const grown = minFilter(inv, W, H, edgePx); // 0 within edgePx of a core pixel
  for (let p = 0; p < P; p++) out[p] = part[p] && grown[p] < 0.5 ? 1 : 0;
  return out;
}

/** Repair alpha: returns a new RGBA buffer with every alpha 0 or 255, and counts of what was done.
    Colour is kept as stored (PNG alpha is straight, not premultiplied): a dot prints the pixel's own colour at full
    strength. x0, y0 place this buffer in a larger sheet, so dots line up across tiles. */
/** @param {Uint8ClampedArray | Uint8Array} rgba @param {number} W @param {number} H @param {AlphaOptions} [opts] */
export function repairAlpha(rgba, W, H, opts = {}) {
  const o = /** @type {Required<AlphaOptions>} */ ({ ...ALPHA_DEFAULTS, ...opts }), P = W * H, out = new Uint8ClampedArray(rgba);
  const fade = o.mode === "halftone" ? fadeMask(rgba, W, H, o.edgePx, o.floor) : new Uint8Array(P);
  const { cs, sn } = screenAxes(o.angle), cell = o.dpi / o.lpi, x0 = o.x0 ?? 0, y0 = o.y0 ?? 0;
  const dot = { gain: o.gain, curve: undefined, minDot: o.minDot, maxDot: o.maxDot, scatter: o.scatter };
  const stats = { pixels: P, semiIn: 0, edge: 0, fade: 0, floor: 0, kept: 0, dropped: 0, semiOut: 0, fadeAlphaSum: 0, fadeInkSum: 0 };
  for (let p = 0; p < P; p++) {
    const a = rgba[p * 4 + 3]; if (a === 0 || a === 255) continue;
    stats.semiIn++;
    let on;
    if (a < o.floor) { on = false; stats.floor++; }
    else if (fade[p]) {
      stats.fade++;
      const x = (p % W) + x0, y = Math.floor(p / W) + y0;
      let t = shapeDot(a / 255, dot);
      // scatter, the same as the engine's renderPlate: under the smallest dot a share of cells print one smallest dot;
      // over the largest dot a share of cells keep one smallest hole
      if (o.scatter && t > 0 && (t < o.minDot || t > o.maxDot) && t < 1) {
        const cu = Math.floor((x * cs + y * sn) / cell), cv = Math.floor((-x * sn + y * cs) / cell);
        t = t < o.minDot ? (t / o.minDot >= SCATTER_FLOOR && bayerCell(cu, cv) < t / o.minDot ? o.minDot : 0) : scatterHoles(t, o.maxDot, cu, cv);
      }
      on = dotOn(o.shape, x, y, t, cell, cs, sn);
      stats.fadeAlphaSum += a / 255; stats.fadeInkSum += on ? 1 : 0;
    } else { on = a >= o.cut; stats.edge++; }
    out[p * 4 + 3] = on ? 255 : 0;
    if (on) stats.kept++; else stats.dropped++;
  }
  stats.semiOut = countSemi(out);
  return { rgba: out, stats };
}

/** Fade smoothness, for tests and the benchmark: mean absolute difference between the wanted alpha and the printed
    coverage (both 0–1), each averaged over the same box about `win` px wide, over the pixels `mask` marks. Model only:
    it says how well the dot pattern averages to the fade, not how the film prints. */
export function fadeError(before, after, W, H, mask, win) {
  const r = Math.max(1, Math.round(win / 2)), P = W * H;
  const integral = src => { const t = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += src[(y * W + x) * 4 + 3] / 255; t[(y + 1) * (W + 1) + x + 1] = t[y * (W + 1) + x + 1] + row; } }
    return t; };
  const A = integral(before), B = integral(after);
  const box = (t, xa, ya, xb, yb) => t[yb * (W + 1) + xb] - t[ya * (W + 1) + xb] - t[yb * (W + 1) + xa] + t[ya * (W + 1) + xa];
  let s = 0, n = 0;
  for (let p = 0; p < P; p++) {
    if (!mask[p]) continue; const x = p % W, y = Math.floor(p / W);
    const xa = Math.max(0, x - r), ya = Math.max(0, y - r), xb = Math.min(W, x + r + 1), yb = Math.min(H, y + r + 1), area = (xb - xa) * (yb - ya);
    s += Math.abs(box(B, xa, ya, xb, yb) - box(A, xa, ya, xb, yb)) / area; n++;
  }
  return n ? s / n : 0;
}
