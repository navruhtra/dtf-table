// @ts-check
// DTF Table — browser helpers for the sheet writer: raw deflate from fflate, and a sink that builds a Blob.
import { Deflate } from "./vendor/fflate.js";

/** Raw deflate for sheet.js. fflate keeps state between calls, so one stream is one Deflate: calls run in order and a
    stream ends with final = true, which starts the next stream fresh (sheet.js never interleaves two streams). */
export function makeDeflateRaw(level = 6) {
  let d = null, parts = [];
  return (chunk, final) => {
    if (!d) { d = new Deflate({ level }); d.ondata = c => { parts.push(c); }; }
    parts = []; d.push(chunk, final); if (final) d = null;
    if (parts.length === 1) return parts[0];
    let n = 0; for (const p of parts) n += p.length; const out = new Uint8Array(n); n = 0; for (const p of parts) { out.set(p, n); n += p.length; }
    return out;
  };
}

/** A sink that collects the file in parts and gives a Blob. patch() rewrites bytes already written (TIFF's IFD offset). */
export function blobSink() {
  const parts = /** @type {Uint8Array<ArrayBuffer>[]} */ ([]), starts = /** @type {number[]} */ ([]);
  const sink = {
    pos: 0,
    /** @param {Uint8Array} b */
    write(b) { if (!b.length) return; starts.push(sink.pos); parts.push(new Uint8Array(b)); sink.pos += b.length; },
    /** @param {number} at @param {Uint8Array} b */
    patch(at, b) {
      for (let k = 0; k < b.length; k++) { const o = at + k; let i = starts.length - 1; while (i > 0 && starts[i] > o) i--; parts[i][o - starts[i]] = b[k]; }
    },
    /** @param {string} type */
    blob(type) { return new Blob(parts, { type }); },
  };
  return sink;
}
