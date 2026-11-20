// @ts-check
// DTF Table page: the Separation Table's layout and flow (four steps on the left, the workspace in the middle,
// Advanced Settings on the right, Back / Next on phones), driving DTF Table's own modules. Everything runs in this
// browser tab; no art is uploaded.
import { DTF_PRESETS, newMachine, cleanMachine, localMachines, sheetLimits } from "./machines.js";
import { nest } from "./nest.js";
import { prepareDesign, layout, writeSheet } from "./sheet.js";
import { preflight } from "./preflight.js";
import { makeDeflateRaw, blobSink } from "./browser.js";
import { countSemi } from "./alpha.js";
import { initHelp } from "./help.js";

const $ = id => /** @type {any} */ (document.getElementById(id));
const STEPS = { 1: "Artwork", 2: "Machine / garment", 3: "Gang sheet", 4: "Export" };
const fmt = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toString();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const tick = () => new Promise(r => setTimeout(r, 0));
const phone = () => window.matchMedia("(max-width: 960px)").matches;
const ls = (() => { try { return window.localStorage; } catch { return null; } })();
const store = { get: (k, d) => { try { const v = ls && ls.getItem("dtftable." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { if (ls) ls.setItem("dtftable." + k, JSON.stringify(v)); } catch { /* storage blocked */ } } };
const saved = localMachines(ls || { getItem: () => null, setItem: () => { throw new Error("no storage"); } });

/** @typedef {{ id: string, name: string, W: number, H: number, rgba: Uint8ClampedArray, wIn: number, copies: number, thumb: HTMLCanvasElement, semi: number }} Design */
const st = {
  step: 1, fold: false, advOpen: store.get("advOpen", false), view: "proof", rOpen: false,
  /** @type {Design[]} */ designs: [], sel: "", nextId: 1, garment: store.get("garment", "#111111"),
  /** @type {any} */ nest: null, sheet: 0, written: false,
  /** @type {Map<string, any>} */ prepared: new Map(), prepKey: "",
};

/* ───────────── Steps (the Separation Table's step rows) ───────────── */
function stepDone(k) {
  if (k === 1) return st.designs.length > 0;
  if (k === 2) return !!formMachine().machine && st.step > 2;
  if (k === 3) return !!(st.nest && st.nest.sheets.length);
  return st.written;
}
function renderStepRows() {
  for (let k = 1; k <= 4; k++) {
    const open = k === st.step && !st.fold, done = stepDone(k) && !open;
    $(`step${k}Body`).hidden = !open; $(`step${k}Btn`).setAttribute("aria-expanded", String(open));
    $(`step${k}`).classList.toggle("open", open); $(`step${k}`).classList.toggle("done", done);
    $(`step${k}Badge`).textContent = done ? "✓" : String(k);
    $(`sth${k}`).textContent = done ? `${k} ${STEPS[k]}` : STEPS[k];
    $(`step${k}Act`).textContent = open ? "[−]" : "[+]";
  }
  renderSummaries();
}
function setStep(n, scroll = true) {
  st.step = n; st.fold = false; renderStepRows();
  document.querySelectorAll(".sidesec").forEach(/** @param {any} d */ d => { d.hidden = !d.dataset.for.split(" ").includes(String(n)); });
  $("sideTitle").textContent = STEPS[n];
  placeSide(); renderNav();
  if (n === 3 && st.view === "art") setView("sheet");
  if (!scroll) return;
  const el = $(`step${n}`);
  // phones: as the Separation Table, the least scroll that shows the whole step above the Back / Next bar, or its title
  // just under the pinned workspace when the step is taller than the space
  if (phone()) { const doc = el.getBoundingClientRect().top + window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight, navH = $("mNav").getBoundingClientRect().height, pinned = document.body.classList.contains("nopin") ? 0 : $("square").getBoundingClientRect().height;
    const yTop = Math.max(0, Math.floor(doc - pinned - 9)), yFit = Math.max(0, Math.ceil(doc + el.getBoundingClientRect().height - (window.innerHeight - navH) + 9));
    window.scrollTo({ top: Math.min(yFit, yTop, Math.max(0, max)), behavior: "smooth" }); }
  else { const pane = $("paneSteps"); pane.scrollTo({ top: el.offsetTop - pane.offsetTop - 12, behavior: "smooth" }); }
}
[1, 2, 3, 4].forEach(n => $(`step${n}`).querySelector(".sthead").addEventListener("click", e => {
  if (/** @type {Element} */ (e.target).closest(".q, .hw")) return;
  if (n === st.step && !st.fold) { st.fold = true; renderStepRows(); return; }
  setStep(n);
}));
document.querySelectorAll("[data-next]").forEach(/** @param {any} b */ b => b.addEventListener("click", () => setStep(+b.dataset.next)));

/* Phones: Advanced folds into one row inside the open step; on desktop it is the right column. */
const advTog = document.createElement("button");
advTog.type = "button"; advTog.className = "advtog"; advTog.id = "advTog"; advTog.setAttribute("aria-controls", "paneSide");
function renderAdv() { advTog.setAttribute("aria-expanded", String(st.advOpen)); advTog.innerHTML = `<span>Advanced</span><b aria-hidden="true">${st.advOpen ? "[−]" : "[+]"}</b>`; $("paneSide").classList.toggle("advopen", st.advOpen); }
advTog.addEventListener("click", () => { st.advOpen = !st.advOpen; store.set("advOpen", st.advOpen); renderAdv(); });
function placeSide() {
  const side = $("paneSide"), body = $(`step${st.step}Body`), v3 = /** @type {Element} */ (document.querySelector(".v3"));
  if (phone()) { const nx = body.querySelector(".next"); if (side.parentElement !== body || side.nextSibling !== nx) body.insertBefore(side, nx); if (advTog.nextSibling !== side) body.insertBefore(advTog, side); }
  else { if (side.parentElement !== v3) v3.appendChild(side); advTog.remove(); }
  // the theme switch is one element: in the title row on a phone (in Shop setup when an ADN page has the title row), at
  // the foot of the step column on a desktop
  const seg = $("themeSeg"), home = !phone() ? null : document.body.classList.contains("inheader") ? $("shopPanel").querySelector("section") : $("mShop"), box = home ? home.parentElement : document.querySelector(".stepfoot");
  if (seg.parentElement !== box) /** @type {Element} */ (box).insertBefore(seg, home);
  renderAdv();
}
window.matchMedia("(max-width: 960px)").addEventListener("change", () => { placeSide(); renderNav(); });
$("sideClose").addEventListener("click", () => { document.querySelector(".v3")?.classList.add("noside"); $("sideOpen").hidden = false; });
$("sideOpen").addEventListener("click", () => { document.querySelector(".v3")?.classList.remove("noside"); $("sideOpen").hidden = true; });
function renderNav() {
  const n = st.step; $("mBack").disabled = n === 1;
  $("mProg").querySelectorAll("i").forEach((b, j) => { b.className = j + 1 === n ? "cur" : stepDone(j + 1) ? "done" : ""; });
  $("mProg").setAttribute("aria-valuenow", String([1, 2, 3, 4].filter(stepDone).length)); $("mProg").setAttribute("aria-label", `Step ${n} of 4`);
  const nx = $("mNext"); nx.textContent = n < 4 ? `Next: ${STEPS[n + 1]} →` : "Write files ↓"; nx.disabled = n === 1 && !st.designs.length;
  if (phone() && nx.scrollWidth > nx.clientWidth + 1) nx.textContent = n < 4 ? "Next →" : "Write ↓";
}
$("mBack").addEventListener("click", () => setStep(Math.max(1, st.step - 1)));
$("mNext").addEventListener("click", () => { if (st.step < 4) setStep(st.step + 1); else $("export").click(); });
new ResizeObserver(() => document.documentElement.style.setProperty("--navh", `${$("mNav").getBoundingClientRect().height}px`)).observe($("mNav"));

function renderSummaries() {
  const pieces = st.designs.reduce((s, d) => s + d.copies, 0);
  $("step1Sum").textContent = st.designs.length ? `${st.designs.length} design${st.designs.length > 1 ? "s" : ""} · ${pieces} piece${pieces === 1 ? "" : "s"}` : "Drop your designs in the workspace";
  const { machine } = formMachine();
  $("step2Sum").textContent = machine ? `${fmt(sheetLimits(machine).widthIn)} in roll · ${garmentName()} garment` : "Check the machine";
  const sh = st.nest && st.nest.sheets;
  $("step3Sum").textContent = sh && sh.length ? `${sh.length} sheet${sh.length > 1 ? "s" : ""} · ${fmt(sh.reduce((s, x) => s + x.lengthIn, 0))} in · film use ${fmt(100 * filmUse(), 1)} %` : "Not built yet";
  const fs = ["PNG", "TIFF", "PDF"].filter((f, i) => $(["fPNG", "fTIF", "fPDF"][i]).checked);
  $("step4Sum").textContent = `${fs.join(" + ") || "No file chosen"}${$("white").value === "file" ? " · white file" : ""}`;
}

/* ───────────── Theme (Light, Dark, Device), as the Separation Table ───────────── */
{ const root = document.documentElement, mq = matchMedia("(prefers-color-scheme: dark)"), seg = $("themeSeg");
  const set = t => { root.dataset.theme = t; root.dataset.scheme = t === "device" ? (mq.matches ? "dark" : "light") : t; for (const b of seg.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.v === t)); if (st.designs.length) draw(); };
  seg.addEventListener("click", e => { const b = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest("button[data-v]")); if (b) { store.set("theme", b.dataset.v); set(b.dataset.v); } });
  mq.addEventListener("change", () => set(root.dataset.theme || "device")); set(root.dataset.theme || "device"); }

