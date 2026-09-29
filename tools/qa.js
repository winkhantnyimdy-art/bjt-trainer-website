/**
 * BJT Trainer website QA.
 *
 * Drives the local Chrome via puppeteer-core over file:// URLs (no server,
 * no network) and checks, for every viewport in both languages:
 *   - horizontal overflow and any element wider than the viewport
 *   - console errors / warnings / failed requests
 *   - the download state actually declared by js/config.js, including the
 *     published APK's href, filename, `download` attribute and on-disk
 *     integrity (byte size + SHA-256) when the download is enabled
 *   - touch target sizes
 *   - focus visibility and keyboard reachability
 *   - language persistence across a reload
 *   - internal link targets resolve
 *   - no unexpected network requests
 *
 * Usage:
 *   node tools/qa.js <site-root> <chrome-exe> [outDir]
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const puppeteer = require("puppeteer-core");

const siteRoot = process.argv[2] || process.cwd();
const chrome =
  process.argv[3] || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outDir = process.argv[4] || path.join(siteRoot, ".qa");

const url = (rel) => "file:///" + path.join(siteRoot, rel).replace(/\\/g, "/");

/* ---------------------------------------------------------------------------
 * Read js/config.js so the download assertions follow the real configuration
 * instead of hardcoding "coming soon". config.js only assigns to `window`, so
 * it can be evaluated against a throwaway object.
 * ------------------------------------------------------------------------ */
const CONFIG = (() => {
  const src = fs.readFileSync(path.join(siteRoot, "js", "config.js"), "utf8");
  const win = {};
  new Function("window", src)(win);
  return win.BJT_SITE_CONFIG || {};
})();

const DL_URL = (CONFIG.androidDownloadUrl || "").trim();
const DL_READY = CONFIG.downloadAvailable === true && DL_URL.length > 0;
const DL_REMOTE = /^https?:\/\//i.test(DL_URL);
const DL_EXPECT = {
  ready: DL_READY,
  remote: DL_REMOTE,
  url: DL_URL,
  state: DL_READY ? "ready" : "pending",
  fileName: CONFIG.androidFileName || (DL_URL.split("/").pop() || ""),
  sha256: CONFIG.androidFileSha256 || "",
  sizeBytes: CONFIG.androidFileSizeBytes || 0,
  /* When the URL is relative it must resolve to a real file beside the site.
   * When it is absolute (a release asset on another host) there is nothing
   * local to check, so the on-disk hash check is skipped. */
  diskPath: DL_URL && !DL_REMOTE ? path.join(siteRoot, ...DL_URL.split("/")) : "",
};

if (DL_READY && DL_REMOTE && !/^https:\/\//i.test(DL_URL)) {
  warn("-", "js/config.js", "-", `androidDownloadUrl is not https: ${DL_URL}`);
}

const VIEWPORTS = [
  { name: "320", w: 320, h: 720 },
  { name: "375", w: 375, h: 812 },
  { name: "390", w: 390, h: 844 },
  { name: "768", w: 768, h: 1024 },
  { name: "1280", w: 1280, h: 900 },
  { name: "1600", w: 1600, h: 1000 },
];

const PAGES = ["index.html", "privacy.html"];
const LANGS = ["en", "ja"];

const MIN_TAP = 44; // px, comfortable touch target
const findings = [];
const fail = (vp, page, lang, msg) =>
  findings.push({ level: "FAIL", vp, page, lang, msg });
const warn = (vp, page, lang, msg) =>
  findings.push({ level: "WARN", vp, page, lang, msg });

/* A half-finished publish must never look finished. Catch the classic
 * `downloadAvailable: true` with an empty or unfilled URL. */
