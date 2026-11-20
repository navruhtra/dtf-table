// Write the DTF test targets: one 22 in wide sheet at 300 dpi for a shop to print, press and measure. The
// write-up is docs/TEST-TARGETS.md. Each patch is labelled with its id (A1, B3, …) in black ink, so a photo of the print
// can be matched to this file.
//   node scripts/test-targets.mjs <output folder> [--width 22]
// Writes dtf-targets.png (colour), dtf-targets-white.png (white layer) and dtf-targets.pdf, all at 300 dpi.
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { repairAlpha } from "../src/alpha.js";
import { whiteLayer } from "../src/white.js";
import { writePNG, writePDF } from "../src/sheet.js";
import { deflateRaw, fileSink } from "../src/node.js";

const out = process.argv[2]; if (!out) { console.error("usage: node scripts/test-targets.mjs <output folder> [--width 22]"); process.exit(2); }
const wi = process.argv.indexOf("--width"), widthIn = wi > 0 ? +process.argv[wi + 1] : 22;
const DPI = 300, MM = DPI / 25.4, W = Math.round(widthIn * DPI);
mkdirSync(out, { recursive: true });

/* A section is drawn into its own buffer, repaired, given its white with its own settings, then stacked. */
const sections = [], key = [];
function section(heightIn, draw, white = { chokePx: 1 }, alpha = {}) {
  const H = Math.round(heightIn * DPI), rgba = new Uint8ClampedArray(W * H * 4);
  const s = { W, H, rgba, white, alpha, set(x, y, c) { if (x < 0 || y < 0 || x >= W || y >= H) return; rgba.set(c, ((y | 0) * W + (x | 0)) * 4); } };
  draw(s); sections.push(s); return s;
}
const fillRect = (s, x0, y0, w, h, c) => { for (let y = Math.round(y0); y < Math.round(y0 + h); y++) for (let x = Math.round(x0); x < Math.round(x0 + w); x++) s.set(x, y, c); };
// a disc always covers at least its centre pixel: at 300 dpi a 0.1 mm dot is 1.2 px across
const fillDisc = (s, cx, cy, r, c) => { s.set(cx, cy, c); for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d <= r) s.set(x, y, c); } };

/* A 5 × 7 bitmap font for the labels: digits, capitals, and . - % × space. */
const FONT = { "0": "0e11131519110e", "1": "040c040404040e", "2": "0e11010204081f", "3": "1f02040201110e", "4": "02060a121f0202", "5": "1f101e0101110e",
  "6": "06081e1111110e", "7": "1f010204080808", "8": "0e11110e11110e", "9": "0e11110f01020c", A: "0e11111f111111", B: "1e11111e11111e", C: "0e11101010110e",
  D: "1c12111111121c", E: "1f10101e10101f", F: "1f10101e101010", G: "0e11101711110f", H: "1111111f111111", I: "0e04040404040e", K: "11121418141211",
  L: "1010101010101f", M: "111b1515111111", N: "11111915131111", O: "0e11111111110e", P: "1e11111e101010", R: "1e11111e141211", S: "0f10100e01011e",
  T: "1f040404040404", U: "1111111111110e", V: "11111111110a04", W: "11111115151b11", X: "11110a040a1111", Y: "11110a04040404", ".": "00000000000c0c", "-": "00000e00000000",
  "%": "18190204081303", " ": "00000000000000" };
function text(s, x, y, str, px = 6, c = [20, 20, 20, 255]) {
  for (const ch of str.toUpperCase()) { const g = FONT[ch] || FONT[" "];
    for (let r = 0; r < 7; r++) { const bits = parseInt(g.slice(r * 2, r * 2 + 2), 16); for (let col = 0; col < 5; col++) if (bits & (1 << (4 - col))) fillRect(s, x + col * px, y + r * px, px, px, c); }
    x += 6 * px; }
}
const INKS = [["red", [210, 30, 40, 255]], ["royal", [30, 60, 170, 255]], ["black", [15, 15, 15, 255]], ["yellow", [250, 215, 20, 255]], ["green", [20, 140, 70, 255]], ["grey", [128, 128, 128, 255]]];

/* A — choke ladder: the same art at white chokes 0, 1, 2, 3 and 4 px (0 to 0.34 mm). Each tile: six ink squares,
   a ring, thin bars and small type. Measure: white rim showing at the edges (loupe), and colour washing out at edges. */
