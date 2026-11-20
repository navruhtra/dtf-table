// DTF Table benchmark — the referee. It scores outputs only; it imports nothing from src/, so a change to the tool
// cannot change how the tool is judged. Change this file only in its own PR, and re-record the baseline after.
//
// All quality numbers are MODEL ONLY until a shop's test prints are measured.

/** Pixels whose alpha is neither 0 nor 255. DTF cannot print them. Target 0. */
export function semi(rgba) { let n = 0; for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 0 && rgba[i] < 255) n++; return n; }

/** Misregistration: shift the white against the colour by every (dx, dy) with |dx|, |dy| ≤ k px. At the worst shift,
    count white with no colour over it (a white rim shows) and colour with no white under it (thin, washed-out colour).
    Both per thousand printed colour pixels, so cases of different sizes compare. */
export function register(rgba, white, W, H, k) {
  let colour = 0; for (let p = 0; p < W * H; p++) if (rgba[p * 4 + 3] >= 128) colour++;
  let show = 0, bare = 0;
  for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) {
    let s = 0, b = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const xs = x - dx, ys = y - dy, w = xs >= 0 && ys >= 0 && xs < W && ys < H && white[ys * W + xs] > 0, c = rgba[(y * W + x) * 4 + 3] >= 128;
      if (w && !c) s++; if (c && !w) b++;
    }
    show = Math.max(show, s); bare = Math.max(bare, b);
  }
  return { whiteShowing: colour ? 1000 * show / colour : 0, colourBare: colour ? 1000 * bare / colour : 0 };
}

/** Fade error: wanted alpha and printed coverage (opaque share) each averaged over a box `win` px wide; the mean
    absolute difference over the art's fade pixels. 0 = the fade prints at the right strength everywhere. */
export function fadeError(orig, out, W, H, fade, win) {
  const r = Math.max(1, Math.round(win / 2));
  const sat = (src, f) => { const t = new Float64Array((W + 1) * (H + 1)); for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += f(src[(y * W + x) * 4 + 3]); t[(y + 1) * (W + 1) + x + 1] = t[y * (W + 1) + x + 1] + row; } } return t; };
  const A = sat(orig, a => a / 255), B = sat(out, a => a >= 128 ? 1 : 0);
  const sum = (t, xa, ya, xb, yb) => t[yb * (W + 1) + xb] - t[ya * (W + 1) + xb] - t[yb * (W + 1) + xa] + t[ya * (W + 1) + xa];
  let s = 0, n = 0;
  for (let p = 0; p < W * H; p++) { if (!fade[p]) continue; const x = p % W, y = (p - x) / W, xa = Math.max(0, x - r), ya = Math.max(0, y - r), xb = Math.min(W, x + r + 1), yb = Math.min(H, y + r + 1);
    s += Math.abs(sum(B, xa, ya, xb, yb) - sum(A, xa, ya, xb, yb)) / ((xb - xa) * (yb - ya)); n++; }
  return n ? s / n : 0;
}

/** Thin-feature recall: a stroke under limitMm is found when at least half its pixels are flagged; a stroke at or over
    limitMm + 0.05 is a false alarm when a tenth of its pixels are. flags: Uint8Array (1 = flagged), or null (no check). */
export function thinScore(strokes, flags, limitMm = 0.5) {
  let thin = 0, found = 0, wide = 0, false_ = 0;
  for (const s of strokes) {
    let n = 0, f = 0; for (let p = 0; p < s.mask.length; p++) if (s.mask[p]) { n++; if (flags && flags[p]) f++; }
    const share = n ? f / n : 0;
    if (s.mm < limitMm) { thin++; if (share >= 0.5) found++; } else if (s.mm >= limitMm + 0.05) { wide++; if (share >= 0.1) false_++; }
  }
  return { recall: thin ? found / thin : 1, falseAlarms: false_, thin, wide };
}

/** Film use: art area over film area (sheet width × length used). Higher is better. */
export const filmUse = (artIn2, widthIn, lengthIn) => artIn2 / (widthIn * lengthIn);
