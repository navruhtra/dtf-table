// @ts-check
// DTF Table — machine profiles. Pure functions, plus a browser stand-in for the account's saved machines.
//
// A machine profile says what a producer's printer can take: roll or sheet width, the longest print, the file
// resolution, and how its RIP takes white. The shape is shared with the DTG Table
// so the ADN account can keep "saved machines" grouped by service. Until the account stores them server-side,
// localMachines keeps them in the browser.

export const SCHEMA = "adn.machine/1";
export const SERVICES = /** @type {const} */ (["screen", "dtf", "dtg", "embroidery"]);
export const WHITE_SUPPLY = /** @type {const} */ (["none", "file", "channel"]);

/** @typedef {{ kind: "roll" | "sheet" | "platen", widthIn: number, printableWidthIn?: number | null, maxLengthIn?: number | null, heightIn?: number | null }} Media */
/** @typedef {{ supply: "none" | "file" | "channel", channelName?: string, invert?: boolean, ripMakesWhite?: boolean | null }} WhiteSetting */
/** @typedef {{ schema: string, id: string, service: string, name: string, maker?: string, model?: string, preset: string,
 *    media: Media, dpi: { native?: number[], file: number }, inks?: string[], white: WhiteSetting, mirror: boolean,
 *    output: { formats: string[], maxFileMB?: number | null }, notes?: string, updatedAt?: string,
 *    sources?: { url: string, what: string }[], verify?: string[] }} Machine
 *  sources: where each value came from. verify: field paths that are a default nobody has checked against the maker's
 *  documentation or a real machine (the same rule as the DTG Table). */

/** Roll presets: 13, 22 and 24 in. Width only: the printable width and longest print differ by printer and
    are not filled in from any maker's specification. A producer sets them in their profile. */
export const DTF_PRESETS = [
  { id: "roll-13", name: "13 in roll", widthIn: 13 },
  { id: "roll-22", name: "22 in roll", widthIn: 22 },
  { id: "roll-24", name: "24 in roll", widthIn: 24 },
];

/** Fields every roll preset leaves for the producer to check: the printable width, the longest print and how the RIP
    takes white differ by printer and RIP. */
export const ROLL_VERIFY = ["media.printableWidthIn", "media.maxLengthIn", "white.supply", "white.ripMakesWhite"];

/** @type {Record<string, [number, number]>} */
const LIMITS = { widthIn: [1, 120], maxLengthIn: [1, 12000], dpi: [72, 2880] };

/** A new DTF profile from a preset id (or "custom" with a width). White default "none": the colour file goes out with
    clean alpha and the RIP makes white, which works with every RIP; "file" adds a separate white file. */
export function newMachine(preset = "roll-22", over = {}) {
  const p = DTF_PRESETS.find(x => x.id === preset);
  /** @type {Machine} */
  const m = { schema: SCHEMA, id: "", service: "dtf", name: p ? p.name : "Custom", preset: p ? p.id : "custom",
    media: { kind: "roll", widthIn: p ? p.widthIn : 22, printableWidthIn: null, maxLengthIn: null, heightIn: null },
    dpi: { file: 300 }, white: { supply: "none", channelName: "White", invert: false, ripMakesWhite: null }, mirror: false,
    output: { formats: ["png", "tiff", "pdf"], maxFileMB: null }, notes: "", sources: [], verify: [...ROLL_VERIFY] };
  return cleanMachine({ ...m, ...over, media: { ...m.media, ...over.media }, white: { ...m.white, ...over.white }, dpi: { ...m.dpi, ...over.dpi } }).machine;
}

const num = (v, [lo, hi]) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

/** Check and tidy a profile from anywhere (the account, a file, local storage). Returns the cleaned profile, or null,
    and the problems found. Unknown keys are kept (a DTG profile carries a `dtg` key the DTF reader ignores). */