if (CONFIG.downloadAvailable === true && !DL_URL) {
  fail("-", "js/config.js", "-", "downloadAvailable is true but androidDownloadUrl is empty");
}
if (DL_URL) {
  /* A real URL never contains angle brackets, so their presence means a
   * <owner>/<repo> template was pasted in without being filled in. */
  if (/[<>]/.test(DL_URL)) {
    fail("-", "js/config.js", "-", `androidDownloadUrl is an unfilled template: ${DL_URL}`);
  }
  if (/YOUR-DOMAIN|your-cdn\.example|RELEASE_URL_TO_BE_ADDED|\bexample\b|\bplaceholder\b/i.test(DL_URL)) {
    fail("-", "js/config.js", "-", `androidDownloadUrl contains a placeholder host: ${DL_URL}`);
  }
  /* /OWNER/ or /REPO/ as a literal path segment, in caps as a template is
   * conventionally written. */
  if (/\/(OWNER|REPO|YOUR-ORG)\//.test(DL_URL)) {
    fail("-", "js/config.js", "-", `androidDownloadUrl contains an unfilled path segment: ${DL_URL}`);
  }
}
if (DL_READY && DL_REMOTE && !/^https:\/\//i.test(DL_URL)) {
  warn("-", "js/config.js", "-", `androidDownloadUrl is not https: ${DL_URL}`);
}

/* Injected into every page. Runs in the browser, so every value it needs
   must be passed in as an argument rather than closed over. */