/* ───────────── Help and Shop setup ───────────── */
const attachHelp = initHelp();
{ const d = $("helpPanel"); $("helpOpen").addEventListener("click", () => { if (!d.open) d.showModal(); $("helpQ").focus(); }); $("helpClose").addEventListener("click", () => d.close());
  d.addEventListener("click", e => { if (e.target === d) d.close(); }); }
{ const d = $("shopPanel"), open = () => { renderMachines(); if (!d.open) d.showModal(); };
  $("shopOpen").addEventListener("click", open); $("mShop").addEventListener("click", open);
  d.addEventListener("click", e => { if (e.target === d) d.close(); });
  document.querySelectorAll("[data-close]").forEach(/** @param {any} b */ b => b.addEventListener("click", () => $(b.dataset.close).close())); }
function renderMachines() {
  const mine = saved.list("dtf"), ul = $("machList"); ul.textContent = ""; $("machPill").textContent = `${mine.length} saved`;
  for (const m of mine) { const li = document.createElement("li"); li.innerHTML = `<span><b>${esc(m.name)}</b> · ${fmt(sheetLimits(m).widthIn)} in${Number.isFinite(sheetLimits(m).maxLengthIn) ? ` × ${fmt(sheetLimits(m).maxLengthIn)} in` : ""} · ${m.dpi.file} dpi</span><span class="row"><button type="button" data-use="${esc(m.id)}">Use</button><button type="button" data-forget="${esc(m.id)}">Forget</button></span>`; ul.append(li); }
  if (!mine.length) { const li = document.createElement("li"); li.textContent = "No saved machines yet."; ul.append(li); }
}
$("machList").addEventListener("click", e => { const t = /** @type {any} */ (e.target);
  if (t.dataset.forget) { saved.remove("dtf", t.dataset.forget); fillMachines(); renderMachines(); }
  if (t.dataset.use) { fillMachines("saved:" + t.dataset.use); $("shopPanel").close(); setStep(2); } });
