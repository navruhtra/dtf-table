// @ts-check
// DTF Table — gang-sheet writer. Pure functions, no DOM, no Node: output goes to a `sink`, compression to a
// `deflateRaw` function (Node: node.js in this folder; a browser passes its own).
//
// A 22 × 100 in sheet at 300 dpi is 6,600 × 30,000 px, about 792 MB as RGBA: too large for one canvas or one buffer.
// The sheet is never held whole. Each design is prepared once at its print size (resampled, alpha repaired, white
// built), and the sheet is written in bands of rows: a band is composed from the designs that cross it, filtered,
// compressed and written, then dropped. Memory is the prepared designs plus one band.
//
// Formats: PNG (RGBA, or gray for a white file), TIFF (RGBA with unassociated alpha, or gray; strips), PDF (one page,
// RGB image with a soft mask). All carry the resolution, so the RIP places the sheet at size.
import { repairAlpha } from "./alpha.js";
import { whiteLayer } from "./white.js";

/** @typedef {{ write(b: Uint8Array): void, patch?(offset: number, b: Uint8Array): void, pos: number }} Sink */
/** @typedef {(chunk: Uint8Array, final: boolean) => Uint8Array} DeflateRaw  raw deflate; non-final calls end on a
 *  sync flush, so the outputs concatenate into one deflate stream */
/** @typedef {{ W: number, H: number, rgba: Uint8ClampedArray, white: Uint8Array | null, stats?: any }} Prepared */

/* ───────── design preparation ───────── */

/** Resample straight-alpha RGBA to Wt × Ht with a tent filter (bilinear when enlarging, area-like when reducing), on
    premultiplied values so clear pixels do not bleed their colour into the edge. */
export function resample(rgba, W, H, Wt, Ht) {
  if (W === Wt && H === Ht) return new Uint8ClampedArray(rgba);
  // horizontal: W → Wt, rows H; then vertical: H → Ht
  const pre = new Float32Array(W * H * 4);
  for (let p = 0; p < W * H; p++) { const a = rgba[p * 4 + 3] / 255; pre[p * 4] = rgba[p * 4] * a; pre[p * 4 + 1] = rgba[p * 4 + 1] * a; pre[p * 4 + 2] = rgba[p * 4 + 2] * a; pre[p * 4 + 3] = a; }
  const weights = (sn, dn) => { // for each target index: [start, weights...]
    const scale = sn / dn, r = Math.max(1, scale), out = [];
    for (let i = 0; i < dn; i++) {
      const c = (i + 0.5) * scale - 0.5, lo = Math.max(0, Math.ceil(c - r)), hi = Math.min(sn - 1, Math.floor(c + r)), w = [];
      let s = 0; for (let k = lo; k <= hi; k++) { const v = Math.max(0, 1 - Math.abs(k - c) / r); w.push(v); s += v; }
      if (s <= 0) { const k = Math.min(sn - 1, Math.max(0, Math.round(c))); out.push({ lo: k, w: [1] }); continue; }
      out.push({ lo, w: w.map(v => v / s) });
    }
    return out;
  };
  const wx = weights(W, Wt), wy = weights(H, Ht), mid = new Float32Array(Wt * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < Wt; x++) { const { lo, w } = wx[x], o = (y * Wt + x) * 4;
    for (let k = 0; k < w.length; k++) { const q = (y * W + lo + k) * 4, v = w[k]; mid[o] += pre[q] * v; mid[o + 1] += pre[q + 1] * v; mid[o + 2] += pre[q + 2] * v; mid[o + 3] += pre[q + 3] * v; } }
  const out = new Uint8ClampedArray(Wt * Ht * 4);
  for (let y = 0; y < Ht; y++) { const { lo, w } = wy[y];
    for (let x = 0; x < Wt; x++) { let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < w.length; k++) { const q = ((lo + k) * Wt + x) * 4, v = w[k]; r += mid[q] * v; g += mid[q + 1] * v; b += mid[q + 2] * v; a += mid[q + 3] * v; }
      const o = (y * Wt + x) * 4; if (a > 1e-6) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; } out[o + 3] = Math.round(a * 255); } }
  return out;
}

/** Prepare one design for a sheet: resample to its print size at dpi, repair alpha, build white (unless white is null). */
export function prepareDesign(art, { wIn, hIn, dpi, alpha = {}, white = /** @type {object | null} */ ({}) }) {
  const W = Math.max(1, Math.round(wIn * dpi)), H = Math.max(1, Math.round(hIn * dpi));
  const sized = resample(art.rgba, art.W, art.H, W, H), rep = repairAlpha(sized, W, H, { dpi, ...alpha });
  if (!white) return /** @type {Prepared} */ ({ W, H, rgba: rep.rgba, white: null, stats: { alpha: rep.stats } });
  const wl = whiteLayer(rep.rgba, W, H, white);
  return /** @type {Prepared} */ ({ W, H, rgba: wl.colour, white: wl.white, stats: { alpha: rep.stats, white: wl.stats } });
}