const PROBE = (minTap) => {
  const out = {
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    docScrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    wide: [],
    smallTaps: [],
    links: [],
    lang: document.documentElement.getAttribute("data-lang"),
    htmlLang: document.documentElement.getAttribute("lang"),
    title: document.title,
    dlState: document.documentElement.getAttribute("data-download-state"),
    visibleEn: [...document.querySelectorAll(".i18n__en")].filter(
      (e) => e.offsetParent !== null || e.getClientRects().length
    ).length,
    visibleJa: [...document.querySelectorAll(".i18n__ja")].filter(
      (e) => e.offsetParent !== null || e.getClientRects().length
    ).length,
    downloadBtns: document.querySelectorAll("[data-download-btn]").length,
    disabledBtns: document.querySelectorAll('[data-download-btn][aria-disabled="true"]').length,
    downloadHrefs: [...document.querySelectorAll("[data-download-btn]")].map((b) =>
      b.tagName === "A" ? b.getAttribute("href") : null
    ),
    downloadDetail: [...document.querySelectorAll("[data-download-btn]")].map((b) => ({
      tag: b.tagName,
      href: b.getAttribute("href"),
      download: b.getAttribute("download"),
      rel: b.getAttribute("rel"),
      text: (b.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40),
    })),
    pendingNoteVisible: [...document.querySelectorAll('[data-dl="pending"]')].filter(
      (e) => e.getClientRects().length
    ).length,
    readyNoteVisible: [...document.querySelectorAll('[data-dl="ready"]')].filter(
      (e) => e.getClientRects().length
    ).length,
    /* `null` when the page has no contact block at all (index.html), which is
       a pass. Only pages that ship a placeholder block must hide it. */
    hasContact: Boolean(document.querySelector("[data-contact]")),
    contactHidden: (() => {
      const c = document.querySelector("[data-contact]");
      return c ? c.hasAttribute("hidden") : null;
    })(),
    headOrder: (() => {
      const hs = [...document.querySelectorAll("h1,h2,h3,h4")].filter(
        (h) => h.getClientRects().length
      );
      let skips = 0;
      let prev = 0;
      for (const h of hs) {
        const lvl = Number(h.tagName[1]);
        if (prev && lvl > prev + 1) skips++;
        prev = lvl;
      }
      return { count: hs.length, h1: document.querySelectorAll("h1").length, skips };
    })(),
  };

  const vw = out.clientW;

  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
    // 2px tolerance for sub-pixel rounding
    if (r.right > vw + 2 || r.left < -2) {
      out.wide.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.baseVal !== undefined
          ? el.className.baseVal
          : String(el.className || "")
        ).slice(0, 60),
        left: Math.round(r.left),
        right: Math.round(r.right),
        w: Math.round(r.width),
      });
    }
  }

  for (const el of document.querySelectorAll("a, button, [role='button'], input, summary")) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (el.classList.contains("skip-link")) continue;
    if (el.closest(".phone") || el.closest(".sprite") || el.closest(".mock-tabbar")) continue;
    if (el.classList.contains("mock-wave") || el.classList.contains("mock-audio__play")) continue;
    // WCAG 2.5.8 (target size, minimum) exempts links whose target is
    // "in a sentence or block of text". That exemption only applies to links
    // that actually lay out inline inside running prose. Treating every <a>
    // as exempt would silently skip nav rows, buttons and logos, so both
    // conditions must hold: genuinely inline, and inside prose.
    const inProse = !!el.closest(
      ".prose, .footer__legal, .footer__blurb, .checklist__text, .step__text, .card__text, .about__list, .prose__callout, p, li, figcaption, dd"
    );
    const inline = cs.display === "inline";
    if (el.tagName === "A" && inProse && inline) continue;
    if (r.height < minTap - 1 || r.width < minTap - 1) {
      out.smallTaps.push({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 28),
        cls: String(el.className || "").slice(0, 40),
        w: Math.round(r.width),
        h: Math.round(r.height),
        inline,
      });
    }
  }

  for (const a of document.querySelectorAll("a[href]")) {
    out.links.push({
      href: a.getAttribute("href"),
      text: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
    });
  }

  return out;
};

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    args: ["--no-sandbox", "--allow-file-access-from-files", "--font-render-hinting=none"],
  });

  const report = [];

  for (const page of PAGES) {
    for (const vp of VIEWPORTS) {
      for (const lang of LANGS) {
        const p = await browser.newPage();
        const consoleMsgs = [];
        const netFails = [];
        const external = [];

        p.on("console", (m) => {
          if (["error", "warning"].includes(m.type())) {
            consoleMsgs.push(`${m.type()}: ${m.text()}`);
          }
        });
        p.on("pageerror", (e) => consoleMsgs.push(`pageerror: ${e.message}`));
        p.on("requestfailed", (r) =>
          netFails.push(`${r.url()} :: ${r.failure() && r.failure().errorText}`)
        );
        p.on("request", (r) => {
          if (!r.url().startsWith("file:") && !r.url().startsWith("data:")) {
            external.push(r.url());
          }
        });

        await p.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
        await p.goto(url(page) + (lang === "en" ? "" : "?lang=" + lang), {
          waitUntil: "networkidle0",
        });
        // let fonts settle
        await p.evaluate(() => document.fonts && document.fonts.ready);

        const r = await p.evaluate(PROBE, MIN_TAP);
        const tag = `${page} @${vp.name}px [${lang}]`;

        if (r.overflowX > 0) fail(vp.name, page, lang, `horizontal overflow ${r.overflowX}px (scrollWidth ${r.docScrollW} > ${r.clientW})`);
        if (r.wide.length) {
          fail(vp.name, page, lang, `elements outside viewport: ${JSON.stringify(r.wide.slice(0, 6))}`);
        }
        if (consoleMsgs.length) fail(vp.name, page, lang, `console: ${consoleMsgs.join(" | ")}`);
        if (netFails.length) fail(vp.name, page, lang, `request failed: ${netFails.join(" | ")}`);
        if (external.length) fail(vp.name, page, lang, `EXTERNAL REQUEST (must be offline-capable): ${external.join(", ")}`);

        if (r.lang !== lang) fail(vp.name, page, lang, `data-lang is "${r.lang}"`);
        if (r.htmlLang !== lang) fail(vp.name, page, lang, `<html lang> is "${r.htmlLang}"`);
        if (r.visibleEn > 0 && r.visibleJa > 0)
          fail(vp.name, page, lang, `both languages visible: en=${r.visibleEn} ja=${r.visibleJa}`);
        if (r.lang === "en" && r.visibleEn === 0) fail(vp.name, page, lang, "no English spans visible");
        if (r.lang === "ja" && r.visibleJa === 0) fail(vp.name, page, lang, "no Japanese spans visible");

        // The download state must match what js/config.js declares.
        if (page === "index.html") {
          if (r.dlState !== DL_EXPECT.state)
            fail(vp.name, page, lang, `data-download-state="${r.dlState}" (config declares "${DL_EXPECT.state}")`);
          if (r.downloadBtns === 0) fail(vp.name, page, lang, "no [data-download-btn] found");

          if (DL_EXPECT.ready) {
            for (const d of r.downloadDetail) {
              if (d.tag !== "A")
                fail(vp.name, page, lang, `download CTA is a <${d.tag.toLowerCase()}>, expected a real <a>`);
              if (d.href !== DL_EXPECT.url)
                fail(vp.name, page, lang, `href="${d.href}" (expected "${DL_EXPECT.url}")`);
              if (d.download !== DL_EXPECT.fileName)
                fail(vp.name, page, lang, `download="${d.download}" (expected "${DL_EXPECT.fileName}")`);
              if (!d.rel || !/noopener/.test(d.rel))
                fail(vp.name, page, lang, `rel="${d.rel}" (expected to include noopener)`);
            }
            if (r.pendingNoteVisible > 0)
              fail(vp.name, page, lang, `${r.pendingNoteVisible} "coming soon" element(s) still visible while ready`);
            if (r.readyNoteVisible === 0)
              fail(vp.name, page, lang, "no ready-state note is visible");
          } else {
            if (r.downloadBtns !== r.disabledBtns)
              fail(vp.name, page, lang, `${r.downloadBtns - r.disabledBtns} download button(s) not marked aria-disabled`);
            if (r.downloadHrefs.some((h) => h && /\.apk/i.test(h)))
              fail(vp.name, page, lang, "an APK href is present while download is pending");
            if (r.pendingNoteVisible === 0) fail(vp.name, page, lang, "coming-soon note is not visible");
          }
        }

        if (r.hasContact && r.contactHidden !== true)
          fail(vp.name, page, lang, `contact block is not hidden (placeholder would be visible)`);

        if (r.smallTaps.length) fail(vp.name, page, lang, `touch target < ${MIN_TAP}px: ${JSON.stringify(r.smallTaps.slice(0, 8))}`);

        if (r.headOrder.h1 !== 1) fail(vp.name, page, lang, `expected exactly one h1, found ${r.headOrder.h1}`);
        if (r.headOrder.skips) warn(vp.name, page, lang, `${r.headOrder.skips} heading level skip(s)`);

        report.push({ tag, ...r, title: r.title });

        if (vp.name === "390" || vp.name === "1280") {
          await p.screenshot({
            path: path.join(outDir, `${page.replace(".html", "")}-${vp.name}-${lang}.png`),
            fullPage: vp.name === "390",
          });
        }

        await p.close();
      }
    }
  }

  /* ---- cross-page interaction tests (one viewport each) --------------- */

  const interactions = [];

  // 1. language toggle + persistence across reload
  {
    const p = await browser.newPage();
    await p.setViewport({ width: 390, height: 844 });
    await p.goto(url("index.html"), { waitUntil: "networkidle0" });
    const before = await p.evaluate(() => document.documentElement.getAttribute("data-lang"));
    await p.click('[data-lang-btn="ja"]');
    const after = await p.evaluate(() => ({
      lang: document.documentElement.getAttribute("data-lang"),
      title: document.title,
      url: location.search,
      pressed: document.querySelector('[data-lang-btn="ja"]').getAttribute("aria-pressed"),
      enPressed: document.querySelector('[data-lang-btn="en"]').getAttribute("aria-pressed"),
    }));
    await p.reload({ waitUntil: "networkidle0" });
    const persisted = await p.evaluate(() => ({
      lang: document.documentElement.getAttribute("data-lang"),
      stored: localStorage.getItem("bjt-lang"),
    }));
    interactions.push(["lang toggle en->ja", before, JSON.stringify(after)]);
    interactions.push(["lang persisted after reload", "", JSON.stringify(persisted)]);
    if (after.lang !== "ja") fail("-", "index.html", "en", "toggle did not switch to ja");
    if (after.pressed !== "true" || after.enPressed !== "false")
      fail("-", "index.html", "en", "aria-pressed not updated");
    if (persisted.lang !== "ja" || persisted.stored !== "ja")
      fail("-", "index.html", "en", `language not persisted (${JSON.stringify(persisted)})`);
    if (!after.title.includes("BJT Trainer")) fail("-", "index.html", "en", "title not localised");
    await p.close();
  }

  // 2. mobile menu open / Escape / focus
  {
    const p = await browser.newPage();
    await p.setViewport({ width: 375, height: 812 });
    await p.goto(url("index.html"), { waitUntil: "networkidle0" });
    const toggleVisible = await p.evaluate(
      () => getComputedStyle(document.querySelector("[data-nav-toggle]")).display !== "none"
    );
    if (!toggleVisible) fail("375", "index.html", "en", "menu button not visible at 375px");
    await p.click("[data-nav-toggle]");
    const opened = await p.evaluate(() => ({
      expanded: document.querySelector("[data-nav-toggle]").getAttribute("aria-expanded"),
      open: document.querySelector("[data-nav]").classList.contains("is-open"),
      visible: document.querySelector("[data-nav]").getClientRects().length > 0,
      focus: document.activeElement.textContent.trim().slice(0, 20),
    }));
    await p.keyboard.press("Escape");
    const closed = await p.evaluate(() => ({
      expanded: document.querySelector("[data-nav-toggle]").getAttribute("aria-expanded"),
      visible: document.querySelector("[data-nav]").getClientRects().length > 0,
      focusIsToggle: document.activeElement === document.querySelector("[data-nav-toggle]"),
    }));
    interactions.push(["mobile menu open", "", JSON.stringify(opened)]);
    interactions.push(["Escape closes + restores focus", "", JSON.stringify(closed)]);
    if (opened.expanded !== "true" || !opened.visible)
      fail("375", "index.html", "en", "menu did not open");
    if (closed.expanded !== "false" || closed.visible)
      fail("375", "index.html", "en", "Escape did not close the menu");
    if (!closed.focusIsToggle) fail("375", "index.html", "en", "focus not returned to the menu button");
    await p.close();
  }

  // 3. desktop nav visible, menu button hidden
  {
    const p = await browser.newPage();
    await p.setViewport({ width: 1280, height: 900 });
    await p.goto(url("index.html"), { waitUntil: "networkidle0" });
    const d = await p.evaluate(() => ({
      nav: getComputedStyle(document.querySelector("[data-nav]")).display,
      toggle: getComputedStyle(document.querySelector("[data-nav-toggle]")).display,
      dl: getComputedStyle(document.querySelector(".header__download")).display,
      links: document.querySelectorAll(".nav__list a").length,
    }));
    interactions.push(["desktop nav", "", JSON.stringify(d)]);
    if (d.nav === "none") fail("1280", "index.html", "en", "desktop nav hidden");
    if (d.toggle !== "none") fail("1280", "index.html", "en", "menu button still visible on desktop");
    await p.close();
  }

  // 4. keyboard focus visibility + tab order reaches the CTA
  {
    const p = await browser.newPage();
    await p.setViewport({ width: 1280, height: 900 });
    await p.goto(url("index.html"), { waitUntil: "networkidle0" });
    const seen = [];
    for (let i = 0; i < 22; i++) {
      await p.keyboard.press("Tab");
      const info = await p.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return null;
        const cs = getComputedStyle(a);
        const r = a.getBoundingClientRect();
        return {
          tag: a.tagName.toLowerCase(),
          text: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24),
          outline: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0,
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      });
      if (info) seen.push(info);
    }
    const noOutline = seen.filter((s) => !s.outline);
    interactions.push(["first 22 tab stops", "", JSON.stringify(seen.slice(0, 12))]);
    if (noOutline.length)
      fail("1280", "index.html", "en", `focused elements without a visible focus ring: ${JSON.stringify(noOutline.slice(0, 5))}`);
    const reached = seen.some((s) => /Download for Android/.test(s.text));
    if (!reached) warn("1280", "index.html", "en", "download CTA not reached within 22 tab stops");
    await p.close();
  }

  // 5. disabled download button is focusable and announces why
  {
    const p = await browser.newPage();
    await p.setViewport({ width: 390, height: 844 });
    await p.goto(url("index.html"), { waitUntil: "networkidle0" });
    const d = await p.evaluate(() => {
      const b = document.querySelector("[data-download-btn]");
      b.focus();
      const id = b.getAttribute("aria-describedby");
      const note = id && document.getElementById(id);
      return {
        focused: document.activeElement === b,
        tag: b.tagName,
        ariaDisabled: b.getAttribute("aria-disabled"),
        describedBy: id,
        noteText: note ? note.textContent.replace(/\s+/g, " ").trim() : null,
        noteVisible: note ? note.getClientRects().length > 0 : false,
        tabbable: b.tabIndex >= 0 && !b.disabled,
      };
    });
    interactions.push([DL_READY ? "enabled download link" : "disabled download button", "", JSON.stringify(d)]);
    if (!d.focused || !d.tabbable) fail("390", "index.html", "en", "download control is not keyboard reachable");
    if (DL_READY) {
      /* Enabled: it must be a real, focusable link with no disabled semantics. */
      if (d.tag !== "A") fail("390", "index.html", "en", `download control is a <${d.tag.toLowerCase()}>, expected <a>`);
      if (d.ariaDisabled) fail("390", "index.html", "en", `aria-disabled=${d.ariaDisabled} on an enabled download`);
      if (d.describedBy) fail("390", "index.html", "en", `aria-describedby=${d.describedBy} points at a "coming soon" note`);
    } else {
      /* Disabled: it must stay focusable and explain itself. */
      if (d.ariaDisabled !== "true") fail("390", "index.html", "en", "aria-disabled missing");
      if (!d.noteVisible) fail("390", "index.html", "en", "coming-soon explanation is not visible");
    }
    await p.close();
  }

  // 6. all same-document + cross-page links resolve
  {
    const p = await browser.newPage();
    await p.setViewport({ width: 1280, height: 900 });
    const all = [];
    for (const page of PAGES) {
      await p.goto(url(page), { waitUntil: "networkidle0" });
      const hrefs = await p.evaluate(() =>
        [...document.querySelectorAll("a[href]")]
          .map((a) => a.getAttribute("href"))
          .filter((h) => h && !h.startsWith("http") && !h.startsWith("mailto"))
      );
      for (const h of [...new Set(hrefs)]) all.push([page, h]);
    }

    const fsx = require("fs");
    for (const [page, href] of all) {
      const [rel, hash] = href.split("#");
      const targetRel = rel === "" ? page : rel;
      const abs = path.join(siteRoot, targetRel);
      if (!fsx.existsSync(abs)) {
        fail("-", page, "en", `broken link: ${href}`);
        continue;
      }
      if (hash) {
        const html = fsx.readFileSync(abs, "utf8");
        const idRe = new RegExp(`id="${hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`);
        const nameRe = new RegExp(`<a[^>]+name="${hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`);
        if (!idRe.test(html) && !nameRe.test(html)) {
          fail("-", page, "en", `broken anchor: ${href} (no #${hash} target in ${targetRel})`);
        }
      }
    }
    interactions.push(["links checked", String(all.length), JSON.stringify(all)]);

    // 404 for the .html links
    const statuses = [];
    for (const rel of PAGES) {
      statuses.push([rel, fsx.existsSync(path.join(siteRoot, rel)) ? "exists" : "MISSING"]);
    }
    interactions.push(["page files", "", JSON.stringify(statuses)]);
    await p.close();
  }

  // 7. privacy page -> back to index
  {
    const p = await browser.newPage();
    await p.setViewport({ width: 375, height: 812 });
    await p.goto(url("privacy.html"), { waitUntil: "networkidle0" });
    const back = await p.evaluate(() => {
      const a = document.querySelector(".backlink a");
      return { href: a.getAttribute("href"), text: a.textContent.replace(/\s+/g, " ").trim() };
    });
    await p.click(".backlink a");
    await p.waitForNavigation({ waitUntil: "networkidle0" });
    const landed = p.url();
    interactions.push(["privacy -> index", JSON.stringify(back), landed]);
    // Accept a query string: the language is intentionally carried across the
    // navigation, so `index.html?lang=ja` is the correct destination too.
    if (!/index\.html(\?|$)/.test(landed)) fail("375", "privacy.html", "en", `back link landed on ${landed}`);
    await p.close();
  }

  // 8. phone mockup geometry (must not exceed its slot at any breakpoint)
  {
    const p = await browser.newPage();
    const geo = [];
    for (const vp of VIEWPORTS) {
      await p.setViewport({ width: vp.w, height: vp.h });
      await p.goto(url("index.html"), { waitUntil: "networkidle0" });
      const g = await p.evaluate(() =>
        [...document.querySelectorAll(".phone-slot")].map((s) => {
          const sr = s.getBoundingClientRect();
          const r = s.querySelector(".phone").getBoundingClientRect();
          return {
            slot: [Math.round(sr.width), Math.round(sr.height)],
            phone: [Math.round(r.width), Math.round(r.height)],
            overflowX: Math.round(r.width - sr.width),
            overflowY: Math.round(r.height - sr.height),
          };
        })
      );
      geo.push([vp.name, JSON.stringify(g)]);
      for (const one of g) {
        if (one.overflowX > 1) fail(vp.name, "index.html", "en", `phone overflows its slot horizontally by ${one.overflowX}px`);
        if (one.overflowY > 1) fail(vp.name, "index.html", "en", `phone overflows its slot vertically by ${one.overflowY}px`);
      }
    }
    interactions.push(["phone slot vs phone geometry", "", geo.map((g) => g[0] + ": " + g[1]).join("\n    ")]);
    await p.close();
  }

  // 9. Japanese line breaking / no clipped CJK
  {
    const p = await browser.newPage();
    for (const vp of [{ n: "320", w: 320, h: 720 }, { n: "1280", w: 1280, h: 900 }]) {
      await p.setViewport({ width: vp.w, height: vp.h });
      await p.goto(url("index.html") + "?lang=ja", { waitUntil: "networkidle0" });
      const clipped = await p.evaluate(() => {
        const bad = [];
        for (const el of document.querySelectorAll("h1,h2,h3,p,li,a,span,button,figcaption")) {
          if (!el.getClientRects().length) continue;
          if (el.closest(".sprite") || el.closest(".phone")) continue;
          // Visually-hidden text (clip-path + 1px box) is clipped by design;
          // flagging it would be a false positive, not a layout bug.
          // `.nav-toggle__label` joins this list only below 480px, where the
          // menu button collapses to its icon.
          if (el.closest(".sr-only, .visually-hidden-heading, .nav-toggle__label")) continue;
          // an element taller than the line-height * lines with overflow hidden
          const cs = getComputedStyle(el);
          if (cs.overflow === "hidden" && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
            bad.push((el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40));
          }
        }
        return bad;
      });
      if (clipped.length) fail(vp.n, "index.html", "ja", `clipped text: ${JSON.stringify(clipped.slice(0, 5))}`);
    }
    await p.close();
  }

  await browser.close();

  /* ---- 7. published APK integrity (Node side, no browser) -----------------
     The APK the page publishes must exist locally and its bytes must match the
     integrity facts recorded in js/config.js. Hashing 150+ MB is streamed so
     memory stays flat.

     The APK is untracked in git (153.13 MiB > GitHub's 100 MiB per-object
     limit) and is published as a GitHub Release asset, so the local copy in
     downloads/ is the reference that gets uploaded. Verify it whenever it is
     present, whether or not the download is switched on, so a swapped or
     truncated file is caught before it is ever published. */
  let apk = null;
  {
    const local = DL_EXPECT.diskPath || path.join(siteRoot, "downloads", DL_EXPECT.fileName);
    if (fs.existsSync(local)) {
      const problems = [];
      if (DL_EXPECT.ready && DL_EXPECT.diskPath && local !== DL_EXPECT.diskPath) {
        problems.push(`config URL resolves to ${DL_EXPECT.diskPath} but ${local} was hashed`);
      }
      const stat = fs.statSync(local);
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(local, { highWaterMark: 1 << 20 });
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => {
        const sha = hash.digest("hex").toUpperCase();
        if (DL_EXPECT.sizeBytes && stat.size !== DL_EXPECT.sizeBytes)
          problems.push(`size ${stat.size} bytes != config ${DL_EXPECT.sizeBytes}`);
        if (DL_EXPECT.sha256 && sha !== DL_EXPECT.sha256.toUpperCase())
          problems.push(`SHA-256 ${sha} != config ${DL_EXPECT.sha256.toUpperCase()}`);
        apk = { path: local, name: DL_EXPECT.fileName, bytes: stat.size, sha256: sha, problems };
      });
      stream.on("error", (err) => fail("-", "downloads", "-", `APK unreadable: ${err.message}`));
    } else if (DL_EXPECT.ready && DL_EXPECT.diskPath) {
      fail("-", "downloads", "-", `file not found: ${DL_EXPECT.diskPath}`);
    }
  }

  /* Stream hashing is async, so wait for it to settle before reporting. */
  await new Promise((resolve) => {
    if (apk || !fs.existsSync(DL_EXPECT.diskPath || path.join(siteRoot, "downloads", DL_EXPECT.fileName)))
      return resolve();
    const started = Date.now();
    const poll = () => (apk || Date.now() - started > 120000 ? resolve() : setTimeout(poll, 50));
    poll();
  });
  if (apk) apk.problems.forEach((m) => fail("-", "downloads", "-", `APK ${m}`));

  /* ---- output ---------------------------------------------------------- */

  const out = [];
  out.push("BJT Trainer website QA");
  out.push("=".repeat(72));
  out.push(`site: ${siteRoot}`);
  out.push(`viewports: ${VIEWPORTS.map((v) => v.name).join(", ")}`);
  out.push(`pages: ${PAGES.join(", ")}   languages: ${LANGS.join(", ")}`);
  out.push(`combinations: ${PAGES.length * VIEWPORTS.length * LANGS.length}`);
  out.push(`download state: ${DL_EXPECT.state} (config downloadAvailable=${CONFIG.downloadAvailable})`);
  out.push("");
  if (apk) {
    out.push("PUBLISHED APK");
    out.push("-".repeat(72));
    out.push(`  path:     ${apk.path}`);
    out.push(`  name:     ${apk.name}`);
    out.push(`  bytes:    ${apk.bytes}`);
    out.push(`  sha256:   ${apk.sha256}`);
    out.push(`  integrity: ${apk.problems.length ? "MISMATCH — " + apk.problems.join("; ") : "matches js/config.js"}`);
    out.push("");
  }
  out.push("INTERACTIONS");
  out.push("-".repeat(72));
  for (const [a, b, c] of interactions) out.push(`  ${a}\n    ${b}\n    ${c}`);
  out.push("");
  out.push("FINDINGS");
  out.push("-".repeat(72));
  if (!findings.length) out.push("  none");
  for (const f of findings) out.push(`  [${f.level}] ${f.vp} ${f.page} [${f.lang}] ${f.msg}`);
  out.push("");
  out.push(`RESULT: ${findings.filter((f) => f.level === "FAIL").length} FAIL, ${findings.filter((f) => f.level === "WARN").length} WARN`);

  const text = out.join("\n");
  fs.writeFileSync(path.join(outDir, "qa-report.txt"), text, "utf8");
  process.stdout.write(text + "\n");
  process.exit(findings.some((f) => f.level === "FAIL") ? 1 : 0);
})();