$("machSave").addEventListener("click", () => {
  const { machine, errors } = formMachine(); if (!machine) { $("machNote").textContent = errors.join("; "); return; }
  machine.name = ($("machName").value || "").trim() || machine.name; machine.id = $("machine").value.startsWith("saved:") ? $("machine").value.slice(6) : "";
  const r = saved.save(machine); $("machNote").textContent = r.ok ? `Saved: ${r.machine.name}.` : "This browser does not allow saving.";
  if (r.ok) { $("machName").value = ""; fillMachines("saved:" + r.machine.id); renderMachines(); }
});

/* ───────────── Steppers, and the Advanced marks (Default or You set) ───────────── */
document.querySelectorAll(".stp").forEach(/** @param {any} b */ b => b.addEventListener("click", () => {
  const i = $(b.dataset.for), step = +b.dataset.d, v = Math.round(((+i.value || 0) + step) * 1000) / 1000;
  i.value = String(Math.max(+i.min || -Infinity, Math.min(i.max === "" ? Infinity : +i.max, v))); i.dispatchEvent(new Event("input")); i.dispatchEvent(new Event("change"));
}));
const ADV = { 1: ["aMode", "aLpi", "aAngle", "aMin", "aMax", "aEdge"], 2: ["wChoke", "wSpread", "wDensity", "wMode", "wThin", "wKnock", "wNoWhite"], 3: ["nRotate", "nEdge", "nSearch"], 4: ["fTiffZ", "fInvert"] };
const getV = id => $(id).type === "checkbox" ? $(id).checked : $(id).value;
const DEF = Object.fromEntries(Object.values(ADV).flat().map(id => [id, getV(id)]));
function renderMarks() {
  for (const [k, ids] of Object.entries(ADV)) {
    let changed = 0;
    for (const id of ids) { const hand = getV(id) !== DEF[id], m = document.querySelector(`[data-pm="${id}"]`); if (m) m.className = hand ? "pm hand" : "pm"; if (hand) changed++; }
    document.querySelectorAll(`[data-sum^="${k}"]`).forEach(e => { e.textContent = changed ? `${changed} set` : "Standard"; });
  }
}
document.querySelectorAll(".pdef").forEach(/** @param {any} b */ b => b.addEventListener("click", () => {
  for (const id of ADV[b.dataset.def]) { const e = $(id); if (e.type === "checkbox") e.checked = DEF[id]; else e.value = DEF[id]; }
  settingsChanged();
}));
const adv = id => getV(id);
function alphaOpts() { return { mode: adv("aMode"), lpi: +adv("aLpi") || 35, angle: +adv("aAngle") || 0, minDot: (+adv("aMin") || 0) / 100, maxDot: (+adv("aMax") || 90) / 100, edgePx: +adv("aEdge") || 0 }; }
const hexes = v => String(v).split(",").map(s => s.trim()).filter(s => /^#?[0-9a-f]{6}$/i.test(s)).map(s => s.startsWith("#") ? s : "#" + s);
function whiteOpts() { return { chokePx: +adv("wChoke") || 0, spreadPx: +adv("wSpread") || 0, density: (+adv("wDensity") || 0) / 100, mode: adv("wMode"), keepThin: adv("wThin"), knockouts: hexes(adv("wKnock")), noWhite: hexes(adv("wNoWhite")) }; }
function settingsChanged() { st.prepared.clear(); st.written = false; $("links").textContent = ""; renderMarks(); renderSummaries(); draw(); }
for (const id of Object.values(ADV).flat()) { $(id).addEventListener("change", settingsChanged); }

/* ───────────── Step 2: machine and garment ───────────── */
const GARMENTS = [["#111111", "Black"], ["#ffffff", "White"], ["#1c2a4a", "Navy"], ["#6e6e6e", "Charcoal"], ["#7a1f2b", "Maroon"], ["#c9b48f", "Sand"], ["#1f4e9c", "Royal"], ["#b3121e", "Red"], ["#2d5a3a", "Forest"], ["#a7a9ac", "Heather"]];
const TEE = c => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3 4 5 1 9.5 4 11.5 5 10.5V21h14V10.5l1 1 3-2L20 5l-4-2c-.6 1.6-2.2 2.6-4 2.6S8.6 4.6 8 3Z" fill="${c}"/></svg>`;
$("garments").innerHTML = GARMENTS.map(([hex, name]) => `<button type="button" data-hex="${hex}" aria-label="${name}" title="${name}" aria-pressed="false">${TEE(hex)}<span>${name}</span></button>`).join("");
function garmentName() { const g = GARMENTS.find(([h]) => h === st.garment); return g ? g[1] : st.garment; }
function renderGarment() { for (const b of $("garments").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.hex === st.garment)); $("teeName").textContent = garmentName(); }
$("garments").addEventListener("click", e => { const b = /** @type {any} */ (e.target).closest("button[data-hex]"); if (!b) return; st.garment = b.dataset.hex; store.set("garment", st.garment); renderGarment(); renderSummaries(); draw(); });

