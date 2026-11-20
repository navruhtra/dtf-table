// DTF Table benchmark. Every number it prints comes from referee.mjs on fixed test art (cases.mjs).
//   node benchmark/run.mjs [--python <python with rectpack>] [--update] [--json <out file>]
// --update rewrites benchmark/baseline.json (only on main, in its own PR, after a merged change).
// Exit code: 0 when DTF Table is no worse than the baseline on any measure (beyond its tolerance), 2 when it is.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cases, nestCases, DPI } from "./cases.mjs";
import { semi, register, fadeError, thinScore, filmUse } from "./referee.mjs";
import { repairAlpha, ALPHA_DEFAULTS } from "../src/alpha.js";
import { whiteLayer } from "../src/white.js";
import { thinMaps } from "../src/preflight.js";
import { nest } from "../src/nest.js";

const here = dirname(fileURLToPath(import.meta.url)), arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const python = arg("--python") || "python3", update = process.argv.includes("--update"), jsonOut = arg("--json");
const WIN = Math.round(2 * DPI / ALPHA_DEFAULTS.lpi); // fade error window: two halftone cells

/* Methods for one piece of art. Each returns { rgba, white, flags } (flags: thin-line pixels, or null: no check).
   as-is:     the PNG sent to the RIP untouched; the RIP puts full white under every pixel with any alpha.
   threshold: what a plain "remove semi-transparency" step does: alpha ≥ 128 prints, white under all of it, no choke.
   dtf-table: alpha repair (fades to halftone) and the white layer, 1 px choke; preflight's thin-line check (on the art).
   dtf-table c2: the same with a 2 px choke. */
const METHODS = {
  "as-is": c => { const white = new Uint8Array(c.W * c.H); for (let p = 0; p < white.length; p++) white[p] = c.rgba[p * 4 + 3] ? 255 : 0; return { rgba: c.rgba, white, flags: null }; },
  "threshold": c => { const rgba = new Uint8ClampedArray(c.rgba), white = new Uint8Array(c.W * c.H);
    for (let p = 0; p < white.length; p++) { const on = rgba[p * 4 + 3] >= 128; rgba[p * 4 + 3] = on ? 255 : 0; white[p] = on ? 255 : 0; } return { rgba, white, flags: null }; },
  "dtf-table": c => ours(c, 1),
  "dtf-table c2": c => ours(c, 2),
};
function ours(c, chokePx) {
  const r = repairAlpha(c.rgba, c.W, c.H, { dpi: DPI }), w = whiteLayer(r.rgba, c.W, c.H, { chokePx });
  let flags = null;
  if (c.strokes) { const { thin } = thinMaps(c.rgba, c.W, c.H, DPI / 25.4); flags = new Uint8Array(thin.length); for (let p = 0; p < thin.length; p++) flags[p] = thin[p] > 0 ? 1 : 0; }
  return { rgba: w.colour, white: w.white, flags };
}

const rows = [];
for (const c of cases()) for (const [name, fn] of Object.entries(METHODS)) {
  const o = fn(c), r1 = register(o.rgba, o.white, c.W, c.H, 1), r2 = register(o.rgba, o.white, c.W, c.H, 2);
  const row = { case: c.id, method: name, semi: semi(o.rgba), show1: r1.whiteShowing, bare1: r1.colourBare, show2: r2.whiteShowing, bare2: r2.colourBare,
    fade: c.fade.some(v => v) ? fadeError(c.rgba, o.rgba, c.W, c.H, c.fade, WIN) : null };
  if (c.strokes) { const t = thinScore(c.strokes, o.flags); row.recall = t.recall; row.falseAlarms = t.falseAlarms; }
  rows.push(row);
}

// nesting: DTF Table vs rectpack (best of all its algorithms and sort orders)
const nc = nestCases(), nestRows = [];
let rp = null;
try { rp = JSON.parse(execFileSync(python, ["-I", join(here, "rectpack_strip.py")], { input: JSON.stringify({ cases: nc }), maxBuffer: 1 << 26 }).toString()); }
catch (e) { console.error(`rectpack not run (${String(e.message).split("\n")[0]}); pass --python <python with rectpack==0.2.2>`); }
for (const c of nc) {
  const area = c.pieces.reduce((s, p) => s + p.wIn * p.hIn * (p.copies ?? 1), 0), n = c.pieces.reduce((s, p) => s + (p.copies ?? 1), 0);
  const t0 = performance.now(), ours = nest(c.pieces, { widthIn: c.widthIn, gapIn: c.gapIn }), ms = performance.now() - t0, sh = ours.sheets[0];
  const theirs = rp && rp.cases.find(x => x.id === c.id);
  nestRows.push({ case: c.id, pieces: n, oursIn: sh.lengthIn, oursUse: filmUse(area, c.widthIn, sh.lengthIn), oursMs: ms,
    rpIn: theirs ? theirs.lengthIn : null, rpUse: theirs ? filmUse(area, c.widthIn, theirs.lengthIn) : null, rpBest: theirs ? theirs.best : null, areaBoundIn: area / c.widthIn });
}

