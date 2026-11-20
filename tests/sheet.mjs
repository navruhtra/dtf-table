// Tests for machine profiles, nesting, the tiled writers and preflight. Run: node tests/sheet.mjs
import { inflateSync } from "node:zlib";
import { newMachine, cleanMachine, localMachines, sheetLimits, DTF_PRESETS } from "../src/machines.js";
import { nest, validSheet } from "../src/nest.js";
import { prepareDesign, layout, composeBand, writeSheet, resample, rotate90 } from "../src/sheet.js";
import { preflight } from "../src/preflight.js";
import { deflateRaw, memorySink } from "../src/node.js";

let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
let seed = 369; const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
function img(W, H, fn) { const d = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d.set(fn(x, y), (y * W + x) * 4); return d; }

// ── machine profiles ──
{ ok(DTF_PRESETS.map(p => p.widthIn).join(",") === "13,22,24", "presets: 13, 22 and 24 in rolls");
  const m = newMachine("roll-24"); ok(m && m.media.widthIn === 24 && m.white.supply === "none" && m.dpi.file === 300, "new 24 in profile: white made by the RIP, 300 dpi file");
  const c = newMachine("custom", { name: "Back room", media: { kind: "roll", widthIn: 16.5, maxLengthIn: 600 } });
  ok(c && c.preset === "custom" && sheetLimits(c).widthIn === 16.5 && sheetLimits(c).maxLengthIn === 600, "custom width and longest print");
  const bad = cleanMachine({ ...m, media: { kind: "roll", widthIn: -3 }, white: { supply: "magic" }, service: "laser" });
  ok(!bad.machine && bad.errors.length === 3, `bad profile rejected: ${bad.errors.join("; ")}`);
  const dtg = cleanMachine({ ...m, service: "dtg", media: { kind: "platen", widthIn: 16, heightIn: 20 }, dtg: { pretreat: true } });
  ok(dtg.machine && dtg.machine.dtg.pretreat === true, "unknown keys (a dtg block) are kept");
  ok(m.verify.includes("white.ripMakesWhite") && cleanMachine({ ...m, sources: [{ url: 1 }, { url: "u", what: "w" }], verify: ["a", 2] }).machine.sources.length === 1, "sources and verify lists kept and checked");
  const mem = {}, store = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } }, lm = localMachines(store);
  const s1 = lm.save(m), s2 = lm.save(/** @type {any} */ (dtg.machine));
  ok(s1.ok && s2.ok && lm.list("dtf").length === 1 && lm.list("dtg").length === 1, "saved machines grouped by service");
  lm.remove("dtf", s1.machine.id); ok(lm.list("dtf").length === 0, "remove a saved machine");
  mem["adn.machines.v1"] = "{not json"; ok(lm.list("dtf").length === 0, "broken storage reads as empty");
  const throwing = localMachines({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } });
  ok(throwing.list("dtf").length === 0 && throwing.save(m).ok === false, "blocked storage: empty list, save reports failure"); }