function fillMachines(selectId) {
  const sel = $("machine"), keep = selectId || sel.value || store.get("machine", "preset:roll-22"); sel.textContent = "";
  for (const p of DTF_PRESETS) sel.append(new Option(p.name, "preset:" + p.id));
  sel.append(new Option("Custom width", "preset:custom"));
  const mine = saved.list("dtf");
  if (mine.length) { const g = document.createElement("optgroup"); g.label = "Saved machines"; for (const m of mine) g.append(new Option(m.name, "saved:" + m.id)); sel.append(g); }
  sel.value = keep; if (!sel.value) sel.value = "preset:roll-22";
  applyMachine();
}
function currentMachine() { const [kind, id] = $("machine").value.split(":"); return (kind === "saved" ? saved.list("dtf").find(m => m.id === id) : newMachine(id)) || newMachine("roll-22"); }
function applyMachine() {
  const m = currentMachine();
  $("width").value = m.media.printableWidthIn ?? m.media.widthIn; $("maxlen").value = m.media.maxLengthIn ? m.media.maxLengthIn : "";
  $("dpi").value = m.dpi.file; $("white").value = m.white.supply === "file" ? "file" : "none"; $("mirror").value = m.mirror ? "mirror" : "right";
  $("machineNote").textContent = m.verify && m.verify.length ? "Check your printer's printable width, longest print and how your RIP takes white. Shop setup saves the machine." : "";
  store.set("machine", $("machine").value); machineChanged();
}
function formMachine() {
  const m = currentMachine(), w = +$("width").value, L = +$("maxlen").value, roll = m.preset === "custom" ? w : Math.max(m.media.widthIn, w);
  return cleanMachine({ ...m, name: m.preset === "custom" ? `${fmt(w)} in roll` : m.name, media: { ...m.media, widthIn: roll, printableWidthIn: w, maxLengthIn: L > 0 ? L : null },
    dpi: { ...m.dpi, file: +$("dpi").value }, white: { ...m.white, supply: $("white").value }, mirror: $("mirror").value === "mirror" });
}
function machineChanged() { st.nest = null; st.written = false; st.prepared.clear(); $("sheets").textContent = ""; $("links").textContent = ""; $("export").disabled = true; renderDesigns(); renderChecks(); renderSummaries(); draw(); }
$("machine").addEventListener("change", applyMachine);
for (const id of ["width", "maxlen", "dpi", "white", "mirror"]) $(id).addEventListener("change", machineChanged);

/* ───────────── Step 1: designs ───────────── */
async function readArt(file) {
  const bmp = await createImageBitmap(file, { premultiplyAlpha: "none", colorSpaceConversion: "default" });
  const c = new OffscreenCanvas(bmp.width, bmp.height), g = /** @type {OffscreenCanvasRenderingContext2D} */ (c.getContext("2d", { willReadFrequently: true }));
  g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, bmp.width, bmp.height); bmp.close(); return { W: d.width, H: d.height, rgba: d.data };
}
function thumbOf(art) {
  const c = document.createElement("canvas"); c.width = art.W; c.height = art.H; /** @type {CanvasRenderingContext2D} */ (c.getContext("2d")).putImageData(new ImageData(new Uint8ClampedArray(art.rgba), art.W, art.H), 0, 0); return c;
}
function addArt(name, art) {
  const dpi = +$("dpi").value || 300, roll = +$("width").value || 22, wIn = Math.max(0.25, Math.min(roll, Math.round(art.W / dpi * 4) / 4 || 1));
  const d = { id: "d" + st.nextId++, name, ...art, wIn, copies: 1, thumb: thumbOf(art), semi: countSemi(art.rgba) };
  st.designs.push(d); st.sel = d.id;
}
async function addFiles(files) {
  for (const f of files) {
    busy(`Reading ${f.name}…`); await tick();
    try { addArt(f.name, await readArt(f)); } catch { setStatus(`${f.name}: not a picture this browser can read.`); }
  }
  busy(null); designsChanged(); if (st.step !== 1) setStep(1, false);
}
$("file").addEventListener("change", e => { addFiles([...e.target.files]); e.target.value = ""; });
$("addMore").addEventListener("click", () => $("file").click());
const drop = $("drop"), square = $("square");
for (const el of [drop, square]) {
  el.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("on"); });
  el.addEventListener("dragleave", () => drop.classList.remove("on"));
  el.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("on"); addFiles([...e.dataTransfer.files].filter(f => /image\//.test(f.type))); });
}
drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("file").click(); } });
/** Two sample designs drawn here: a disc with a soft glow (a fade to halftone) and a badge with a thin line. */
function sample() {
  const mk = (W, H, f) => { const rgba = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgba.set(f(x, y), (y * W + x) * 4); return { W, H, rgba }; };
  addArt("Sample glow.png", mk(1200, 1200, (x, y) => { const d = Math.hypot(x - 600, y - 600); return [230, 60, 40, Math.round(255 * Math.max(0, Math.min(1, (560 - d) / 160)))]; }));
  addArt("Sample badge.png", mk(900, 600, (x, y) => { const box = x > 30 && x < 870 && y > 30 && y < 570, line = Math.abs(y - 300) < 2 && x > 100 && x < 800, ring = Math.abs(Math.hypot(x - 450, y - 300) - 200) < 14;
    return line || ring ? [250, 210, 30, 255] : box ? [20, 90, 200, 255] : [0, 0, 0, 0]; }));
  st.designs[st.designs.length - 2].copies = 6; st.designs[st.designs.length - 1].copies = 8; designsChanged();
}
$("trySample").addEventListener("click", sample); $("dropSample").addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); sample(); });

