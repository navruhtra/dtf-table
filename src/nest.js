// @ts-check
// DTF Table — gang-sheet nesting. Pure functions, no DOM.
//
// Packs designs (rectangles, with copies) onto a roll of fixed width, as short as it can, and splits onto more sheets
// when a sheet would pass the machine's longest print. Method: MaxRects (Jukka Jylänki, "A Thousand Ways to Pack the
// Bin", 2010) with the bottom-left rule, which suits strip packing: each piece goes where its far edge is nearest the
// start of the roll. Four placement rules and seven orders are tried, the shortest sheet kept, and a local search of
// swaps in its order improves it. Pieces may turn 90° unless a design says not to. Lengths are kept in hundredths of an inch (integers), so
// gaps and edges are exact.

/** @typedef {{ id: string, wIn: number, hIn: number, copies?: number, rotate?: boolean }} Piece */
/** @typedef {{ id: string, copy: number, xIn: number, yIn: number, wIn: number, hIn: number, rotated: boolean }} Placement */
/** @typedef {{ placements: Placement[], lengthIn: number, widthIn: number, usedIn2: number, filmUse: number }} Sheet */

const U = 100; // units per inch
const toU = v => Math.round(v * U);

/** Placement rules (Jylänki 2010). Each scores a free rectangle f for a w × h piece; lower is better, compared as
    [first, second]. bl: bottom-left (the far edge nearest the roll's start). bssf / blsf: the best short / long side
    left over. baf: the least area left over. In strip packing the open end of the roll is one tall free rectangle,
    so bssf, blsf and baf fill holes first and bl keeps the sheet short; trying all and keeping the shortest sheet
    takes the best of each. */
const RULES = {
  bl: (f, w, h) => [f.y + h, f.x],
  bssf: (f, w, h) => [Math.min(f.w - w, f.h - h), Math.max(f.w - w, f.h - h)],
  blsf: (f, w, h) => [Math.max(f.w - w, f.h - h), Math.min(f.w - w, f.h - h)],
  baf: (f, w, h) => [f.w * f.h - w * h, Math.min(f.w - w, f.h - h)],
};
/** @param {{ x: number, y: number, w: number, h: number }[]} free @param {number} w @param {number} h @param {(f: any, w: number, h: number) => number[]} rule */
function place(free, w, h, rule) {
  let best = null;
  for (const f of free) if (w <= f.w && h <= f.h) {
    const s = rule(f, w, h);
    if (!best || s[0] < best.s[0] || (s[0] === best.s[0] && (s[1] < best.s[1] || (s[1] === best.s[1] && f.y + h < best.top)))) best = { x: f.x, y: f.y, top: f.y + h, s };
  }
  return best;
}
const better = (a, b) => a.s[0] < b.s[0] || (a.s[0] === b.s[0] && (a.s[1] < b.s[1] || (a.s[1] === b.s[1] && a.top <= b.top)));
function split(free, r) {
  const out = [];
  for (const f of free) {
    if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) { out.push(f); continue; }
    if (r.x > f.x) out.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
    if (r.x + r.w < f.x + f.w) out.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h });
    if (r.y > f.y) out.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
    if (r.y + r.h < f.y + f.h) out.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h });
  }
  // drop free rectangles inside another
  return out.filter((a, i) => !out.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y)));
}

/** Pack one ordered list into strips of width W (units), at most maxL long. Returns placed and left-over pieces. */
function packOnce(list, W, maxL, gap, rule) {
  // each piece reserves its size plus one gap; the sheet is one gap wider, so gaps fall only between pieces
  const BIG = Number.isFinite(maxL) ? maxL + gap : 1e9;
  let free = [{ x: 0, y: 0, w: W + gap, h: BIG }];
  const placed = [], left = [];
  for (const p of list) {
    const a = place(free, p.w + gap, p.h + gap, rule), b = p.rot && p.w !== p.h ? place(free, p.h + gap, p.w + gap, rule) : null;
    const pick = a && (!b || better(a, b)) ? { ...a, r: false } : b ? { ...b, r: true } : null;
    if (!pick) { left.push(p); continue; }
    const w = pick.r ? p.h : p.w, h = pick.r ? p.w : p.h;
    placed.push({ ...p, x: pick.x, y: pick.y, pw: w, ph: h, r: pick.r });
    free = split(free, { x: pick.x, y: pick.y, w: w + gap, h: h + gap });
  }
  return { placed, left };
}

