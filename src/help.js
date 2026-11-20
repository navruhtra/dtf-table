// @ts-check
// DTF Table — plain-language help: the "?" notes and the searchable Help panel. Same markup and classes as the
// Separation Table's help.js (bench.css styles both); the text is DTF's own. Written to ASD-STE100: short sentences,
// active voice, one instruction per sentence.

/** @typedef {{ t: string, what: string, why?: string, tip?: string, group: string }} Help */

/** @type {Record<string, Help>} */
export const HELP = {
  art: { group: "1. Artwork", t: "Artwork",
    what: "The designs you put on the gang sheet. Use PNG files with a transparent background. The transparent areas print nothing, and the garment shows.",
    why: "DTF prints every pixel that has colour. A white or coloured background becomes a printed box.",
    tip: "Use about 300 pixels for each inch of print width. Your art stays in this browser. DTF Table does not upload it." },
  width: { group: "1. Artwork", t: "Print width",
    what: "The width of this design on the garment, in inches. The height follows the art's proportions.",
    tip: "Check the ppi under the name. Under 300 ppi prints soft; under 150 ppi prints blocky." },
  copies: { group: "1. Artwork", t: "Copies",
    what: "How many of this design go on the gang sheet.",
    tip: "Set 0 to keep the design in the list without printing it." },
  repair: { group: "1. Artwork", t: "Alpha repair",
    what: "DTF film cannot print a half-clear pixel. Alpha repair makes every pixel clear or solid. A soft edge is cut. A fade, glow or shadow becomes halftone dots, so it prints as a fade.",
    why: "A RIP that meets half-clear pixels drops them, prints them solid, or prints thin ink that washes out.",
    tip: "Keep Halftone for art with fades. Use Cut for flat logos and type." },
  lpi: { group: "1. Artwork", t: "LPI",
    what: "Lines per inch of the halftone in fades. Fewer lines give larger dots.",
    why: "Small dots can fall off the film in the powder and press, or wash out.",
    tip: "Start at 35. The test sheet's C rows show which LPI your printer and powder hold." },
  minDot: { group: "1. Artwork", t: "Smallest and largest dot",
    what: "A tone under the smallest dot prints as scattered smallest dots. A tone over the largest dot prints solid, with scattered holes.",
    tip: "Raise the smallest dot if the light end of a fade flakes off after washing." },
  edgePx: { group: "1. Artwork", t: "Edge band",
    what: "A soft band this many pixels wide on each side of an edge is an anti-aliased edge and is cut. A wider soft area is a fade and gets halftone dots.",
    tip: "Keep 1. Raise it if a blurry edge comes out as a ring of dots." },
  machine: { group: "2. Machine and garment", t: "Printer",
    what: "The roll your printer takes: 13, 22 or 24 inches, or a custom width. A saved machine keeps the width, the longest print, the resolution and the white setting.",
    tip: "Shop setup lists the saved machines. They stay in this browser until your ADN account keeps them." },
  rollWidth: { group: "2. Machine and garment", t: "Roll width",
    what: "The width the gang sheet may use, in inches.",
    tip: "Use the printable width, not the film width, if your printer keeps a margin." },
  maxLen: { group: "2. Machine and garment", t: "Longest print",
    what: "The longest sheet your printer or RIP takes. Past it, DTF Table starts another sheet.",
    tip: "Leave it empty for no limit." },
  dpi: { group: "2. Machine and garment", t: "Resolution",
    what: "The pixels per inch of the files DTF Table writes.",
    tip: "300 dpi is the usual DTF file. Your RIP prints it at the printer's own resolution." },
  garment: { group: "2. Machine and garment", t: "Garment colour",
    what: "The colour of the garment for the proof. It does not change the files.",
    tip: "Look at the Proof view on the garment you will press." },
  whiteOut: { group: "2. Machine and garment", t: "White",
    what: "The RIP makes white: DTF Table writes the colour file only, and your RIP makes the white layer. Also write a white file: DTF Table writes a second, gray file for the white channel.",
    why: "Many RIPs make their own white and ignore a white file. Some take one.",
    tip: "Start with The RIP makes white. Use the white file if your RIP takes a white channel." },
  mirror: { group: "2. Machine and garment", t: "Mirror",
    what: "Mirrored files read backwards, for a RIP that does not mirror the print itself.",
    tip: "Most DTF RIPs mirror the print. Leave it off unless your test print reads backwards." },
  choke: { group: "2. Machine and garment", t: "White choke",
    what: "The white is pulled in from the colour's edge by this many pixels (1 px is 0.085 mm at 300 dpi).",
    why: "The white and the colour can print a little out of line. Without a choke, a white rim can show at the edges on dark garments.",
    tip: "Start at 1. The test sheet's A rows show the smallest choke with no rim." },
  spread: { group: "2. Machine and garment", t: "White spread",
    what: "The white grows past the colour by this many pixels, for a white outline.",
    tip: "Keep 0 unless you want an outline." },
  density: { group: "2. Machine and garment", t: "White density",
    what: "The amount of white ink, 0 to 100 percent of the white channel.",
    tip: "Keep 100 on dark garments." },
  whiteMode: { group: "2. Machine and garment", t: "White amount",
    what: "Full puts full white under every colour. Less under dark colours puts less white under navy, dark brown and black.",
    why: "Less white gives a softer print and uses less ink. Full white gives the strongest colour.",
    tip: "Keep Full unless the print is too stiff." },
  keepThin: { group: "2. Machine and garment", t: "Keep white under thin lines",
    what: "A line too thin for the choke keeps its white without a choke.",
    why: "Colour with no white under it washes out and holds less powder." },
  knock: { group: "2. Machine and garment", t: "Knock out",
    what: "Colours removed from the print, so the garment shows through. Write hex colours with a comma between them, for example #000000.",
    tip: "Knock out a black background on a black garment." },
  noWhite: { group: "2. Machine and garment", t: "No white under",
    what: "Colours printed with no white under them, for example a black that should sink into a black garment." },
  gap: { group: "3. Gang sheet", t: "Gap",
    what: "The space between designs on the sheet, in inches.",
    tip: "0.25 in leaves room to cut the designs apart." },
  build: { group: "3. Gang sheet", t: "Build sheet",
    what: "Packs every copy of every design onto your roll width, as short as it can. Designs turn when that saves film.",
    tip: "Film use is the share of the film that carries art." },
  rotate: { group: "3. Gang sheet", t: "Turn designs",
    what: "Lets the packing turn a design a quarter turn to save film." },
  edgeIn: { group: "3. Gang sheet", t: "Clear film at the ends",
    what: "Film left clear at the start and the end of each sheet, in inches." },
  search: { group: "3. Gang sheet", t: "Packing search",
    what: "How many swaps the packing tries to make the sheet shorter. More swaps can save film and take longer.",
    tip: "Keep 200." },
  files: { group: "4. Export", t: "Files",
    what: "PNG, TIFF or PDF of each sheet at full size, with transparency, plus a white file if Machine says so.",
    tip: "Load the files into your RIP: CADlink, AcroRIP, Maintop, Epson Garment Creator or another." },
  tiff: { group: "4. Export", t: "TIFF compression",
    what: "None works in every RIP but makes large files. Deflate makes small files; most RIPs read it." },
  invertWhite: { group: "4. Export", t: "White file values",
    what: "255 is full white: white pixels print white ink. Inverted: black pixels print white ink, for RIPs that read it that way." },
  preflight: { group: "Checks", t: "Checks",
    what: "What to fix before printing: low resolution, a design too large for the roll, lines and gaps under 0.5 mm, and half-clear pixels.",
    tip: "Every check is a model until a test print is measured on your printer." },
  views: { group: "Checks", t: "Views",
    what: "Art: the design as you gave it. Proof: the repaired design with its white on the garment. Sheet: the packed gang sheet. White: the white layer of the design." },
};

