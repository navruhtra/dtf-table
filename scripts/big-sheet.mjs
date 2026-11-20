// Write a full-size gang sheet (22 in roll, about 100 in long, 300 dpi) as PNG, TIFF and PDF, and report time,
// file sizes and peak memory. Shows the sheet is never held whole.
//   node scripts/big-sheet.mjs <output folder> [png,tiff,pdf]
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { nest } from "../src/nest.js";
import { prepareDesign, layout, writeSheet } from "../src/sheet.js";
import { deflateRaw, fileSink } from "../src/node.js";

const dir = process.argv[2]; if (!dir) { console.error("usage: node scripts/big-sheet.mjs <output folder> [formats]"); process.exit(2); }
const formats = (process.argv[3] || "png,tiff,pdf").split(","); mkdirSync(dir, { recursive: true });
const dpi = 300, t0 = performance.now();
function art(W, H, fn) { const d = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d.set(fn(x / W, y / H), (y * W + x) * 4); return { W, H, rgba: d }; }
// four test designs at 300 ppi for their print size: a disc with a glow, a fade to clear, a ring, a block of stripes
const arts = {
  glow: art(1500, 1500, (u, v) => { const d = Math.hypot(u - 0.5, v - 0.5); return [230, 60, 40, Math.round(255 * Math.max(0, Math.min(1, (0.45 - d) / 0.15)))]; }),
  fade: art(2400, 900, u => [30, 110, 220, Math.round(255 * Math.max(0, 1 - u))]),
  ring: art(1200, 1200, (u, v) => { const d = Math.hypot(u - 0.5, v - 0.5); return [250, 210, 30, d > 0.3 && d < 0.48 ? 255 : 0]; }),
  stripes: art(1800, 1200, u => [20, 20, 20, Math.floor(u * 60) % 2 ? 255 : 0]),
};
const sizes = { glow: [5, 5], fade: [8, 3], ring: [4, 4], stripes: [6, 4] }, copies = { glow: 25, fade: 15, ring: 32, stripes: 15 };
const { sheets } = nest(Object.keys(arts).map(id => ({ id, wIn: sizes[id][0], hIn: sizes[id][1], copies: copies[id] })), { widthIn: 22, gapIn: 0.25 });
const sh = sheets[0];
const designs = new Map(Object.keys(arts).map(id => [id, prepareDesign(arts[id], { wIn: sizes[id][0], hIn: sizes[id][1], dpi })]));
const lay = layout(sh, designs, dpi), t1 = performance.now();
console.log(`sheet ${sh.widthIn} × ${sh.lengthIn} in, ${lay.W} × ${lay.H} px (${(lay.W * lay.H * 4 / 1e6).toFixed(0)} MB as one RGBA buffer), ${sh.placements.length} pieces, film use ${(100 * sh.filmUse).toFixed(1)} %`);
console.log(`prepare and nest: ${((t1 - t0) / 1000).toFixed(1)} s`);
for (const f of formats) {
  const path = join(dir, `sheet.${f === "tiff" ? "tif" : f}`), sink = fileSink(path), t = performance.now();
  writeSheet({ lay, dpi, format: f, sink, deflateRaw, compression: "none" }); sink.close();
  console.log(`${f}: ${((performance.now() - t) / 1000).toFixed(1)} s, ${(statSync(path).size / 1e6).toFixed(1)} MB → ${path}`);
}
console.log(`peak memory (max RSS): ${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB`);