// print
const f = (v, d = 2) => v == null ? "—" : typeof v === "number" ? v.toFixed(d) : String(v);
console.log("\nArt (model only). semi: semi-transparent px. show/bare: white showing past colour / colour with no white, per 1000 colour px, at the worst ±1 and ±2 px shift. fade: mean fade error (0–1). recall: thin strokes under 0.5 mm flagged.\n");
console.log("| case | method | semi | show ±1 | bare ±1 | show ±2 | bare ±2 | fade | recall | false alarms |\n|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.case} | ${r.method} | ${r.semi} | ${f(r.show1)} | ${f(r.bare1)} | ${f(r.show2)} | ${f(r.bare2)} | ${f(r.fade, 4)} | ${r.recall == null ? "—" : f(r.recall)} | ${r.falseAlarms ?? "—"} |`);
console.log(`\nNesting, 22 in roll, 0.25 in gap. rectpack ${rp ? rp.version : "(not run)"}: best of 16 algorithms × 7 sort orders, rotation on.\n`);
console.log("| case | pieces | DTF Table length in | film use | rectpack best length in | film use | rectpack's best setting | area bound in |\n|---|---|---|---|---|---|---|---|");
for (const r of nestRows) console.log(`| ${r.case} | ${r.pieces} | ${f(r.oursIn)} | ${f(100 * r.oursUse, 1)} % | ${f(r.rpIn)} | ${r.rpUse == null ? "—" : f(100 * r.rpUse, 1) + " %"} | ${r.rpBest ?? "—"} | ${f(r.areaBoundIn)} |`);
const tot = k => nestRows.reduce((s, r) => s + (r[k] ?? 0), 0);
console.log(`| total | ${tot("pieces")} | ${f(tot("oursIn"))} | | ${rp ? f(tot("rpIn")) : "—"} | | | ${f(tot("areaBoundIn"))} |`);

// baseline
const result = { rows, nestRows: nestRows.map(({ oursMs, ...r }) => r) }, basePath = join(here, "baseline.json");
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(result, null, 1));
if (update) { writeFileSync(basePath, JSON.stringify(result, null, 1) + "\n"); console.log(`\nbaseline written: ${basePath}`); process.exit(0); }
if (!existsSync(basePath)) { console.log("\nno baseline.json yet"); process.exit(0); }
const base = JSON.parse(readFileSync(basePath, "utf8")), worse = [];
// lower is better for these; tolerance absorbs nothing but rounding (the tool is deterministic)
for (const r of rows.filter(r => r.method.startsWith("dtf-table"))) { const b = base.rows.find(x => x.case === r.case && x.method === r.method); if (!b) continue;
  for (const k of ["semi", "show1", "bare1", "show2", "bare2", "fade"]) if (r[k] != null && b[k] != null && r[k] > b[k] + 1e-6) worse.push(`${r.case} ${r.method} ${k}: ${f(b[k], 4)} → ${f(r[k], 4)}`);
  if (r.recall != null && b.recall != null && r.recall < b.recall) worse.push(`${r.case} ${r.method} recall: ${b.recall} → ${r.recall}`);
  if (r.falseAlarms != null && b.falseAlarms != null && r.falseAlarms > b.falseAlarms) worse.push(`${r.case} ${r.method} false alarms: ${b.falseAlarms} → ${r.falseAlarms}`); }
for (const r of nestRows) { const b = base.nestRows.find(x => x.case === r.case); if (b && r.oursIn > b.oursIn + 1e-9) worse.push(`nest ${r.case}: ${b.oursIn} → ${r.oursIn} in`); }
console.log(worse.length ? `\nWorse than baseline:\n${worse.join("\n")}` : "\nNo measure worse than baseline.");
process.exit(worse.length ? 2 : 0);