/** Common questions, at the top of the Help panel. */
export const FAQ = [
  ["Does DTF Table drive my printer?", "No. It writes files. Your RIP loads them and drives the printer."],
  ["Does my art leave this computer?", "No. Everything runs in this browser tab."],
  ["Why do fades turn into dots?", "DTF film cannot print a half-clear pixel. Dots of whole ink print a fade that the film can hold."],
  ["Does my RIP use the white file?", "That depends on the RIP. Print the test sheet twice, once with the white file and once without, and compare."],
];

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const body = h => `<p>${esc(h.what)}</p>${h.why ? `<p><b>Why:</b> ${esc(h.why)}</p>` : ""}${h.tip ? `<p><b>Do this:</b> ${esc(h.tip)}</p>` : ""}`;

/** Wire a "?" button onto every element with data-help, and fill the Help panel. Returns attach(root) for content
    drawn later. The same behaviour as the Separation Table's initHelp. */
export function initHelp(doc = document) {
  const pop = doc.createElement("div"); pop.id = "tipPop"; pop.className = "tippop"; pop.setAttribute("role", "dialog"); pop.hidden = true; doc.body.appendChild(pop);
  /** @type {HTMLButtonElement | null} */ let cur = null;
  const close = (refocus = false) => { if (!cur) return; cur.setAttribute("aria-expanded", "false"); const c = cur; cur = null; pop.hidden = true; if (refocus) c.focus(); };
  const place = () => {
    if (!cur) return; const r = cur.getBoundingClientRect(), vw = doc.documentElement.clientWidth, vh = window.innerHeight, w = Math.min(330, vw - 32);
    pop.style.width = w + "px"; const h = pop.offsetHeight, left = Math.max(16, Math.min(r.left + r.width / 2 - w / 2, vw - 16 - w)), below = r.bottom + 9 + h <= vh - 9 || r.top - 9 - h < 9;
    pop.style.left = left + "px"; pop.style.top = (below ? r.bottom + 9 : r.top - 9 - h) + "px"; pop.dataset.side = below ? "below" : "above"; pop.style.setProperty("--ax", (r.left + r.width / 2 - left) + "px");
  };
  let n = 0;
  const attach = (root = doc) => { for (const el of /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll("[data-help]")))) {
    const key = el.dataset.help || "", h = HELP[key]; if (!h || el.querySelector(":scope > button.q")) continue;
    const b = doc.createElement("button"); b.type = "button"; b.className = "q"; b.textContent = "?"; b.id = `q-${key}-${n++}`;
    b.setAttribute("aria-label", `What is ${h.t}?`); b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-controls", "tipPop"); el.appendChild(b);
    b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); if (cur === b) return close();
      close(); cur = b; b.setAttribute("aria-expanded", "true"); pop.innerHTML = `<b class="tt">${esc(h.t)}</b>${body(h)}`; pop.setAttribute("aria-label", h.t); pop.hidden = false; place(); });
  } };
  attach();
  doc.addEventListener("click", e => { if (cur && !pop.contains(/** @type {Node} */ (e.target))) close(); });
  doc.addEventListener("keydown", e => { if (e.key === "Escape" && cur) { e.stopPropagation(); close(true); } }, true);
  window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
  const list = doc.getElementById("helpList"), q = /** @type {HTMLInputElement | null} */ (doc.getElementById("helpQ"));
  if (!list || !q) return attach;
  const groups = {}; for (const [k, h] of Object.entries(HELP)) (groups[h.group] ||= []).push([k, h]);
  list.innerHTML = `<section class="hgroup"><h3>Common questions</h3>${FAQ.map(([qq, a]) => `<details class="hitem"><summary>${esc(qq)}</summary><p>${esc(a)}</p></details>`).join("")}</section>`
    + Object.entries(groups).map(([g, items]) => `<section class="hgroup"><h3>${esc(g)}</h3>${items.map(([k, h]) => `<details class="hitem" data-k="${k}"><summary>${esc(h.t)}</summary>${body(h)}</details>`).join("")}</section>`).join("");
  q.addEventListener("input", () => {
    const words = q.value.toLowerCase().split(/\s+/).filter(Boolean); let shown = 0;
    for (const d of /** @type {HTMLDetailsElement[]} */ (Array.from(list.querySelectorAll(".hitem")))) { const hit = words.every(w => (d.textContent || "").toLowerCase().includes(w)); d.hidden = !hit; d.open = !!words.length && hit; if (hit) shown++; }
    for (const s of /** @type {HTMLElement[]} */ (Array.from(list.querySelectorAll(".hgroup")))) s.hidden = !Array.from(s.querySelectorAll(".hitem")).some(d => !(/** @type {HTMLElement} */ (d)).hidden);
    const none = doc.getElementById("helpNone"); if (none) none.hidden = shown > 0;
  });
  return attach;
}