// ── nesting ──
{ const pieces = Array.from({ length: 14 }, (_, i) => ({ id: "d" + i, wIn: 2 + Math.round(rand() * 900) / 100, hIn: 2 + Math.round(rand() * 900) / 100, copies: 1 + Math.floor(rand() * 4) }));
  const want = pieces.reduce((s, p) => s + p.copies, 0), area = pieces.reduce((s, p) => s + p.wIn * p.hIn * p.copies, 0);
  const { sheets, tooLarge } = nest(pieces, { widthIn: 22, gapIn: 0.25 });
  const placed = sheets.reduce((s, sh) => s + sh.placements.length, 0);
  ok(sheets.length === 1 && placed === want && !tooLarge.length, `14 designs, ${want} copies: all placed on one 22 in sheet`);
  ok(sheets.every(s => validSheet(s, 0.25)), "no overlaps; every piece inside the sheet and 0.25 in from the next");
  const s = sheets[0]; ok(Math.abs(s.usedIn2 - area) < 0.01, `film use ${(100 * s.filmUse).toFixed(1)} % (${s.usedIn2.toFixed(1)} in² of art on 22 × ${s.lengthIn} in)`);
  const lowerBound = area / 22; ok(s.lengthIn >= lowerBound, `length ${s.lengthIn} in ≥ area bound ${lowerBound.toFixed(2)} in`);
  const plain = nest(pieces, { widthIn: 22, gapIn: 0.25, search: 0 }), again = nest(pieces, { widthIn: 22, gapIn: 0.25 });
  ok(s.lengthIn <= plain.sheets[0].lengthIn && again.sheets[0].lengthIn === s.lengthIn && JSON.stringify(again.sheets[0].placements) === JSON.stringify(s.placements),
    `local search: ${plain.sheets[0].lengthIn} → ${s.lengthIn} in, same sheet on a second run`);
  const turn = nest([{ id: "wide", wIn: 20, hIn: 10 }], { widthIn: 13 });
  ok(turn.sheets[0].placements[0].rotated && turn.sheets[0].lengthIn === 20, "a 20 × 10 in design turns to fit a 13 in roll");
  const noTurn = nest([{ id: "wide", wIn: 20, hIn: 10, rotate: false }], { widthIn: 13 });
  ok(noTurn.tooLarge[0] === "wide" && !noTurn.sheets.length, "a design that may not turn and is too wide is reported, not placed");
  const split = nest([{ id: "a", wIn: 10, hIn: 10, copies: 12 }], { widthIn: 22, maxLengthIn: 40, gapIn: 0.25 });
  ok(split.sheets.length === 2 && split.sheets.every(t => t.lengthIn <= 40 && validSheet(t, 0.25)) && split.sheets.reduce((n, t) => n + t.placements.length, 0) === 12,
    `12 copies of 10 × 10 in, 40 in longest print: ${split.sheets.length} sheets of ${split.sheets.map(t => t.lengthIn).join(" and ")} in`);
  const edge = nest([{ id: "a", wIn: 5, hIn: 5 }], { widthIn: 22, edgeIn: 1 });
  ok(edge.sheets[0].placements[0].yIn === 1 && edge.sheets[0].lengthIn === 7, "1 in clear film at both ends"); }