export function cleanMachine(src) {
  const errors = [];
  if (!src || typeof src !== "object") return { machine: null, errors: ["not an object"] };
  const m = /** @type {Machine} */ (JSON.parse(JSON.stringify(src)));
  m.schema = SCHEMA;
  if (!SERVICES.includes(/** @type {any} */ (m.service))) errors.push(`service must be one of ${SERVICES.join(", ")}`);
  if (typeof m.name !== "string" || !m.name.trim()) m.name = "Unnamed machine";
  m.name = m.name.trim().slice(0, 80);
  if (typeof m.id !== "string") m.id = "";
  if (typeof m.preset !== "string") m.preset = "custom";
  const md = m.media || /** @type {Media} */ ({});
  if (!["roll", "sheet", "platen"].includes(md.kind)) errors.push("media.kind must be roll, sheet or platen");
  if (!num(md.widthIn, LIMITS.widthIn)) errors.push(`media.widthIn must be ${LIMITS.widthIn[0]}–${LIMITS.widthIn[1]} in`);
  if (md.printableWidthIn != null && !(num(md.printableWidthIn, LIMITS.widthIn) && md.printableWidthIn <= md.widthIn)) errors.push("media.printableWidthIn must be at most media.widthIn");
  if (md.maxLengthIn != null && !num(md.maxLengthIn, LIMITS.maxLengthIn)) errors.push(`media.maxLengthIn must be ${LIMITS.maxLengthIn[0]}–${LIMITS.maxLengthIn[1]} in`);
  if (md.kind !== "roll" && md.heightIn != null && !num(md.heightIn, LIMITS.maxLengthIn)) errors.push("media.heightIn must be a length in inches");
  m.media = md;
  if (!m.dpi || !num(m.dpi.file, LIMITS.dpi)) errors.push(`dpi.file must be ${LIMITS.dpi[0]}–${LIMITS.dpi[1]}`);
  const w = m.white || /** @type {WhiteSetting} */ ({ supply: "none" });
  if (!WHITE_SUPPLY.includes(/** @type {any} */ (w.supply))) errors.push(`white.supply must be one of ${WHITE_SUPPLY.join(", ")}`);
  w.invert = !!w.invert; if (typeof w.channelName !== "string" || !w.channelName) w.channelName = "White";
  if (w.ripMakesWhite !== true && w.ripMakesWhite !== false) w.ripMakesWhite = null;
  m.white = w; m.mirror = !!m.mirror;
  if (!m.output || !Array.isArray(m.output.formats)) m.output = { formats: ["png", "tiff", "pdf"], maxFileMB: null };
  m.output.formats = m.output.formats.filter(f => ["png", "tiff", "pdf"].includes(f));
  if (!m.output.formats.length) errors.push("output.formats must name png, tiff or pdf");
  m.sources = Array.isArray(m.sources) ? m.sources.filter(x => x && typeof x.url === "string" && typeof x.what === "string") : [];
  m.verify = Array.isArray(m.verify) ? m.verify.filter(x => typeof x === "string") : [];
  m.updatedAt = typeof m.updatedAt === "string" ? m.updatedAt : new Date(0).toISOString();
  return { machine: errors.length ? null : m, errors };
}

/** The width a gang sheet may use, and the longest sheet (Infinity when the profile sets none). */
export function sheetLimits(m) {
  return { widthIn: m.media.printableWidthIn ?? m.media.widthIn, maxLengthIn: m.media.maxLengthIn ?? Infinity, dpi: m.dpi.file };
}

/** Browser stand-in for the account's saved machines, grouped by service. `store` is localStorage or anything with
    getItem/setItem; every read and write is guarded, so a private window or blocked storage gives an empty list. */
export function localMachines(store, key = "adn.machines.v1") {
  const read = () => { try { const v = JSON.parse(store.getItem(key) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
  const write = all => { try { store.setItem(key, JSON.stringify(all)); return true; } catch { return false; } };
  return {
    /** @param {string} service */
    list(service) { const all = read(); return (all[service] || []).map(x => cleanMachine(x).machine).filter(Boolean); },
    /** @param {Machine} m */
    save(m) {
      const { machine, errors } = cleanMachine(m); if (!machine) return { ok: false, errors };
      if (!machine.id) machine.id = "m_" + Math.random().toString(36).slice(2, 10);
      machine.updatedAt = new Date().toISOString();
      const all = read(), list = (all[machine.service] || []).filter(x => x.id !== machine.id); list.push(machine); all[machine.service] = list;
      return { ok: write(all), machine, errors: [] };
    },
    /** @param {string} service @param {string} id */
    remove(service, id) { const all = read(); all[service] = (all[service] || []).filter(x => x.id !== id); return write(all); },
  };
}
