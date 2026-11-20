// @ts-check
// DTF Table — white layer. Pure functions, no DOM.
//
// On DTF film the colour prints first and the white prints over it; after transfer the white sits between the colour
// and the garment. It makes the colour opaque on dark garments and carries the adhesive powder. This module builds the
// white layer from repaired art (every alpha 0 or 255, see alpha.js):
//   - knockouts: colours removed from the print, so the garment shows (a black background on a black shirt);
//   - no-white colours: colours printed with no white under them;
//   - choke: the white pulled in from the colour's edge, so a ±1–2 px misregistration does not show a white rim. The
//     choke is the Separation Table's adaptiveChoke (keeps a 1 px choke under thin lines), and a line too thin for even
//     that keeps its white unchoked: colour without white under it washes out and holds less powder;
//   - spread: the white grown past the colour, for a deliberate white outline;
//   - density: the white channel's value, 0–100 %;
//   - by colour (optional): less white under dark colours, from the engine's base rule (lightness + chroma).
import { rgb2lab, hex2rgb, de2000, baseFraction, minFilter, adaptiveChoke } from "./vendor/separation-table/engine.js";

/** @typedef {{ chokePx?: number, spreadPx?: number, density?: number, mode?: "full" | "by-colour", minWhite?: number,
 *    knockouts?: string[], noWhite?: string[], matchDE?: number, keepThin?: boolean }} WhiteOptions */

export const WHITE_DEFAULTS = Object.freeze({
  chokePx: 1,      // at 300 dpi 1 px is 0.085 mm. The choke test target measures what a shop's printer needs.
  spreadPx: 0,
  density: 1,
  mode: /** @type {"full"} */ ("full"),
  minWhite: 0.5,   // by-colour mode: the least white under any printed colour (share of density)
  knockouts: /** @type {string[]} */ ([]),
  noWhite: /** @type {string[]} */ ([]),
  matchDE: 6,      // ΔE00 within which a pixel matches a knockout or no-white colour
  keepThin: true,
});

/** A matcher for a list of hex colours: true when a pixel's colour is within maxDE (ΔE00) of one of them. Cached by
    the 24-bit colour, since art repeats colours. */
export function colourMatcher(hexes, maxDE) {
  const labs = hexes.map(h => rgb2lab(...hex2rgb(h)));
  if (!labs.length) return () => false;
  const cache = new Map();
  return (r, g, b) => {
    const k = (r << 16) | (g << 8) | b; let v = cache.get(k);
    if (v === undefined) { const l = rgb2lab(r, g, b); v = labs.some(t => de2000(l[0], l[1], l[2], t[0], t[1], t[2]) <= maxDE); cache.set(k, v); }
    return v;
  };
}

/** Grow a 0–1 layer by r px (a max filter: the engine's min filter on the inverse). */
export function spread(src, W, H, r) {
  if (r <= 0) return src; const inv = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) inv[i] = 1 - src[i];
  const m = minFilter(inv, W, H, r), out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = 1 - m[i];
  return out;
}

/** Where the choke left no white within r + 1 px (the feature vanished), keep the raw white. */
export function keepThin(raw, choked, W, H, r) {
  if (r <= 0) return choked; const P = W * H, inv = new Float32Array(P), out = new Float32Array(choked);
  for (let i = 0; i < P; i++) inv[i] = choked[i] > 0.02 ? 0 : 1;
  const near = minFilter(inv, W, H, r + 1); // 0 where a surviving pixel is within reach
  for (let i = 0; i < P; i++) if (choked[i] <= 0.02 && raw[i] > 0 && near[i] > 0.5) out[i] = raw[i];
  return out;
}

/** Build the white layer. `rgba` must be repaired (alpha 0 or 255); a pixel with alpha ≥ 128 counts as printed.
    Returns the colour layer (knockouts removed), the white layer (0–255 per pixel, 255 = full white) and counts. */
/** @param {Uint8ClampedArray | Uint8Array} rgba @param {number} W @param {number} H @param {WhiteOptions} [opts] */
export function whiteLayer(rgba, W, H, opts = {}) {
  const o = /** @type {Required<WhiteOptions>} */ ({ ...WHITE_DEFAULTS, ...opts }), P = W * H, colour = new Uint8ClampedArray(rgba);
  const ko = colourMatcher(o.knockouts, o.matchDE), nw = colourMatcher(o.noWhite, o.matchDE);
  const raw = new Float32Array(P);
  const stats = { pixels: P, colour: 0, knockedOut: 0, noWhite: 0, white: 0, colourNoWhite: 0, whiteNoColour: 0, thinKept: 0 };
  for (let p = 0; p < P; p++) {
    const q = p * 4; if (colour[q + 3] < 128) { colour[q + 3] = 0; continue; }
    colour[q + 3] = 255;
    const r = colour[q], g = colour[q + 1], b = colour[q + 2];
    if (ko(r, g, b)) { colour[q + 3] = 0; stats.knockedOut++; continue; }
    stats.colour++;
    if (nw(r, g, b)) { stats.noWhite++; continue; }
    raw[p] = o.mode === "by-colour" ? o.minWhite + (1 - o.minWhite) * baseFraction(rgb2lab(r, g, b), 1) : 1;
  }
  let w = o.chokePx > 0 ? adaptiveChoke(raw, W, H, o.chokePx) : raw;
  if (o.keepThin && o.chokePx > 0) { const before = w; w = keepThin(raw, w, W, H, o.chokePx); for (let p = 0; p < P; p++) if (w[p] !== before[p]) stats.thinKept++; }
  if (o.spreadPx > 0) w = spread(w, W, H, o.spreadPx);
  const white = new Uint8Array(P), d = Math.max(0, Math.min(1, o.density));
  for (let p = 0; p < P; p++) {
    const v = Math.round(255 * d * Math.max(0, Math.min(1, w[p]))); white[p] = v;
    const c = colour[p * 4 + 3] > 0;
    if (v > 0) stats.white++;
    if (c && v === 0) stats.colourNoWhite++;
    if (!c && v > 0) stats.whiteNoColour++;
  }
  return { colour, white, stats };
}

/** Misregistration check (model only): shift the white against the colour by every offset up to ±px in x and y, and
    count, at the worst offset, white with no colour over it (a white rim showing) and colour with no white under it.
    `deliberate` marks white that is meant to show (a spread outline) and is not counted. */
export function misregistration(colour, white, W, H, px = 2, deliberate = null) {
  let worstShow = 0, worstBare = 0, at = [0, 0];
  for (let dy = -px; dy <= px; dy++) for (let dx = -px; dx <= px; dx++) {
    let show = 0, bare = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x, xs = x - dx, ys = y - dy;
      const wv = xs >= 0 && ys >= 0 && xs < W && ys < H ? white[ys * W + xs] : 0, c = colour[p * 4 + 3] > 0;
      if (wv > 0 && !c && !(deliberate && deliberate[p])) show++;
      if (c && wv === 0) bare++;
    }
    if (show > worstShow) { worstShow = show; at = [dx, dy]; }
    if (bare > worstBare) worstBare = bare;
  }
  return { px, whiteShowing: worstShow, colourBare: worstBare, worstOffset: at };
}
