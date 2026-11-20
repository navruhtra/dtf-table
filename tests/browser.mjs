// The browser helpers (fflate deflate and the Blob sink) write the same files as the Node ones. Run: node tests/browser.mjs
// Needs src/vendor/ (node scripts/fetch-vendor.mjs).
import { inflateSync } from "node:zlib";
import { makeDeflateRaw, blobSink } from "../src/browser.js";
import { deflateRaw, memorySink } from "../src/node.js";
import { nest } from "../src/nest.js";
import { prepareDesign, layout, composeBand, writeSheet } from "../src/sheet.js";

let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const W = 200, H = 160, rgba = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - 100, y - 80); rgba.set([200, 40, 30, Math.round(255 * Math.max(0, Math.min(1, (70 - d) / 20)))], (y * W + x) * 4); }
const { sheets } = nest([{ id: "a", wIn: 2, hIn: 1.6, copies: 5 }], { widthIn: 6, gapIn: 0.2 });
const lay = layout(sheets[0], new Map([["a", prepareDesign({ W, H, rgba }, { wIn: 2, hIn: 1.6, dpi: 100 })]]), 100);
const full = Buffer.from(composeBand(lay, 0, lay.H));
// decode helpers: PNG IDAT and TIFF strips through node's inflate
function pngPixels(b) { const dv = new DataView(b.buffer, b.byteOffset), idat = []; let p = 8, Wd = 0, Hd = 0; while (p < b.length) { const len = dv.getUint32(p), t = String.fromCharCode(...b.subarray(p + 4, p + 8)); if (t === "IHDR") { Wd = dv.getUint32(p + 8); Hd = dv.getUint32(p + 12); } if (t === "IDAT") idat.push(b.subarray(p + 8, p + 8 + len)); p += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)), st = Wd * 4, out = Buffer.alloc(Wd * Hd * 4);
  for (let y = 0; y < Hd; y++) for (let i = 0; i < st; i++) out[y * st + i] = (raw[y * (st + 1) + 1 + i] + (i >= 4 ? out[y * st + i - 4] : 0)) & 255; return out; }
for (const format of ["png", "tiff", "pdf"]) {
  const bs = blobSink(); writeSheet({ lay, dpi: 100, format, sink: bs, deflateRaw: makeDeflateRaw(), compression: "deflate", bandRows: 23 });
  const bytes = new Uint8Array(await bs.blob("application/octet-stream").arrayBuffer());
  if (format === "png") ok(pngPixels(bytes).equals(full), `PNG written with fflate in 23-row bands decodes to the sheet (${bytes.length} bytes)`);
  if (format === "tiff") { const dv = new DataView(bytes.buffer), ifd = dv.getUint32(4, true); ok(ifd > 8 && ifd < bytes.length && dv.getUint16(ifd, true) >= 13, `TIFF: blob sink patched the IFD offset (${ifd})`);
    const n = dv.getUint16(ifd, true); let offs, cnts; for (let i = 0; i < n; i++) { const o = ifd + 2 + i * 12, tag = dv.getUint16(o, true), c = dv.getUint32(o + 4, true), at = c === 1 ? o + 8 : dv.getUint32(o + 8, true), v = Array.from({ length: c }, (_, k) => dv.getUint32(at + 4 * k, true)); if (tag === 273) offs = v; if (tag === 279) cnts = v; }
    ok(Buffer.concat(offs.map((o, i) => inflateSync(bytes.subarray(o, o + cnts[i])))).equals(full), "TIFF strips written with fflate inflate to the sheet"); }
  if (format === "pdf") { const ms = memorySink(); writeSheet({ lay, dpi: 100, format, sink: ms, deflateRaw, bandRows: 23 }); const txt = Buffer.from(bytes).toString("latin1");
    ok(txt.startsWith("%PDF-1.6") && txt.trimEnd().endsWith("%%EOF") && Math.abs(bytes.length - ms.pos) < ms.pos * 0.2, `PDF written with fflate: ${bytes.length} bytes (Node zlib: ${ms.pos})`); }
}
console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
