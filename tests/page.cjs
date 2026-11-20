// Browser test of the page: serves src/ itself, loads the page at a phone and a desktop size, and checks the
// Separation Table layout (tests/table-layout.cjs) and the page's flow:
// sample designs, the views, the gang sheet, the files. Needs Playwright with Chromium.
//   node tests/page.cjs [screenshot-dir]
const fs = require("node:fs"), path = require("node:path");
const { chromium } = require("playwright");
const T = require("./table-layout.cjs");
const pub = path.join(__dirname, "../src"), shots = process.argv[2];
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };

(async () => {
  const site = await T.servePublic(pub), browser = await chromium.launch();
  try {
    for (const [label, viewport] of T.SIZES) {
      const phone = viewport.width <= 960;
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, acceptDownloads: true, colorScheme: "light" }), page = await ctx.newPage(), errors = [];
      page.on("pageerror", e => errors.push(String(e))); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
      const step = async n => { if ((await page.getAttribute(`#step${n}Btn`, "aria-expanded")) !== "true") await page.click(`#step${n}Btn`); await page.waitForTimeout(350); };
      await page.goto(site.base + "/index.html"); await page.locator("#machine option").first().waitFor({ state: "attached", timeout: 15000 });

      // the first screen
      const dropText = await page.locator("#drop").innerText();
      ok(/Drop your designs here/.test(dropText) && /It is not uploaded/.test(dropText) && await page.locator("#dropSample").isVisible(), `${label}: drop box with its help lines and "Try the sample designs"`);
      await T.noSidewaysScroll(page, label + ", no designs", ok);
      if (phone) await T.navClearAtTop(page, label + ", no designs", ok);
      if (shots) await page.screenshot({ path: path.join(shots, `dtf-${viewport.width}-empty.png`) });

      // sample designs, the views of a design
      await page.click("#dropSample"); await page.waitForFunction(() => document.querySelectorAll("#designs li").length === 2);
      ok((await page.locator("#sDesigns").textContent()) === "2" && /2 designs · 14 pieces/.test(await page.locator("#step1Sum").textContent()), `${label}: two sample designs listed (${await page.locator("#step1Sum").textContent()})`);
      await T.viewsShow(page, label, ok, ["art", "white", "proof"]);
      ok((await page.locator("#square").evaluate(e => e.style.background)) !== "", `${label}: in Proof the workspace is on the garment colour`);

      // step 3: the gang sheet; step 4: the files
      if (phone) { await page.click("#mNext"); ok((await page.getAttribute("#step2Btn", "aria-expanded")) === "true", `${label}: Next opens step 2`); await page.click("#mBack"); ok((await page.getAttribute("#step1Btn", "aria-expanded")) === "true", `${label}: Back opens step 1`); }
      await step(3); await page.click("#build"); await page.waitForFunction(() => /sheet/.test(document.getElementById("status").textContent), null, { timeout: 60000 });
      ok(/1 sheet, 14 pieces/.test(await page.locator("#status").innerText()), `${label}: gang sheet built (${(await page.locator("#status").innerText()).slice(0, 70)})`);
      await T.viewsShow(page, label, ok, ["sheet"]);
      await step(4); await page.click(phone ? "#mNext" : "#export"); await page.waitForFunction(() => /Done/.test(document.getElementById("expStatus").textContent), null, { timeout: 120000 });
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#links a")]);
      const buf = fs.readFileSync(await dl.path());
      ok(dl.suggestedFilename() === "dtf-sheet-1.png" && buf[0] === 0x89 && buf[1] === 0x50, `${label}: ${dl.suggestedFilename()} downloads (${buf.length} bytes)${phone ? ", written from the Next bar" : ""}`);

      // the layout, with designs in the workspace
      await T.themeSwitches(page, label, ok);
      await T.controlsReachable(page, label, ok);
      await step(1); await page.evaluate(() => window.scrollTo(0, 0));
      if (phone) await T.navClearAtTop(page, label + ", with designs", ok);
      await T.noSidewaysScroll(page, label + ", with designs", ok);
      if (shots) await page.screenshot({ path: path.join(shots, `dtf-${viewport.width}-art.png`) });
      ok(!errors.length, `${label}: no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
      await ctx.close();
      await T.framedChecks(browser, site.base, "/index.html", viewport, label, ok);
    }
  } catch (e) { fails++; console.log("FAIL", e.message); }
  await browser.close(); site.close();
  console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
})();
