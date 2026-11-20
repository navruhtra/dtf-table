// Unit tests for the DTF Table pure functions. Run: node tests/check.mjs
import { repairAlpha, countSemi, fadeMask, fadeError, ALPHA_DEFAULTS } from "../src/alpha.js";
import { whiteLayer, misregistration, spread } from "../src/white.js";

let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };

/** RGBA image filled by fn(x, y) → [r, g, b, a] */
function img(W, H, fn) { const d = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d.set(fn(x, y), (y * W + x) * 4); return d; }
/** a disc of colour c, radius R, centre (cx, cy), with an anti-aliased rim about 1 px wide (alpha = covered share) */
const disc = (cx, cy, R, c) => (x, y) => { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); const a = Math.max(0, Math.min(1, R - d + 0.5)); return [...c, Math.round(255 * a)]; };
const alphaSum = d => { let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i] / 255; return s; };

// ── alpha repair ──
{ const W = 120, H = 120, a = img(W, H, disc(60, 60, 40, [200, 30, 30]));
  const semi = countSemi(a), r = repairAlpha(a, W, H);
  ok(semi > 100, `hard disc has an anti-aliased rim (${semi} semi-transparent px)`);
  ok(r.stats.semiOut === 0 && countSemi(r.rgba) === 0, `alpha repair leaves 0 semi-transparent px (was ${semi})`);
  ok(r.stats.fade === 0 && r.stats.edge + r.stats.floor === r.stats.semiIn, `a 1 px rim is cut, not halftoned (edge ${r.stats.edge}, under the floor ${r.stats.floor}, fade ${r.stats.fade})`);
  const dA = Math.abs(alphaSum(r.rgba) - alphaSum(a));
  ok(dA <= semi * 0.5, `disc area kept within the rim: ${alphaSum(a).toFixed(0)} → ${alphaSum(r.rgba).toFixed(0)} px`);
  let colourSame = true; for (let i = 0; i < a.length; i += 4) if (a[i] !== r.rgba[i] || a[i + 1] !== r.rgba[i + 1] || a[i + 2] !== r.rgba[i + 2]) colourSame = false;
  ok(colourSame, "alpha repair keeps every pixel's colour"); }

{ // a linear fade to clear, 300 px long (1 in at 300 dpi)
  const W = 300, H = 60, a = img(W, H, x => [20, 90, 200, Math.round(255 * (1 - x / (W - 1)))]);
  const m = fadeMask(a, W, H), inFade = m.reduce((s, v) => s + v, 0), r = repairAlpha(a, W, H);
  ok(inFade > 0.95 * (W - 2) * H, `a fade is marked as fade (${inFade} of ${W * H} px)`);
  ok(r.stats.semiOut === 0, `fade: 0 semi-transparent px after repair (was ${r.stats.semiIn})`);
  const cell = ALPHA_DEFAULTS.dpi / ALPHA_DEFAULTS.lpi, want = alphaSum(a), got = alphaSum(r.rgba);
  ok(Math.abs(got - want) / want < 0.03, `fade: printed area ${got.toFixed(0)} vs wanted ${want.toFixed(0)} px (${(100 * (got - want) / want).toFixed(2)} %)`);
  const e = fadeError(a, r.rgba, W, H, m, 2 * cell);
  ok(e < 0.06, `fade: mean error over 2 halftone cells ${e.toFixed(4)} (model only)`);
  // printed coverage falls with the fade: mean of each 30 px column band never rises by more than noise
  const band = i => { let s = 0; for (let y = 0; y < H; y++) for (let x = i * 30; x < i * 30 + 30; x++) s += r.rgba[(y * W + x) * 4 + 3] / 255; return s / (30 * H); };
  const bands = Array.from({ length: 10 }, (_, i) => band(i)); let mono = true; for (let i = 1; i < 10; i++) if (bands[i] > bands[i - 1] + 0.02) mono = false;
  ok(mono, `fade: coverage falls band by band ${bands.map(v => v.toFixed(2)).join(" ")}`);
  const t = repairAlpha(a, W, H, { mode: "threshold" });
  ok(t.stats.fade === 0 && t.stats.semiOut === 0, "threshold mode: cuts the fade, 0 semi-transparent px");
  // tiles: the right half repaired on its own, placed with x0, gives the same pixels as the whole
  const half = W / 2, right = new Uint8ClampedArray(half * H * 4);
  for (let y = 0; y < H; y++) right.set(a.subarray((y * W + half) * 4, (y * W + W) * 4), y * half * 4);
  const rr = repairAlpha(right, half, H, { x0: half, mode: "halftone", edgePx: 1 });
  let diff = 0; for (let y = 0; y < H; y++) for (let x = 2; x < half; x++) if (rr.rgba[(y * half + x) * 4 + 3] !== r.rgba[(y * W + half + x) * 4 + 3]) diff++;
  ok(diff === 0, `tiles line up: right half alone vs whole sheet, ${diff} px differ (2 px seam margin excluded)`); }

{ const W = 40, H = 40, a = img(W, H, () => [255, 255, 255, 3]), r = repairAlpha(a, W, H);
  ok(r.stats.floor === W * H && alphaSum(r.rgba) === 0, "near-clear haze (alpha 3) is dropped"); }