function hInOf(d) { return d.wIn * d.H / d.W; }
function renderDesigns() {
  const ol = $("designs"), dpi = +$("dpi").value || 300; ol.textContent = "";
  for (const d of st.designs) {
    const li = document.createElement("li"), ppi = Math.round(d.W / d.wIn); li.dataset.id = d.id; li.setAttribute("aria-current", String(d.id === st.sel));
    li.innerHTML = `<canvas width="120" height="120" aria-hidden="true"></canvas><div class="fc"><b></b><span>${d.W} × ${d.H} px · ${fmt(d.wIn)} × ${fmt(hInOf(d))} in</span><span class="${ppi < 150 ? "bad" : ""}">${ppi} ppi at this size${ppi < dpi - 0.5 ? ` · under ${dpi}` : ""}</span></div>
      <div class="dfields"><div class="field"><label class="lab" data-help="width">Width, in</label><div class="stepper sp"><button type="button" data-d="-0.5" aria-label="Width smaller">−</button><input type="number" min="0.25" step="0.25" data-k="wIn" aria-label="Width of ${esc(d.name)}, inches"><button type="button" data-d="0.5" aria-label="Width larger">+</button></div></div>
      <div class="field"><label class="lab" data-help="copies">Copies</label><div class="stepper sp"><button type="button" data-d="-1" aria-label="One copy fewer">−</button><input type="number" min="0" step="1" data-k="copies" aria-label="Copies of ${esc(d.name)}"><button type="button" data-d="1" aria-label="One copy more">+</button></div></div>
      <button type="button" class="rm">Remove</button></div>`;
    /** @type {HTMLElement} */ (li.querySelector(".fc b")).textContent = d.name;
    const c = /** @type {HTMLCanvasElement} */ (li.querySelector("canvas")), g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d")), s = Math.min(120 / d.W, 120 / d.H);
    g.drawImage(d.thumb, (120 - d.W * s) / 2, (120 - d.H * s) / 2, d.W * s, d.H * s);
    const [wi, ci] = /** @type {HTMLInputElement[]} */ (Array.from(li.querySelectorAll("input"))); wi.value = String(d.wIn); ci.value = String(d.copies);
    const set = () => { d.wIn = Math.max(0.25, +wi.value || d.wIn); d.copies = Math.max(0, Math.floor(+ci.value || 0)); designsChanged(); };
    wi.addEventListener("change", set); ci.addEventListener("change", set);
    li.querySelectorAll(".stepper button").forEach(/** @param {any} b */ b => b.addEventListener("click", e => { e.stopPropagation(); const i = b.parentElement.querySelector("input"); i.value = String(Math.max(+i.min, Math.round((+i.value + +b.dataset.d) * 100) / 100)); set(); }));
    /** @type {HTMLElement} */ (li.querySelector(".rm")).addEventListener("click", e => { e.stopPropagation(); st.designs = st.designs.filter(x => x !== d); if (st.sel === d.id) st.sel = st.designs[0]?.id || ""; designsChanged(); });
    li.addEventListener("click", e => { if (/** @type {Element} */ (e.target).closest("input, button")) return; st.sel = d.id; renderDesigns(); if (st.view === "sheet") setView("proof"); else draw(); });
    ol.append(li);
  }
  attachHelp(ol);
}
function designsChanged() {
  st.nest = null; st.written = false; $("sheets").textContent = ""; $("links").textContent = ""; $("export").disabled = true;
  for (const k of st.prepared.keys()) if (!st.designs.some(d => k.startsWith(d.id + "|"))) st.prepared.delete(k);
  $("drop").hidden = st.designs.length > 0; $("build").disabled = !st.designs.length;
  renderDesigns(); renderChecks(); renderStepRows(); renderNav(); draw();
}

/* ───────────── Checks and numbers (the rating row) ───────────── */
const TITLE = { resolution: "Resolution", fits: "Size", semi: "Half-clear pixels", "thin-line": "Thin lines", "thin-gap": "Thin gaps", gamut: "Colours" };
const SEV = { error: "Error", warning: "Warning", note: "Note" };
function renderChecks() {
  const { machine } = formMachine(), limits = machine ? sheetLimits(machine) : null, rows = [];
  let errors = 0, warnings = 0;
  for (const d of st.designs) for (const c of preflight(d, { wIn: d.wIn, hIn: hInOf(d), limits })) {
    if (c.id === "gamut") continue;
    if (c.severity === "error") errors++; if (c.severity === "warning") warnings++;
    rows.push(`<div class="ck ${c.severity}"><b>${SEV[c.severity]} · ${esc(TITLE[c.id] || c.id)} · ${esc(d.name)}</b><p>${esc(c.text)}</p></div>`);
  }
  rows.push(`<div class="ck note"><b>Note · Colours</b><p>Colours are not checked against your printer: no machine carries a colour profile yet. Every check is a model until a test print is measured.</p></div>`);
  $("preflight").innerHTML = rows.join(""); attachHelp($("preflight"));
  $("drNum").textContent = st.designs.length ? String(errors + warnings) : "–";
  $("mrDe").textContent = !st.designs.length ? "No designs yet" : errors ? `${errors} error${errors > 1 ? "s" : ""}${warnings ? `, ${warnings} warning${warnings > 1 ? "s" : ""}` : ""}` : warnings ? `${warnings} warning${warnings > 1 ? "s" : ""}` : "Ready to print";
  $("drFacts").textContent = st.nest && st.nest.sheets.length ? `${fmt(st.nest.sheets[st.sheet]?.lengthIn ?? 0)} in · ${fmt(100 * filmUse(), 1)} %` : "";
  $("sDesigns").textContent = String(st.designs.length || "–");
  const pieces = st.nest ? st.nest.sheets.reduce((s, x) => s + x.placements.length, 0) : st.designs.reduce((s, d) => s + d.copies, 0);
  $("sPieces").textContent = st.designs.length ? String(pieces) : "–";
  $("sFilm").textContent = st.nest ? fmt(st.nest.sheets.reduce((s, x) => s + x.lengthIn, 0)) : "–";
  $("sUse").textContent = st.nest ? `${fmt(100 * filmUse(), 1)} %` : "–";
  $("sSemi").textContent = st.designs.length ? st.designs.reduce((s, d) => s + d.semi, 0).toLocaleString("en-US") : "–";
}
$("dRate").addEventListener("click", () => { st.rOpen = !st.rOpen; $("rating").classList.toggle("open", st.rOpen); $("dRate").setAttribute("aria-expanded", String(st.rOpen)); $("dRate").querySelector(".mrarr").textContent = st.rOpen ? "▴" : "▾"; });
function filmUse() { if (!st.nest) return 0; const a = st.nest.sheets.reduce((s, x) => s + x.usedIn2, 0), f = st.nest.sheets.reduce((s, x) => s + x.widthIn * x.lengthIn, 0); return f ? a / f : 0; }