// ── writers ──
/** decode our PNG: chunks, inflate, unfilter (any filter type) */
function readPNG(b) {
  const dv = new DataView(b.buffer, b.byteOffset); let p = 8, W = 0, H = 0, ct = 0, idat = [], phys = 0;
  while (p < b.length) { const len = dv.getUint32(p), t = String.fromCharCode(...b.subarray(p + 4, p + 8)), d = b.subarray(p + 8, p + 8 + len);
    if (t === "IHDR") { W = dv.getUint32(p + 8); H = dv.getUint32(p + 12); ct = b[p + 17]; } if (t === "IDAT") idat.push(d); if (t === "pHYs") phys = dv.getUint32(p + 8); p += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)), ch = ct === 6 ? 4 : 1, st = W * ch, out = new Uint8Array(W * H * ch);
  for (let y = 0; y < H; y++) { const f = raw[y * (st + 1)];
    for (let i = 0; i < st; i++) { const x = raw[y * (st + 1) + 1 + i], a = i >= ch ? out[y * st + i - ch] : 0, up = y ? out[(y - 1) * st + i] : 0, c = i >= ch && y ? out[(y - 1) * st + i - ch] : 0;
      const pr = f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : (() => { const q = a + up - c, pa = Math.abs(q - a), pb = Math.abs(q - up), pc = Math.abs(q - c); return pa <= pb && pa <= pc ? a : pb <= pc ? up : c; })();
      out[y * st + i] = (x + pr) & 255; } }
  return { W, H, ch, px: out, dpi: Math.round(phys * 0.0254) };
}
function readTIFF(b) {
  const dv = new DataView(b.buffer, b.byteOffset), ifd = dv.getUint32(4, true), n = dv.getUint16(ifd, true), tags = {};
  for (let i = 0; i < n; i++) { const o = ifd + 2 + i * 12, tag = dv.getUint16(o, true), type = dv.getUint16(o + 2, true), cnt = dv.getUint32(o + 4, true), sz = (type === 3 ? 2 : type === 4 ? 4 : 8) * cnt, at = sz <= 4 ? o + 8 : dv.getUint32(o + 8, true);
    const vals = []; for (let k = 0; k < (type === 5 ? 2 * cnt : cnt); k++) vals.push(type === 3 ? dv.getUint16(at + k * 2, true) : dv.getUint32(at + k * 4, true)); tags[tag] = vals; }
  const parts = tags[273].map((off, i) => { const d = b.subarray(off, off + tags[279][i]); return tags[259][0] === 8 ? inflateSync(d) : d; });
  return { W: tags[256][0], H: tags[257][0], ch: tags[277][0], px: Buffer.concat(parts), tags };
}
{ const dpi = 100; // small sheet: a disc with a soft glow, and a square that must turn
  const discArt = { W: 300, H: 300, rgba: img(300, 300, (x, y) => { const d = Math.hypot(x - 150, y - 150); return [220, 40, 30, Math.round(255 * Math.max(0, Math.min(1, (130 - d) / 30)))]; }) };
  const barArt = { W: 400, H: 100, rgba: img(400, 100, () => [20, 90, 200, 255]) };
  const { sheets } = nest([{ id: "disc", wIn: 3, hIn: 3, copies: 3 }, { id: "bar", wIn: 8, hIn: 2 }], { widthIn: 7, gapIn: 0.2 });
  const sh = sheets[0], designs = new Map([["disc", prepareDesign(discArt, { wIn: 3, hIn: 3, dpi })], ["bar", prepareDesign(barArt, { wIn: 8, hIn: 2, dpi })]]);
  ok(sh.placements.some(p => p.id === "bar" && p.rotated), "the 8 in bar turns onto the 7 in sheet");
  const lay = layout(sh, designs, dpi), full = composeBand(lay, 0, lay.H), white = composeBand(lay, 0, lay.H, "white");
  let semi = 0; for (let i = 3; i < full.length; i += 4) if (full[i] && full[i] !== 255) semi++;
  ok(semi === 0, `composed sheet ${lay.W} × ${lay.H} px: 0 semi-transparent px`);
  const sink = memorySink(); writeSheet({ lay, dpi, format: "png", sink, deflateRaw, bandRows: 37 }); const png = readPNG(sink.bytes());
  ok(png.W === lay.W && png.H === lay.H && png.dpi === dpi && Buffer.compare(Buffer.from(png.px), Buffer.from(full)) === 0, `PNG in 37-row bands reads back identical to the whole sheet (${sink.pos} bytes)`);
  const ws = memorySink(); writeSheet({ lay, dpi, format: "png", layer: "white", sink: ws, deflateRaw }); const wpng = readPNG(ws.bytes());
  ok(wpng.ch === 1 && Buffer.compare(Buffer.from(wpng.px), Buffer.from(white)) === 0, "white PNG (gray) reads back identical");
  for (const compression of ["none", "deflate"]) { const ts = memorySink(); writeSheet({ lay, dpi, format: "tiff", sink: ts, deflateRaw, bandRows: 50, compression }); const t = readTIFF(ts.bytes());
    ok(t.W === lay.W && t.H === lay.H && t.ch === 4 && t.tags[338][0] === 2 && t.tags[282][0] === dpi && Buffer.compare(t.px, Buffer.from(full)) === 0, `TIFF (${compression}) reads back identical, unassociated alpha, ${dpi} dpi (${ts.pos} bytes)`); }
  const ps = memorySink(); writeSheet({ lay, dpi, format: "pdf", sink: ps, deflateRaw, bandRows: 64 }); const pdf = Buffer.from(ps.bytes()), txt = pdf.toString("latin1");
  const streams = [...txt.matchAll(/(?<!end)stream\n/g)].map(m => m.index + 7), rgbLen = +txt.match(/5 0 obj\n(\d+)/)[1], aLen = +txt.match(/7 0 obj\n(\d+)/)[1];
  const rgb = inflateSync(pdf.subarray(streams[0], streams[0] + rgbLen)), al = inflateSync(pdf.subarray(streams[1], streams[1] + aLen));
  let same = rgb.length === lay.W * lay.H * 3 && al.length === lay.W * lay.H;
  for (let p = 0; same && p < lay.W * lay.H; p++) { if (al[p] !== full[p * 4 + 3]) same = false; else if (al[p] && (rgb[p * 3] !== full[p * 4] || rgb[p * 3 + 2] !== full[p * 4 + 2])) same = false; }
  ok(same && txt.includes(`/MediaBox [0 0 ${(lay.W / dpi * 72).toFixed(4)} ${(lay.H / dpi * 72).toFixed(4)}]`), `PDF image and soft mask read back identical, page at print size (${ps.pos} bytes)`);
  const xs = +txt.match(/startxref\n(\d+)/)[1]; ok(txt.slice(xs, xs + 4) === "xref", "PDF cross-reference offset is right");
  const ms = memorySink(); writeSheet({ lay, dpi, format: "png", sink: ms, deflateRaw, mirror: true }); const mp = readPNG(ms.bytes());
  let mirrored = true; for (let y = 0; y < lay.H && mirrored; y += 7) for (let x = 0; x < lay.W; x++) if (mp.px[(y * lay.W + x) * 4 + 3] !== full[(y * lay.W + lay.W - 1 - x) * 4 + 3]) { mirrored = false; break; }
  ok(mirrored, "mirror flips the sheet left to right");
  const r = rotate90(rotate90(rotate90(rotate90(designs.get("bar"))))); ok(Buffer.compare(Buffer.from(r.rgba), Buffer.from(designs.get("bar").rgba)) === 0, "four quarter turns give the design back");
  const half = resample(img(4, 2, x => x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 0]), 4, 2, 2, 1);
  ok(half[0] === 255 && half[2] === 0 && half[7] < 255 && half[4 + 0] === 255, `resample on premultiplied colour: a clear pixel does not darken the edge (${[...half]})`); }