// ── white layer ──
const square = (x0, y0, s, c) => (x, y) => x >= x0 && x < x0 + s && y >= y0 && y < y0 + s ? [...c, 255] : [0, 0, 0, 0];
{ const W = 100, H = 100, a = img(W, H, square(20, 20, 60, [220, 40, 40]));
  const w0 = whiteLayer(a, W, H, { chokePx: 0 }), w1 = whiteLayer(a, W, H, { chokePx: 1 }), w2 = whiteLayer(a, W, H, { chokePx: 2 });
  ok(w0.stats.white === 3600 && w1.stats.white === 58 * 58 && w2.stats.white === 56 * 56, `choke 0/1/2 px: white ${w0.stats.white}/${w1.stats.white}/${w2.stats.white} px`);
  const m0 = misregistration(w0.colour, w0.white, W, H, 1), m1 = misregistration(w1.colour, w1.white, W, H, 1), m2 = misregistration(w2.colour, w2.white, W, H, 2);
  ok(m0.whiteShowing > 0 && m1.whiteShowing === 0 && m2.whiteShowing === 0, `white showing at ±1 px: choke 0 → ${m0.whiteShowing}, choke 1 → ${m1.whiteShowing}; ±2 px with choke 2 → ${m2.whiteShowing}`);
  ok(m1.colourBare > 0 && m1.colourBare < 60 * 4, `the cost: colour with no white at the worst ±1 px offset, choke 1 → ${m1.colourBare} px`);
  const half = whiteLayer(a, W, H, { chokePx: 0, density: 0.5 });
  ok(half.white[50 * W + 50] === 128, `density 50 % → white value ${half.white[50 * W + 50]}`);
  const sp = whiteLayer(a, W, H, { chokePx: 0, spreadPx: 2 });
  ok(sp.stats.whiteNoColour === 64 * 64 - 3600, `spread 2 px: white outline ${sp.stats.whiteNoColour} px past the colour`);
  ok(spread(new Float32Array([0, 0, 1, 0, 0]), 5, 1, 1).join(",") === "0,1,1,1,0", "spread grows a layer by r px"); }

{ // a 2 px line: a 2 px choke would erase its white; keepThin keeps it
  const W = 60, H = 60, a = img(W, H, (x, y) => x >= 29 && x < 31 && y >= 10 && y < 50 ? [250, 250, 20, 255] : [0, 0, 0, 0]);
  const keep = whiteLayer(a, W, H, { chokePx: 2 }), lose = whiteLayer(a, W, H, { chokePx: 2, keepThin: false });
  ok(lose.stats.colourNoWhite === 80 && keep.stats.colourNoWhite === 0, `2 px line, 2 px choke: colour with no white ${lose.stats.colourNoWhite} px → ${keep.stats.colourNoWhite} with keepThin`); }

{ // knockouts and no-white colours on a black shirt
  const W = 60, H = 30, a = img(W, H, x => x < 20 ? [0, 0, 0, 255] : x < 40 ? [12, 10, 14, 255] : [255, 200, 0, 255]);
  const w = whiteLayer(a, W, H, { chokePx: 0, knockouts: ["#000000"] });
  ok(w.stats.knockedOut === 40 * H && w.colour[3] === 0 && w.colour[(45) * 4 + 3] === 255, `knockout #000000 (ΔE00 ≤ 6) removes the black and near-black: ${w.stats.knockedOut} px`);
  const n = whiteLayer(a, W, H, { chokePx: 0, noWhite: ["#000000"] });
  ok(n.stats.noWhite === 40 * H && n.white[5] === 0 && n.white[45] === 255, `no-white #000000: black prints with no white under it (${n.stats.noWhite} px)`); }

{ // by-colour: less white under a navy than under a yellow, never under minWhite
  const W = 20, H = 10, a = img(W, H, x => x < 10 ? [20, 30, 80, 255] : [250, 220, 30, 255]);
  const w = whiteLayer(a, W, H, { chokePx: 0, mode: "by-colour", minWhite: 0.5 });
  ok(w.white[0] < w.white[15] && w.white[0] >= 127 && w.white[15] === 255, `by-colour: navy white ${w.white[0]}, yellow white ${w.white[15]}`); }

{ // property: on random solid shapes, a choke of k px shows no white under any shift up to ±k (thin parts aside)
  let rnd = 369; const rand = () => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;
  let worst = 0, n = 0;
  for (let t = 0; t < 12; t++) {
    const W = 64, H = 64, cs = Array.from({ length: 4 }, () => [8 + rand() * 48, 8 + rand() * 48, 6 + rand() * 14]);
    const a = img(W, H, (x, y) => cs.some(([cx, cy, R]) => Math.hypot(x - cx, y - cy) < R) ? [90, 160, 60, 255] : [0, 0, 0, 0]);
    for (const k of [1, 2]) { const w = whiteLayer(a, W, H, { chokePx: k, keepThin: false }), m = misregistration(w.colour, w.white, W, H, k); worst = Math.max(worst, m.whiteShowing); n++; }
  }
  ok(worst === 0, `random shapes (${n} cases): white showing at ±k px with a k px choke, worst ${worst} px`); }

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