/* ───────────── Workspace views: Art, Proof, Sheet, White ───────────── */
function setView(v) { st.view = v; for (const b of $("view").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.v === v)); draw(); }
$("view").addEventListener("click", e => { const b = /** @type {any} */ (e.target).closest("button[data-v]"); if (b) setView(b.dataset.v); });
const busy = t => { $("busyMask").hidden = !t; if (t) $("busyText").textContent = t; };
const setStatus = t => { $("status").textContent = t; };
/** A design prepared for the proof and the white view: at the file resolution, capped at 1600 px on its long side so
    the view stays quick (the files are always written at full resolution). */
async function preparedView(d) {
  const dpi = +$("dpi").value || 300, cap = Math.min(dpi, 1600 / Math.max(d.wIn, hInOf(d))), key = `${d.id}|${d.wIn}|${cap.toFixed(3)}|${JSON.stringify(alphaOpts())}|${JSON.stringify(whiteOpts())}`;
  if (!st.prepared.has(key)) { busy("Preparing the proof…"); await tick(); st.prepared.set(key, prepareDesign(d, { wIn: d.wIn, hIn: hInOf(d), dpi: cap, alpha: { ...alphaOpts(), dpi }, white: whiteOpts() })); busy(null); }
  return st.prepared.get(key);
}
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
let drawSeq = 0;
async function draw() {
  const seq = ++drawSeq, cv = $("view0"), box = $("square").getBoundingClientRect(), S = Math.max(240, Math.floor(Math.min(box.width, box.height) - 45)), dpr = window.devicePixelRatio || 1;
  const d = st.designs.find(x => x.id === st.sel) || st.designs[0];
  $("viewNote").textContent = ""; $("sizeBadge").hidden = true;
  // the workspace is on the garment colour where the view shows the garment, as the Separation Table's is
  $("square").style.background = d && st.view === "proof" ? st.garment : "";
  if (!d) { cv.width = 1; cv.height = 1; return; }
  if (st.view === "sheet") return drawSheet(cv, S, dpr);
  const W = d.W, H = d.H, s = Math.min(S / W, S / H); cv.width = Math.round(W * s * dpr); cv.height = Math.round(H * s * dpr); cv.style.width = `${Math.round(W * s)}px`; cv.style.height = `${Math.round(H * s)}px`;
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext("2d")); g.imageSmoothingQuality = "high";
  $("sizeBadge").textContent = `${fmt(d.wIn)} × ${fmt(hInOf(d))} in`; $("sizeBadge").hidden = false;
  if (st.view === "art") {
    const c = 12 * dpr; for (let y = 0; y < cv.height; y += c) for (let x = 0; x < cv.width; x += c) { g.fillStyle = ((x + y) / c) % 2 ? "#c8c8c8" : "#eeeeee"; g.fillRect(x, y, c, c); }
    g.drawImage(d.thumb, 0, 0, cv.width, cv.height); $("viewNote").textContent = `${d.name}: the art as you gave it.`; return;
  }
  const p = await preparedView(d); if (seq !== drawSeq) return;
  const img = new ImageData(p.W, p.H), gar = hex2rgb(st.garment), o = img.data;
  for (let i = 0; i < p.W * p.H; i++) {
    const a = p.rgba[i * 4 + 3] > 0, w = p.white ? p.white[i] / 255 : 0, q = i * 4;
    if (st.view === "white") { const v = Math.round(255 * w); o[q] = o[q + 1] = o[q + 2] = v; o[q + 3] = 255; continue; }
    // proof: ink on white prints its colour; ink with no white under it mixes with the garment (thin DTF ink is about
    // half opaque: a model, until the test print is measured); white with no ink shows white; nothing shows the garment
    for (let k = 0; k < 3; k++) { const ink = p.rgba[q + k], base = w * 255 + (1 - w) * gar[k]; o[q + k] = a ? Math.round(ink * (0.5 + 0.5 * w) + base * (0.5 - 0.5 * w)) : Math.round(w * 255 + (1 - w) * gar[k]); }
    o[q + 3] = 255;
  }
  const c = new OffscreenCanvas(p.W, p.H); /** @type {OffscreenCanvasRenderingContext2D} */ (c.getContext("2d")).putImageData(img, 0, 0);
  g.drawImage(c, 0, 0, cv.width, cv.height);
  $("viewNote").textContent = st.view === "white" ? `${d.name}: the white layer (white is full white ink).` : `${d.name} on a ${garmentName().toLowerCase()} garment: repaired alpha and the white layer. A model, until a test print is measured.`;
}
function drawSheet(cv, S, dpr) {
  const sheet = st.nest && st.nest.sheets[st.sheet];
  if (!sheet) { const g = cv.getContext("2d"); cv.width = 1; cv.height = 1; g.clearRect(0, 0, 1, 1); $("viewNote").textContent = "Build the sheet in step 3 to see it here."; return; }
  const s = Math.min(S / sheet.widthIn, (S * 2.5) / sheet.lengthIn); cv.width = Math.round(sheet.widthIn * s * dpr); cv.height = Math.round(sheet.lengthIn * s * dpr);
  cv.style.width = `${Math.round(sheet.widthIn * s)}px`; cv.style.height = `${Math.round(sheet.lengthIn * s)}px`;
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext("2d")), k = s * dpr; g.fillStyle = st.garment; g.fillRect(0, 0, cv.width, cv.height);
  for (const p of sheet.placements) { const d = st.designs.find(x => x.id === p.id); if (!d) continue; g.save(); g.translate(p.xIn * k, p.yIn * k);
    if (p.rotated) { g.translate(p.wIn * k, 0); g.rotate(Math.PI / 2); g.drawImage(d.thumb, 0, 0, p.hIn * k, p.wIn * k); } else g.drawImage(d.thumb, 0, 0, p.wIn * k, p.hIn * k);
    g.restore(); g.strokeStyle = "#8b8680"; g.lineWidth = dpr; g.strokeRect(p.xIn * k, p.yIn * k, p.wIn * k, p.hIn * k); }
  $("sizeBadge").textContent = `${fmt(sheet.widthIn)} × ${fmt(sheet.lengthIn)} in`; $("sizeBadge").hidden = false;
  $("viewNote").textContent = `Sheet ${st.sheet + 1} of ${st.nest.sheets.length}: ${sheet.placements.length} pieces, film use ${fmt(100 * sheet.filmUse, 1)} %.`;
}
new ResizeObserver(() => { clearTimeout(rsT); rsT = window.setTimeout(draw, 150); }).observe($("square")); let rsT = 0;