/** Turn a prepared design a quarter turn clockwise. */
export function rotate90(d) {
  const W = d.H, H = d.W, rgba = new Uint8ClampedArray(W * H * 4), white = d.white ? new Uint8Array(W * H) : null;
  for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) {
    const X = d.H - 1 - y, Y = x, s = y * d.W + x, t = Y * W + X;
    rgba[t * 4] = d.rgba[s * 4]; rgba[t * 4 + 1] = d.rgba[s * 4 + 1]; rgba[t * 4 + 2] = d.rgba[s * 4 + 2]; rgba[t * 4 + 3] = d.rgba[s * 4 + 3];
    if (white) white[t] = /** @type {Uint8Array} */ (d.white)[s];
  }
  return { W, H, rgba, white, stats: d.stats };
}

/* ───────── composing bands ───────── */

/** Resolve a nested sheet against prepared designs: pixel positions, and each design turned where the nest turned it.
    `designs` maps id → Prepared at the unturned size. */
export function layout(sheet, designs, dpi) {
  const turned = new Map(), items = [];
  for (const p of sheet.placements) {
    let d = designs.get(p.id); if (!d) throw new Error(`no prepared design for ${p.id}`);
    if (p.rotated) { if (!turned.has(p.id)) turned.set(p.id, rotate90(d)); d = turned.get(p.id); }
    items.push({ x: Math.round(p.xIn * dpi), y: Math.round(p.yIn * dpi), d });
  }
  return { W: Math.round(sheet.widthIn * dpi), H: Math.round(sheet.lengthIn * dpi), items };
}

/** Compose rows [y0, y0 + h) of the sheet. layer "colour" → RGBA (or RGB when rgb is true); "alpha" → 1 byte per pixel;
    "white" → 1 byte per pixel (255 = full white, or inverted). mirror flips left to right. */
export function composeBand(lay, y0, h, layer = "colour", { mirror = false, invert = false, rgb = false } = {}) {
  const { W } = lay, ch = layer === "colour" ? (rgb ? 3 : 4) : 1, out = new Uint8Array(W * h * ch);
  if (layer === "white" && invert) out.fill(255);
  for (const { x, y, d } of lay.items) {
    const a = Math.max(y0, y), b = Math.min(y0 + h, y + d.H); if (a >= b) continue;
    for (let Y = a; Y < b; Y++) {
      const sr = (Y - y) * d.W, dr = (Y - y0) * W;
      for (let i = 0; i < d.W; i++) {
        const X = x + i; if (X < 0 || X >= W) continue; const s = sr + i, al = d.rgba[s * 4 + 3];
        const t = dr + (mirror ? W - 1 - X : X);
        if (layer === "colour") { if (!al) continue; out[t * ch] = d.rgba[s * 4]; out[t * ch + 1] = d.rgba[s * 4 + 1]; out[t * ch + 2] = d.rgba[s * 4 + 2]; if (ch === 4) out[t * 4 + 3] = al; }
        else if (layer === "alpha") { if (al) out[t] = al; }
        else { const v = d.white ? d.white[s] : 0; if (v) out[t] = invert ? 255 - v : v; }
      }
    }
  }
  return out;
}

/* ───────── zlib around a raw deflate ───────── */

function adler32(a, b) { let s1 = a & 0xffff, s2 = a >>> 16; for (let i = 0; i < b.length;) { const n = Math.min(3800, b.length - i); for (let k = 0; k < n; k++, i++) { s1 += b[i]; s2 += s1; } s1 %= 65521; s2 %= 65521; } return ((s2 << 16) | s1) >>> 0; }
/** A zlib stream built from raw deflate pieces: header, pieces, end block, Adler-32. */
function zlibStream(deflateRaw) {
  let ad = 1, started = false;
  return {
    /** @param {Uint8Array} chunk @param {boolean} final */
    push(chunk, final) {
      ad = adler32(ad, chunk); const body = deflateRaw(chunk, final), head = started ? 0 : 2, tail = final ? 4 : 0;
      const out = new Uint8Array(head + body.length + tail);
      if (!started) { out[0] = 0x78; out[1] = 0x9c; started = true; }
      out.set(body, head);
      if (final) { out[out.length - 4] = ad >>> 24; out[out.length - 3] = (ad >>> 16) & 255; out[out.length - 2] = (ad >>> 8) & 255; out[out.length - 1] = ad & 255; }
      return out;
    },
  };
}
/** One whole zlib stream from one buffer (a TIFF strip). */
export function zlibOnce(deflateRaw, buf) { return zlibStream(deflateRaw).push(buf, true); }

