// @ts-check
// DTF Table — preflight. Pure functions, no DOM. What a producer should know before a design goes on a sheet.
//
// Checks, per design at its print size:
//   - resolution: the art's pixels per inch at the print size (under 300 is a warning, under 150 an error);
//   - fits: wider than the machine's printable width (turned or not), or longer than its longest print;
//   - semi-transparent pixels: how many alpha repair will change (a note: the repair handles them);
//   - thin lines and thin gaps under 0.5 mm: lines DTF film may not hold through powder and press, gaps that fill in.
//     The measure is the Separation Table's stroke width transform (checks.js thinWidths) on the repaired alpha;
//   - gamut: not checked. It needs the printer's colour profile, which a machine profile does not carry yet.
import { thinWidths } from "./vendor/separation-table/checks.js";
import { countSemi } from "./alpha.js";

export const PREFLIGHT_DEFAULTS = Object.freeze({ minDpi: 300, errorDpi: 150, minFeatureMm: 0.5, minRunMm: 2, minThinPx: 6 });

/** @typedef {{ id: string, severity: "error" | "warning" | "note", text: string, value?: number }} Check */

/** Checks for one design. art: { W, H, rgba } as supplied; wIn × hIn: the print size; machine limits from sheetLimits.
    Thin features are measured on the art's own alpha, soft edges included: a stroke's width is the sum of its alpha
    across it, so a 0.45 mm line reads 0.45 mm whatever whole pixels alpha repair later rounds it to. */
export function preflight(art, { wIn, hIn, limits }, opts = {}) {
  const o = { ...PREFLIGHT_DEFAULTS, ...opts }, out = /** @type {Check[]} */ ([]);
  const ppi = Math.min(art.W / wIn, art.H / hIn);
  if (ppi < o.errorDpi) out.push({ id: "resolution", severity: "error", text: `${Math.round(ppi)} ppi at ${fmt(wIn)} × ${fmt(hIn)} in: under ${o.errorDpi} prints soft and blocky`, value: ppi });
  else if (ppi < o.minDpi - 0.5) out.push({ id: "resolution", severity: "warning", text: `${Math.round(ppi)} ppi at ${fmt(wIn)} × ${fmt(hIn)} in: under ${o.minDpi}`, value: ppi });
  if (limits) {
    const fitsFlat = wIn <= limits.widthIn && hIn <= limits.maxLengthIn, fitsTurned = hIn <= limits.widthIn && wIn <= limits.maxLengthIn;
    if (!fitsFlat && !fitsTurned) out.push({ id: "fits", severity: "error", text: `${fmt(wIn)} × ${fmt(hIn)} in does not fit ${fmt(limits.widthIn)} in film${Number.isFinite(limits.maxLengthIn) ? ` × ${fmt(limits.maxLengthIn)} in` : ""}, turned or not` });
  }
  const semi = countSemi(art.rgba);
  if (semi) out.push({ id: "semi", severity: "note", text: `${semi.toLocaleString("en-US")} semi-transparent pixels; alpha repair makes each one clear or solid`, value: semi });
  // thin features, on the repaired alpha at print resolution
  const d = art, P = d.W * d.H, { thin, thinGap } = thinMaps(d.rgba, d.W, d.H, d.W / (wIn * 25.4), o);
  const box = t => { let n = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1; for (let p = 0; p < P; p++) if (t[p] > 0) { n++; const x = p % d.W, y = (p - x) / d.W; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    return { n, box: n ? { x: x0 / d.W, y: y0 / d.H, w: (x1 - x0 + 1) / d.W, h: (y1 - y0 + 1) / d.H } : null }; };
  const tl = box(thin), tg = box(thinGap);
  if (tl.n >= o.minThinPx) out.push({ id: "thin-line", severity: "warning", text: `lines under ${o.minFeatureMm} mm (${tl.n.toLocaleString("en-US")} px): they may not hold on the film`, value: tl.n, ...(tl.box ? { box: tl.box } : {}) });
  if (tg.n >= o.minThinPx) out.push({ id: "thin-gap", severity: "warning", text: `gaps under ${o.minFeatureMm} mm (${tg.n.toLocaleString("en-US")} px): they may fill in`, value: tg.n, ...(tg.box ? { box: tg.box } : {}) });
  out.push({ id: "gamut", severity: "note", text: "colours not checked against the printer: no colour profile for this machine yet" });
  const rank = { error: 0, warning: 1, note: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Thin lines and thin gaps, pixel by pixel: the stroke width in px where a line (thin) or a gap (thinGap) is under
    minFeatureMm, 0 elsewhere. Alpha is read as a share (0–1), so a soft edge pixel adds its part of a pixel to the
    width. pxPerMm is the art's resolution at print size. */
export function thinMaps(rgba, W, H, pxPerMm, opts = {}) {
  const o = { ...PREFLIGHT_DEFAULTS, ...opts }, P = W * H, ink = new Float32Array(P), gap = new Float32Array(P);
  const limitPx = o.minFeatureMm * pxPerMm, minRun = Math.max(3, Math.round(o.minRunMm * pxPerMm));
  for (let p = 0; p < P; p++) { const a = rgba[p * 4 + 3] / 255; ink[p] = a; gap[p] = 1 - a; }
  return { thin: thinWidths(ink, W, H, limitPx, false, null, minRun), thinGap: thinWidths(gap, W, H, limitPx, true, null, minRun) };
}

const fmt = v => (Math.round(v * 100) / 100).toString();