/* ───────────── Step 3: build the sheet ───────────── */
$("gap").addEventListener("change", () => { st.nest = null; renderSummaries(); });
$("build").addEventListener("click", async () => {
  const { machine, errors } = formMachine(); if (!machine) { setStatus(errors.join("; ")); return; }
  const lim = sheetLimits(machine); setStatus("Packing…"); busy("Packing the sheet…"); await tick();
  const pieces = st.designs.map(d => ({ id: d.id, wIn: d.wIn, hIn: hInOf(d), copies: d.copies, rotate: adv("nRotate") }));
  st.nest = nest(pieces, { widthIn: lim.widthIn, maxLengthIn: lim.maxLengthIn, gapIn: +$("gap").value || 0, edgeIn: +adv("nEdge") || 0, search: Math.max(0, +adv("nSearch") || 0) });
  st.sheet = 0; st.written = false; busy(null);
  const sh = st.nest.sheets, n = sh.reduce((s, x) => s + x.placements.length, 0);
  setStatus(sh.length ? `${sh.length} sheet${sh.length > 1 ? "s" : ""}, ${n} pieces, ${fmt(lim.widthIn)} × ${fmt(sh.reduce((s, x) => s + x.lengthIn, 0))} in of film, film use ${fmt(100 * filmUse(), 1)} %.`
    + (st.nest.tooLarge.length ? ` Too large for this film: ${st.nest.tooLarge.map(id => st.designs.find(d => d.id === id)?.name).join(", ")}.` : "") : "Nothing to place: every design has 0 copies or is too large.");
  renderSheets(); $("export").disabled = !sh.length; renderChecks(); renderStepRows(); renderNav(); setView("sheet");
});
function renderSheets() {
  const ol = $("sheets"); ol.textContent = ""; if (!st.nest || st.nest.sheets.length < 2) return;
  st.nest.sheets.forEach((s, i) => { const li = document.createElement("li"); li.innerHTML = `<button type="button" aria-pressed="${i === st.sheet}"><span>Sheet ${i + 1}</span><span>${fmt(s.lengthIn)} in · ${s.placements.length} pieces · ${fmt(100 * s.filmUse, 1)} %</span></button>`;
    li.querySelector("button")?.addEventListener("click", () => { st.sheet = i; renderSheets(); setView("sheet"); }); ol.append(li); });
}