const ORDERS = {
  height: (a, b) => b.h - a.h || b.w - a.w,
  width: (a, b) => b.w - a.w || b.h - a.h,
  area: (a, b) => b.w * b.h - a.w * a.h || b.h - a.h,
  side: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
  short: (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) || Math.max(b.w, b.h) - Math.max(a.w, a.h),
  perimeter: (a, b) => b.w + b.h - a.w - a.h || b.w * b.h - a.w * a.h,
  ratio: (a, b) => Math.max(b.w, b.h) / Math.min(b.w, b.h) - Math.max(a.w, a.h) / Math.min(a.w, a.h) || b.w * b.h - a.w * a.h,
};

/** Pack pieces onto sheets `widthIn` wide, each at most `maxLengthIn` long, with `gapIn` between pieces and `edgeIn`
    of clear film at the start and end of each sheet. Every placement rule is tried with every order, then `search`
    swaps (0 turns it off) improve the best. Returns the sheets, and pieces too large for the sheet. */
export function nest(pieces, { widthIn, maxLengthIn = Infinity, gapIn = 0.25, edgeIn = 0, search = 200 }) {
  const W = toU(widthIn), gap = toU(gapIn), edge = toU(edgeIn), maxL = Number.isFinite(maxLengthIn) ? toU(maxLengthIn) - 2 * edge : Infinity;
  const all = [], tooLarge = [];
  for (const p of pieces) {
    const w = toU(p.wIn), h = toU(p.hIn), rot = p.rotate !== false, n = Math.max(0, Math.floor(p.copies ?? 1));
    const fits = (w <= W && h <= maxL) || (rot && h <= W && w <= maxL);
    if (!fits || w <= 0 || h <= 0) { tooLarge.push(p.id); continue; }
    for (let c = 0; c < n; c++) all.push({ id: p.id, copy: c, w, h, rot });
  }
  /** @type {Sheet[]} */
  const sheets = [];
  let rest = all;
  while (rest.length) {
    let best = null;
    for (const cmp of Object.values(ORDERS)) for (const rule of Object.values(RULES)) {
      const order = [...rest].sort(cmp), r = packOnce(order, W, maxL, gap, rule);
      const len = r.placed.reduce((m, q) => Math.max(m, q.y + q.ph), 0);
      // the best sheet places the most area, then is shortest
      const area = r.placed.reduce((s, q) => s + q.w * q.h, 0);
      if (!best || area > best.area || (area === best.area && len < best.len)) best = { ...r, len, area, order, rule };
    }
    // local search: swap two pieces in the best order (fixed seed, so the same order gives the same sheet), keep the
    // swap when the sheet places more or is shorter
    let seed = 369; const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    for (let it = 0; it < search && best.order.length > 2; it++) {
      const order = [...best.order], i = rnd(order.length); let j = rnd(order.length), t = 0;
      // a swap of two pieces the same size changes nothing: look for one of another size
      while (t++ < 8 && (order[j].w === order[i].w && order[j].h === order[i].h)) j = rnd(order.length);
      if (order[j].w === order[i].w && order[j].h === order[i].h) continue;
      [order[i], order[j]] = [order[j], order[i]];
      const r = packOnce(order, W, maxL, gap, best.rule), len = r.placed.reduce((m, q) => Math.max(m, q.y + q.ph), 0), area = r.placed.reduce((s, q) => s + q.w * q.h, 0);
      if (area > best.area || (area === best.area && len < best.len)) best = { ...r, len, area, order, rule: best.rule };
    }
    if (!best.placed.length) break; // cannot happen: every piece fits an empty sheet
    const lengthU = best.len + 2 * edge;
    sheets.push({
      placements: best.placed.map(q => ({ id: q.id, copy: q.copy, xIn: q.x / U, yIn: (q.y + edge) / U, wIn: q.pw / U, hIn: q.ph / U, rotated: q.r }))
        .sort((a, b) => a.yIn - b.yIn || a.xIn - b.xIn),
      lengthIn: lengthU / U, widthIn: W / U, usedIn2: best.area / (U * U), filmUse: best.area / (W * lengthU),
    });
    rest = best.left;
  }
  return { sheets, tooLarge };
}

/** Overlap and bounds check, for tests: every placement inside the sheet and at least gapIn from every other. */
export function validSheet(sheet, gapIn = 0) {
  const P = sheet.placements, e = 1e-9;
  for (const p of P) if (p.xIn < -e || p.yIn < -e || p.xIn + p.wIn > sheet.widthIn + e || p.yIn + p.hIn > sheet.lengthIn + e) return false;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const a = P[i], b = P[j];
    if (a.xIn < b.xIn + b.wIn + gapIn - e && b.xIn < a.xIn + a.wIn + gapIn - e && a.yIn < b.yIn + b.hIn + gapIn - e && b.yIn < a.yIn + a.hIn + gapIn - e) return false;
  }
  return true;
}