/* ───────── PNG ───────── */

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(parts) { let c = ~0; for (const b of parts) for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; }
const be32 = v => new Uint8Array([v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
const ascii = s => new Uint8Array([...s].map(c => c.charCodeAt(0)));
function chunk(sink, type, data) { const t = ascii(type); sink.write(be32(data.length)); sink.write(t); sink.write(data); sink.write(be32(crc32([t, data]))); }

/** Write a PNG band by band. band(y0, h) returns h rows of W × ch bytes (ch 4 = RGBA, 1 = gray). */
export function writePNG({ W, H, ch, dpi, band, bandRows = 256, sink, deflateRaw }) {
  sink.write(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  const ihdr = new Uint8Array(13); ihdr.set(be32(W), 0); ihdr.set(be32(H), 4); ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 0;
  chunk(sink, "IHDR", ihdr);
  const ppm = Math.round(dpi / 0.0254), phys = new Uint8Array(9); phys.set(be32(ppm), 0); phys.set(be32(ppm), 4); phys[8] = 1;
  chunk(sink, "pHYs", phys);
  const z = zlibStream(deflateRaw), stride = W * ch;
  for (let y0 = 0; y0 < H; y0 += bandRows) {
    const h = Math.min(bandRows, H - y0), rows = band(y0, h), f = new Uint8Array(h * (stride + 1));
    // filter 1 (Sub): each byte minus the same channel one pixel left; flat areas become runs of zeros
    for (let y = 0; y < h; y++) { const o = y * (stride + 1), r = y * stride; f[o] = 1;
      for (let i = 0; i < stride; i++) f[o + 1 + i] = (rows[r + i] - (i >= ch ? rows[r + i - ch] : 0)) & 255; }
    const out = z.push(f, y0 + h >= H); if (out.length) chunk(sink, "IDAT", out);
  }
  chunk(sink, "IEND", new Uint8Array(0));
}

/* ───────── TIFF ───────── */

/** Write a baseline TIFF (little-endian), one strip per band. ch 4 = RGBA with unassociated alpha, 1 = gray (black is
    zero). compression "none" (every reader) or "deflate" (Adobe Deflate, 8). Needs sink.patch for the IFD offset. */
export function writeTIFF({ W, H, ch, dpi, band, bandRows = 256, sink, deflateRaw, compression = "none" }) {
  if (!sink.patch) throw new Error("TIFF needs a sink that can patch an earlier offset");
  const start = sink.pos; sink.write(new Uint8Array([0x49, 0x49, 42, 0, 0, 0, 0, 0]));
  const offs = [], counts = [];
  for (let y0 = 0; y0 < H; y0 += bandRows) {
    const h = Math.min(bandRows, H - y0); let data = band(y0, h);
    if (compression === "deflate") data = zlibOnce(deflateRaw, data);
    offs.push(sink.pos - start); counts.push(data.length); sink.write(data);
    if (sink.pos - start > 0xffffffff - 1e6) throw new Error("sheet over 4 GB: write PNG or PDF, or split the sheet");
  }
  if ((sink.pos - start) & 1) sink.write(new Uint8Array(1)); // word alignment for the IFD
  const ifdAt = sink.pos - start, n = offs.length;
  /** @type {[number, number, number, number[]][]} tag, type (3 SHORT, 4 LONG, 5 RATIONAL), count, values */
  const tags = [[256, 4, 1, [W]], [257, 4, 1, [H]], [258, 3, ch, Array.from({ length: ch }, () => 8)], [259, 3, 1, [compression === "deflate" ? 8 : 1]],
    [262, 3, 1, [ch === 1 ? 1 : 2]], [273, 4, n, offs], [277, 3, 1, [ch]], [278, 4, 1, [bandRows]], [279, 4, n, counts],
    [282, 5, 1, [dpi, 1]], [283, 5, 1, [dpi, 1]], [284, 3, 1, [1]], [296, 3, 1, [2]]];
  if (ch === 4) tags.push([338, 3, 1, [2]]);
  const size = (t, c) => (t === 3 ? 2 : t === 4 ? 4 : 8) * c, ifdLen = 2 + tags.length * 12 + 4;
  let extra = ifdAt + ifdLen; const ext = [];
  const ifd = new DataView(new ArrayBuffer(ifdLen)); ifd.setUint16(0, tags.length, true);
  tags.forEach(([tag, type, count, vals], i) => {
    const o = 2 + i * 12, sz = size(type, count); ifd.setUint16(o, tag, true); ifd.setUint16(o + 2, type, true); ifd.setUint32(o + 4, count, true);
    const put = (dv, at) => vals.forEach((v, k) => type === 3 ? dv.setUint16(at + k * 2, v, true) : dv.setUint32(at + k * 4, v, true));
    if (sz <= 4) put(ifd, o + 8);
    else { const b = new DataView(new ArrayBuffer(sz)); put(b, 0); ifd.setUint32(o + 8, extra, true); ext.push(new Uint8Array(b.buffer)); extra += sz; }
  });
  sink.write(new Uint8Array(ifd.buffer)); for (const b of ext) sink.write(b);
  sink.patch(start + 4, new Uint8Array([ifdAt & 255, (ifdAt >>> 8) & 255, (ifdAt >>> 16) & 255, ifdAt >>> 24]));
}

/* ───────── PDF ───────── */

/** Write a one-page PDF: the sheet as an RGB image with a soft mask (its alpha), at size. Pages over 200 in use
    UserUnit (PDF 1.6), since 14,400 units is the usual page limit. colour(y0, h) gives RGB rows, alpha(y0, h) gray. */
export function writePDF({ W, H, dpi, colour, alpha, bandRows = 256, sink, deflateRaw }) {
  const start = sink.pos, xref = [], str = s => sink.write(ascii(s)), obj = n => { xref[n] = sink.pos - start; str(`${n} 0 obj\n`); };
  const wPt = W / dpi * 72, hPt = H / dpi * 72, uu = Math.max(1, Math.ceil(Math.max(wPt, hPt) / 14400));
  str("%PDF-1.6\n"); sink.write(new Uint8Array([37, 226, 227, 207, 211, 10]));
  obj(1); str("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  obj(2); str("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  const pw = (wPt / uu).toFixed(4), ph = (hPt / uu).toFixed(4);
  obj(3); str(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}]${uu > 1 ? ` /UserUnit ${uu}` : ""} /Resources << /XObject << /Im0 4 0 R >> >> /Contents 8 0 R >>\nendobj\n`);
  const image = (n, lenObj, extraDict, src, ch) => {
    obj(n); str(`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /BitsPerComponent 8 /ColorSpace /${ch === 3 ? "DeviceRGB" : "DeviceGray"}${extraDict} /Filter /FlateDecode /Length ${lenObj} 0 R >>\nstream\n`);
    const z = zlibStream(deflateRaw); let len = 0;
    for (let y0 = 0; y0 < H; y0 += bandRows) { const h = Math.min(bandRows, H - y0), out = z.push(src(y0, h), y0 + h >= H); sink.write(out); len += out.length; }
    str("\nendstream\nendobj\n"); obj(lenObj); str(`${len}\nendobj\n`);
  };
  image(4, 5, " /SMask 6 0 R", colour, 3);
  image(6, 7, "", alpha, 1);
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(8); str(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  const xrefAt = sink.pos - start; str(`xref\n0 9\n0000000000 65535 f \n`);
  for (let n = 1; n <= 8; n++) str(`${String(xref[n]).padStart(10, "0")} 00000 n \n`);
  str(`trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
}

/* ───────── a whole sheet ───────── */

/** Write one layer of a laid-out sheet. layer "colour" (with alpha) or "white" (a gray file: 255 = full white unless
    invert). format "png" | "tiff" | "pdf". */
export function writeSheet({ lay, dpi, format, layer = "colour", sink, deflateRaw, mirror = false, invert = false, bandRows = 256, compression = "none" }) {
  const { W, H } = lay, base = { W, H, dpi, bandRows, sink, deflateRaw };
  if (layer === "white") {
    const band = (y0, h) => composeBand(lay, y0, h, "white", { mirror, invert });
    if (format === "pdf") return writePDF({ ...base, colour: (y0, h) => { const g = band(y0, h), o = new Uint8Array(g.length * 3); for (let i = 0; i < g.length; i++) o[i * 3] = o[i * 3 + 1] = o[i * 3 + 2] = g[i]; return o; }, alpha: (y0, h) => new Uint8Array(W * h).fill(255) });
    return format === "tiff" ? writeTIFF({ ...base, ch: 1, band, compression }) : writePNG({ ...base, ch: 1, band });
  }
  if (format === "pdf") return writePDF({ ...base, colour: (y0, h) => composeBand(lay, y0, h, "colour", { mirror, rgb: true }), alpha: (y0, h) => composeBand(lay, y0, h, "alpha", { mirror }) });
  const band = (y0, h) => composeBand(lay, y0, h, "colour", { mirror });
  return format === "tiff" ? writeTIFF({ ...base, ch: 4, band, compression }) : writePNG({ ...base, ch: 4, band });
}