for (const choke of [0, 1, 2, 3, 4]) { section(1.4, s => {
  const y0 = 0.3 * DPI; text(s, 0.2 * DPI, 0.08 * DPI, `A${choke + 1}  WHITE CHOKE ${choke} PX  ${(choke * 25.4 / DPI).toFixed(2)} MM`);
  INKS.forEach(([, c], i) => { const x = (0.2 + i * 1.2) * DPI; fillRect(s, x, y0, 0.9 * DPI, 0.9 * DPI, c); });
  const rx = (0.2 + 6 * 1.2 + 0.45) * DPI; fillDisc(s, rx, y0 + 0.45 * DPI, 0.45 * DPI, [210, 30, 40, 255]); fillDisc(s, rx, y0 + 0.45 * DPI, 0.3 * DPI, [0, 0, 0, 0]);
  [0.3, 0.5, 0.8, 1.2].forEach((mm, i) => fillRect(s, (8.9 + i * 0.35) * DPI, y0, mm * MM, 0.9 * DPI, [30, 60, 170, 255]));
  text(s, 10.5 * DPI, y0 + 0.1 * DPI, "SMALL TYPE 2 MM", Math.max(1, Math.round(2 * MM / 7)), [210, 30, 40, 255]);
  text(s, 10.5 * DPI, y0 + 0.4 * DPI, "SMALL TYPE 3 MM", Math.max(1, Math.round(3 * MM / 7)), [30, 60, 170, 255]);
}, { chokePx: choke, keepThin: true }); key.push({ id: `A${choke + 1}`, what: `white choke ${choke} px (${(choke * 25.4 / DPI).toFixed(2)} mm)` }); }

/* B — smallest line, gap and dot. Positive lines and dots in black; reverse lines and holes cut from a royal block. */
const SIZES = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0];
section(2.6, s => {
  text(s, 0.2 * DPI, 0.08 * DPI, "B1 LINES  B2 REVERSE LINES  B3 DOTS  B4 HOLES   MM:");
  SIZES.forEach((mm, i) => { const x = (0.3 + i * 0.75) * DPI, w = mm * MM;
    text(s, x, 0.32 * DPI, mm.toFixed(2), 5);
    fillRect(s, x, 0.55 * DPI, w, 0.8 * DPI, [15, 15, 15, 255]); // B1 vertical line
    fillRect(s, x + 0.15 * DPI, 0.55 * DPI + i * 0.07 * DPI, 0.4 * DPI, w, [15, 15, 15, 255]); // B1 horizontal line
    fillRect(s, x - 0.08 * DPI, 1.45 * DPI, 0.66 * DPI, 1.0 * DPI, [30, 60, 170, 255]); // block for reverse and holes
    fillRect(s, x + 0.05 * DPI, 1.5 * DPI, w, 0.45 * DPI, [0, 0, 0, 0]); // B2 reverse line
    for (let k = 0; k < 3; k++) fillDisc(s, x + 0.35 * DPI + k * 0.08 * DPI, 1.62 * DPI, mm * MM / 2, [250, 250, 250, 255]); // B3 dots (white ink) on the block
    for (let k = 0; k < 3; k++) fillDisc(s, x + 0.12 * DPI + k * 0.15 * DPI, 2.2 * DPI, mm * MM / 2, [0, 0, 0, 0]); // B4 holes
  });
}, { chokePx: 1, keepThin: true });
key.push({ id: "B1", what: `positive lines ${SIZES.join(", ")} mm, vertical and horizontal` }, { id: "B2", what: "reverse lines (gaps) cut from a royal block" },
  { id: "B3", what: "white dots of the same diameters on royal" }, { id: "B4", what: "holes of the same diameters in royal" });

/* C — halftone ramps: a fade from 0 to 100 % in steps of 10 at 25, 35 and 45 LPI, each with smallest dots 5, 10 and
   15 %. The art is a fade in alpha; alpha repair screens it with that row's settings. Measure: the first step that
   holds whole dots, and any step that plugs or flakes. */
const RAMPS = [];
for (const lpi of [25, 35, 45]) for (const minDot of [0.05, 0.1, 0.15]) RAMPS.push({ lpi, minDot });
RAMPS.forEach(({ lpi, minDot }, i) => { section(0.75, s => {
  text(s, 0.2 * DPI, 0.06 * DPI, `C${i + 1} ${lpi} LPI  SMALLEST DOT ${Math.round(minDot * 100)}%`, 5);
  for (let step = 0; step <= 10; step++) { const x0 = (0.2 + step * 0.9) * DPI, a = Math.round(255 * step / 10);
    text(s, x0, 0.22 * DPI, `${step * 10}`, 4); fillRect(s, x0, 0.35 * DPI, 0.8 * DPI, 0.35 * DPI, [210, 30, 40, a]); }
  for (let x = 0; x < 10.6 * DPI; x++) { const a = Math.round(255 * x / (10.6 * DPI)); for (let y = 0.35 * DPI; y < 0.7 * DPI; y++) s.set(10.4 * DPI + x, y, [30, 60, 170, a]); }
}, { chokePx: 1, keepThin: true }, { lpi, minDot, edgePx: 0 }); key.push({ id: `C${i + 1}`, what: `halftone steps 0–100 % and a continuous fade at ${lpi} LPI, smallest dot ${Math.round(minDot * 100)} %` }); });