// ── preflight ──
{ const W = 600, H = 300, line = (wPx) => img(W, H, (x, y) => (y >= 100 && y < 100 + wPx && x > 50 && x < 550) ? [0, 0, 0, 255] : [0, 0, 0, 0]);
  const lim = sheetLimits(newMachine("roll-22"));
  const thin = preflight({ W, H, rgba: line(4) }, { wIn: 2, hIn: 1, limits: lim }), fat = preflight({ W, H, rgba: line(12) }, { wIn: 2, hIn: 1, limits: lim });
  ok(thin.some(c => c.id === "thin-line") && !fat.some(c => c.id === "thin-line"), "a 0.34 mm line is flagged at 300 dpi; a 1.0 mm line is not");
  const gapArt = img(W, H, (x, y) => (y >= 100 && y < 104) ? [0, 0, 0, 0] : [0, 0, 0, 255]);
  ok(preflight({ W, H, rgba: gapArt }, { wIn: 2, hIn: 1, limits: lim }).some(c => c.id === "thin-gap"), "a 0.34 mm gap is flagged");
  const low = preflight({ W, H, rgba: line(12) }, { wIn: 6, hIn: 3, limits: lim });
  ok(low[0].id === "resolution" && low[0].severity === "error", `600 px over 6 in = 100 ppi: error (${low[0].text})`);
  const mid = preflight({ W, H, rgba: line(12) }, { wIn: 3, hIn: 1.5, limits: lim });
  ok(mid.some(c => c.id === "resolution" && c.severity === "warning"), "200 ppi: warning");
  const big = preflight({ W, H, rgba: line(40) }, { wIn: 30, hIn: 25, limits: lim });
  ok(big.some(c => c.id === "fits" && c.severity === "error"), "30 × 25 in does not fit a 22 in roll");
  ok(fat.some(c => c.id === "gamut" && c.severity === "note"), "gamut is reported as not checked");
  const soft = img(W, H, (x, y) => [230, 60, 40, Math.round(255 * Math.max(0, Math.min(1, (200 - Math.hypot(x - 300, y - 150)) / 120)))]);
  ok(!preflight({ W, H, rgba: soft }, { wIn: 2, hIn: 1, limits: lim }).some(c => c.id.startsWith("thin")), "a soft glow raises no thin-line or thin-gap flag (its halftone dots are not lines)");
  const soft45 = img(W, H, (x, y) => { const d = Math.abs(y + 0.5 - 150.3) - 0.45 * 300 / 25.4 / 2; return [0, 0, 0, x > 50 && x < 550 ? Math.round(255 * Math.max(0, Math.min(1, 0.5 - d))) : 0]; });
  ok(preflight({ W, H, rgba: soft45 }, { wIn: 2, hIn: 1, limits: lim }).some(c => c.id === "thin-line"), "a 0.45 mm anti-aliased line is flagged (measured on its soft edges, not rounded to whole pixels)"); }

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