/* ───────────── Step 4: write the files ───────────── */
for (const id of ["fPNG", "fTIF", "fPDF"]) $(id).addEventListener("change", renderSummaries);
$("export").addEventListener("click", async () => {
  if (!st.nest || !st.nest.sheets.length) { setStep(3); return; }
  const { machine } = formMachine(); if (!machine) return; const dpi = machine.dpi.file, links = $("links"); links.textContent = "";
  const formats = [["png", "fPNG"], ["tiff", "fTIF"], ["pdf", "fPDF"]].filter(([, id]) => $(id).checked).map(([f]) => f);
  if (!formats.length) { $("expStatus").textContent = "Choose at least one file type."; return; }
  $("export").disabled = true;
  try {
    const prepared = new Map();
    for (const d of st.designs) { if (!d.copies) continue; busy(`Preparing ${d.name} at ${dpi} dpi…`); $("expStatus").textContent = `Preparing ${d.name}…`; await tick();
      prepared.set(d.id, prepareDesign(d, { wIn: d.wIn, hIn: hInOf(d), dpi, alpha: alphaOpts(), white: whiteOpts() })); }
    const type = { png: "image/png", tiff: "image/tiff", pdf: "application/pdf" }, layers = machine.white.supply === "file" ? ["colour", "white"] : ["colour"];
    for (const [i, sheet] of st.nest.sheets.entries()) {
      const lay = layout(sheet, prepared, dpi);
      for (const format of formats) for (const layer of layers) {
        busy(`Writing sheet ${i + 1}, ${format.toUpperCase()}${layer === "white" ? ", white" : ""}…`); await tick();
        const sink = blobSink(); writeSheet({ lay, dpi, format, layer, sink, deflateRaw: makeDeflateRaw(), mirror: machine.mirror, invert: adv("fInvert") === "yes", compression: adv("fTiffZ") });
        const blob = sink.blob(type[format]), a = document.createElement("a"), name = `dtf-sheet-${i + 1}${layer === "white" ? "-white" : ""}.${format === "tiff" ? "tif" : format}`;
        a.href = URL.createObjectURL(blob); a.download = name; a.textContent = `${name} (${fmt(blob.size / 1e6, 1)} MB)`;
        const li = document.createElement("li"); li.append(a); links.append(li);
      }
    }
    st.written = true; $("expStatus").textContent = "Done. Save each file, then load them into your RIP.";
  } catch (e) { $("expStatus").textContent = `Could not write the files: ${e && e.message ? e.message : e}`; }
  busy(null); $("export").disabled = false; renderStepRows(); renderNav();
});

/* ───────────── The workspace pin, and the page framed in an ADN page (the Separation Table's rules) ─────────────
   Phones: the workspace pins at the top of the screen (bench.css) while the rows and the steps scroll under it.
   Framed in an ADN page (the tool page, the wall), the frame is as tall as the table and the page scrolls, not the
   table. The page's scroll is read instead: y is how far the page has scrolled past the frame's top (under the site
   header and the program header, [data-tool-header]); vh is the height left to see. --pin carries y to the sticky
   offsets in bench.css, so the art pins under the page's headers. */
const frameEl = (() => { try { return window.parent !== window ? window.frameElement : null; } catch { return null; } })();
function parentPin() {
  if (!frameEl) return null;
  try { const P = /** @type {any} */ (window.parent), d = P.document, fr = frameEl.getBoundingClientRect();
    const hdr = parseFloat(P.getComputedStyle(d.documentElement).getPropertyValue("--adn-hdr-h")) || 0; let top = hdr, held = hdr;
    d.querySelectorAll("[data-tool-header]").forEach(e => { const r = e.getBoundingClientRect(); if (r.height) { top = Math.max(top, r.bottom); held += r.height; } });
    return { y: Math.max(0, Math.round(top - fr.top)), vh: Math.max(240, P.innerHeight - held) }; } catch { return null; }
}
/** Desktop: the workspace column is as tall as the window (framed in an ADN page: the height under the page's
    headers). Framed in a page that cannot be read there is no height to take: the workspace is a square. */
function deskFit() {
  const pp = parentPin(), h = pp ? pp.vh : window.parent !== window ? 0 : window.innerHeight, r = document.documentElement.style;
  if (h) r.setProperty("--wsh", `${h}px`); else r.removeProperty("--wsh");
}
function syncSq() {
  const r = document.documentElement.style, pp = parentPin(); r.setProperty("--pin", `${pp ? pp.y : 0}px`);
  if (pp) r.setProperty("--pvh", `${pp.vh}px`); // the height in view, for a panel that opens over the table (page.css)
  if (!phone()) { document.body.classList.remove("nopin"); deskFit(); return; }
  // a screen so short (landscape) that the pinned workspace would leave the steps under 160 px: it scrolls away
  const vh = pp ? pp.vh : window.innerHeight, navH = pp ? 0 : $("mNav").getBoundingClientRect().height;
  document.body.classList.toggle("nopin", vh - navH - $("square").getBoundingClientRect().height < 160);
}
window.addEventListener("resize", syncSq); window.addEventListener("scroll", syncSq, { passive: true });
if (frameEl) try { window.parent.document.addEventListener("scroll", syncSq, { passive: true, capture: true }); window.parent.addEventListener("resize", syncSq); } catch { /* other origin */ }
document.querySelectorAll("input[type=number]").forEach(/** @param {any} i */ i => { i.inputMode = "decimal"; });
// Framed in an ADN tool page, the page header has the Help button (?); the table hides its own (bench.css).
if (window.parent !== window) {
  document.body.classList.add("framed");
  window.addEventListener("scroll", () => { if (window.scrollY) window.scrollTo(0, 0); }, { passive: true }); // the page scrolls, not the frame (iOS bounces frames)
  // On the tool's full page (not the wall) the page's program header carries the title and the setup gear.
  try { if (!window.parent.location.pathname.endsWith("/wall")) document.body.classList.add("inheader"); } catch { /* other origin */ }
}

/* ───────────── Start ───────────── */
fillMachines(); renderGarment(); renderMarks();
$("drop").hidden = false; setStep(1, false); renderChecks(); renderSummaries(); syncSq();