/* D — wash patches: 1.5 in solids in each ink, white alone, and a fine star, for wash tests (5, 10, 25 washes). */
section(2.0, s => {
  text(s, 0.2 * DPI, 0.08 * DPI, "D WASH  D1-D6 SOLIDS  D7 WHITE ONLY  D8 FINE STAR");
  INKS.forEach(([, c], i) => { const x = (0.2 + i * 1.8) * DPI; text(s, x, 0.3 * DPI, `D${i + 1}`, 5); fillRect(s, x, 0.45 * DPI, 1.5 * DPI, 1.4 * DPI, c); });
  const x7 = (0.2 + 6 * 1.8) * DPI; text(s, x7, 0.3 * DPI, "D7", 5); fillRect(s, x7, 0.45 * DPI, 1.5 * DPI, 1.4 * DPI, [255, 255, 255, 255]);
  const cx = (0.2 + 7 * 1.8 + 0.75) * DPI, cy = 1.15 * DPI; text(s, cx - 0.75 * DPI, 0.3 * DPI, "D8", 5);
  for (let k = 0; k < 36; k++) { const t = k * Math.PI / 18, w = 0.3 * MM; for (let r = 0; r < 0.7 * DPI; r++) fillRect(s, cx + r * Math.cos(t), cy + r * Math.sin(t), w, w, [15, 15, 15, 255]); }
}, { chokePx: 1, keepThin: true });
key.push({ id: "D1–D6", what: "solids in red, royal, black, yellow, green, grey" }, { id: "D7", what: "white ink alone" }, { id: "D8", what: "0.3 mm star, 36 spokes" });

/* Stack, repair, white, write. */
const H = sections.reduce((t, s) => t + s.H, 0), colour = new Uint8ClampedArray(W * H * 4), white = new Uint8Array(W * H);
let y = 0;
for (const s of sections) {
  const r = repairAlpha(s.rgba, s.W, s.H, { dpi: DPI, ...s.alpha, y0: 0 }), w = whiteLayer(r.rgba, s.W, s.H, s.white);
  colour.set(w.colour, y * W * 4); white.set(w.white, y * W); y += s.H;
}
let semi = 0; for (let i = 3; i < colour.length; i += 4) if (colour[i] && colour[i] !== 255) semi++;
const bandOf = (buf, ch) => (y0, h) => buf.subarray(y0 * W * ch, (y0 + h) * W * ch);
for (const [name, write] of [
  ["dtf-targets.png", sink => writePNG({ W, H, ch: 4, dpi: DPI, band: bandOf(colour, 4), sink, deflateRaw })],
  ["dtf-targets-white.png", sink => writePNG({ W, H, ch: 1, dpi: DPI, band: bandOf(white, 1), sink, deflateRaw })],
  ["dtf-targets.pdf", sink => writePDF({ W, H, dpi: DPI, sink, deflateRaw,
    colour: (y0, h) => { const o = new Uint8Array(W * h * 3); for (let i = 0; i < W * h; i++) { const q = (y0 * W + i) * 4; o[i * 3] = colour[q]; o[i * 3 + 1] = colour[q + 1]; o[i * 3 + 2] = colour[q + 2]; } return o; },
    alpha: (y0, h) => { const o = new Uint8Array(W * h); for (let i = 0; i < W * h; i++) o[i] = colour[(y0 * W + i) * 4 + 3]; return o; } })],
]) { const sink = fileSink(join(out, name)); write(sink); sink.close(); console.log(`${name}: ${(statSync(join(out, name)).size / 1e6).toFixed(1)} MB`); }
writeFileSync(join(out, "key.json"), JSON.stringify({ widthIn, heightIn: H / DPI, dpi: DPI, patches: key }, null, 1));
console.log(`sheet ${widthIn} × ${(H / DPI).toFixed(2)} in (${W} × ${H} px), ${key.length} patch groups, semi-transparent px: ${semi}`);
