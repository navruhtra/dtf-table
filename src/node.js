// @ts-check
// DTF Table — Node helpers for the sheet writer: a file sink and raw deflate from node:zlib.
import { openSync, writeSync, closeSync } from "node:fs";
import { deflateRawSync, constants } from "node:zlib";

/** Raw deflate for sheet.js: non-final pieces end on a sync flush, so they concatenate into one stream. */
export function deflateRaw(chunk, final, level = 6) {
  return deflateRawSync(chunk, { level, finishFlush: final ? constants.Z_FINISH : constants.Z_SYNC_FLUSH });
}

/** A sink that writes to a file, with positional patching (TIFF writes its IFD offset last). Call close() at the end. */
export function fileSink(path) {
  const fd = openSync(path, "w");
  const sink = {
    pos: 0,
    /** @param {Uint8Array} b */
    write(b) { let o = 0; while (o < b.length) o += writeSync(fd, b, o, b.length - o, sink.pos + o); sink.pos += b.length; },
    /** @param {number} at @param {Uint8Array} b */
    patch(at, b) { writeSync(fd, b, 0, b.length, at); },
    close() { closeSync(fd); },
  };
  return sink;
}

/** A sink that keeps everything in memory (tests and small sheets). bytes() returns the file. */
export function memorySink() {
  const parts = [], patches = [];
  const sink = {
    pos: 0,
    /** @param {Uint8Array} b */
    write(b) { parts.push(new Uint8Array(b)); sink.pos += b.length; },
    /** @param {number} at @param {Uint8Array} b */
    patch(at, b) { patches.push([at, new Uint8Array(b)]); },
    bytes() { const out = new Uint8Array(sink.pos); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } for (const [at, b] of patches) out.set(b, at); return out; },
  };
  return sink;
}
