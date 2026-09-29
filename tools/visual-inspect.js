/* BJT Trainer website — visual inspection harness (dev-only, not shipped).
 *
 * Measures the things a screenshot would show, so findings are numbers rather
 * than impressions: overflow, target sizes, line counts, orphan lines,
 * element heights, section boundaries, first-viewport content, and Japanese
 * line-height / card-height behaviour.
 *
 * Usage: node tools\visual-inspect.js <siteRoot> <chromePath> <outDir>
 */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const site = process.argv[2];
const chrome = process.argv[3];
const out = process.argv[4];

const VIEWPORTS = [
  { name: "1920x1080", w: 1920, h: 1080, kind: "desktop" },
  { name: "1440x900", w: 1440, h: 900, kind: "desktop" },
  { name: "1366x768", w: 1366, h: 768, kind: "desktop" },
  { name: "390x844", w: 390, h: 844, kind: "mobile" },
  { name: "375x812", w: 375, h: 812, kind: "mobile" },
  { name: "360x800", w: 360, h: 800, kind: "mobile" },
  { name: "320x568", w: 320, h: 568, kind: "mobile" },
];
const PAGES = ["index.html", "privacy.html"];
const LANGS = ["en", "ja"];

const url = (p, lang) =>
  `file:///${site.replace(/\\/g, "/")}/${p}` + (lang === "ja" ? "?lang=ja" : "");

/* ---- in-page probe -------------------------------------------------------
   Runs in the browser, so it takes everything it needs as arguments.
   -------------------------------------------------------------------------- */
function probe() {
  const r = (el) => (el ? el.getBoundingClientRect() : null);
  const vis = (el) => el && el.getClientRects().length > 0;
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const box = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return {
      x: Math.round(b.left),
      y: Math.round(b.top),
      w: Math.round(b.width),
      h: Math.round(b.height),
      right: Math.round(b.right),
      bottom: Math.round(b.bottom),
    };
  };

  const lang = document.documentElement.getAttribute("data-lang") || "en";
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  /* --- overflow ------------------------------------------------------- */
  const offenders = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest(".sprite")) continue;
    const b = el.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    const s = getComputedStyle(el);
    if (s.position === "fixed") continue;
    if (b.right > vw + 1 || b.left < -1) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || "").slice(0, 40),
        left: Math.round(b.left),
        right: Math.round(b.right),
        w: Math.round(b.width),
      });
    }
  }

  /* --- horizontal scrollability --------------------------------------- */
  const scrollW = document.documentElement.scrollWidth;
  const bodyScrollW = document.body.scrollWidth;

  /* --- touch targets (all interactive, WCAG 2.5.8) --------------------- */
  const small = [];
  for (const el of document.querySelectorAll("a, button, [role='button'], input, select, summary")) {
    if (!vis(el)) continue;
    const b = el.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    if (el.closest(".sprite")) continue;
    const s = getComputedStyle(el);
    const inProse = !!el.closest(
      ".prose, .footer__legal, .footer__blurb, .checklist__text, .step__text, .card__text, .about__list, .prose__callout, p, li, figcaption, dd"
    );
    const inline = s.display === "inline";
    if (el.tagName === "A" && inProse && inline) continue;
    if (b.width < 43 || b.height < 43) {
      small.push({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 26),
        cls: String(el.className || "").slice(0, 32),
        w: Math.round(b.width),
        h: Math.round(b.height),
        inline,
      });
    }
  }

  /* --- text that is visually cut off ----------------------------------- */
  const clipped = [];
  for (const el of document.querySelectorAll("h1,h2,h3,h4,p,li,a,span,button,figcaption,dt,dd,label")) {
    if (!vis(el)) continue;
    if (el.closest(".sprite") || el.closest(".phone")) continue;
    if (el.closest(".sr-only, .visually-hidden-heading")) continue;
    if (el.closest(".nav-toggle__label") && window.innerWidth < 480) continue;
    const s = getComputedStyle(el);
    if (s.overflow === "hidden" && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
      clipped.push({
        text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 34),
        cls: String(el.className || "").slice(0, 30),
        sh: el.scrollHeight,
        ch: el.clientHeight,
      });
    }
  }

  /* --- overlapping siblings inside flex/grid rows ---------------------- */
  const overlaps = [];
  const containers = document.querySelectorAll(
    ".header__bar, .header__actions, .footer__bottom, .footer__top, .hero__actions, .hero__facts, .download__id, .lang, .nav__panel-actions"
  );
  for (const c of containers) {
    const kids = [...c.children].filter((k) => vis(k) && !k.classList.contains("sr-only"));
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect();
        const b = kids[j].getBoundingClientRect();
        if (a.width === 0 || b.width === 0) continue;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 1 && oy > 1) {
          overlaps.push({
            container: String(c.className || "").slice(0, 30),
            a: (kids[i].textContent || "").replace(/\s+/g, " ").trim().slice(0, 18),
            b: (kids[j].textContent || "").replace(/\s+/g, " ").trim().slice(0, 18),
            ox: Math.round(ox),
            oy: Math.round(oy),
          });
        }
      }
    }
  }

  /* --- header anatomy --------------------------------------------------- */
  const header = {
    bar: box(document.querySelector(".header__bar")),
    mark: box(document.querySelector(".brand__mark")),
    markPx: (() => {
      const m = document.querySelector(".brand__mark");
      return m ? Math.round(parseFloat(getComputedStyle(m).width)) : null;
    })(),
    wordmarkVisible: vis(document.querySelector(".brand__name")),
    navVisible: vis(document.querySelector(".site-nav")),
    navDisplay: (() => {
      const n = document.querySelector(".site-nav");
      return n ? getComputedStyle(n).display : null;
    })(),
    toggleDisplay: (() => {
      const t = document.querySelector(".nav-toggle");
      return t ? getComputedStyle(t).display : null;
    })(),
    toggleBox: box(document.querySelector(".nav-toggle")),
    headerDlDisplay: (() => {
      const d = document.querySelector(".header__download");
      return d ? getComputedStyle(d).display : null;
    })(),
    langButtons: [...document.querySelectorAll(".lang__btn")].map((b) => ({
      text: b.textContent.trim().slice(0, 8),
      pressed: b.getAttribute("aria-pressed"),
      box: box(b),
    })),
    /* free horizontal room in the header row */
    freeSpace: (() => {
      const acts = document.querySelector(".header__actions");
      const brand = document.querySelector(".brand");
      if (!acts || !brand) return null;
      return Math.round(document.documentElement.clientWidth - acts.getBoundingClientRect().right);
    })(),
  };

  /* --- hero ------------------------------------------------------------- */
  const heroSec = document.querySelector(".hero");
  const h1 = document.querySelector("h1");
  const lead = document.querySelector(".hero__lead");
  const heroPhone = document.querySelector(".hero .phone-slot, .hero .phone");
  const nextSec = document.querySelector("main > section + section");
  const hero = {
    section: box(heroSec),
    h1Box: box(h1),
    h1Lines: h1 ? Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight)) : null,
    h1FontSize: h1 ? getComputedStyle(h1).fontSize : null,
    h1Text: h1 ? (h1.innerText || "").replace(/\s+/g, " ").trim() : null,
    leadBox: box(lead),
    leadChars: lead ? (lead.innerText || "").replace(/\s+/g, " ").trim().length : null,
    leadLines: lead
      ? Math.round(lead.getBoundingClientRect().height / parseFloat(getComputedStyle(lead).lineHeight))
      : null,
    leadChPerLine: lead
      ? Math.round(
          (lead.innerText || "").replace(/\s+/g, " ").trim().length /
            Math.max(1, Math.round(lead.getBoundingClientRect().height / parseFloat(getComputedStyle(lead).lineHeight)))
        )
      : null,
    phoneBox: box(heroPhone),
    phoneAspect: heroPhone
      ? (() => {
          const b = heroPhone.getBoundingClientRect();
          return b.height ? +(b.width / b.height).toFixed(3) : null;
        })()
      : null,
    /* how much of the next section is visible in the first viewport */
    nextSectionTop: nextSec ? Math.round(nextSec.getBoundingClientRect().top) : null,
    nextSectionVisiblePx: nextSec
      ? Math.max(0, Math.round(vh - Math.max(0, nextSec.getBoundingClientRect().top)))
      : null,
    nextSectionName: nextSec ? (nextSec.id || nextSec.className) : null,
  };

  /* --- phone mockups ----------------------------------------------------- */
  const phones = [...document.querySelectorAll(".phone-slot, .phone")].map((slot) => {
    const inner = slot.classList.contains("phone") ? slot : slot.querySelector(".phone");
    const sb = slot.getBoundingClientRect();
    const ib = inner ? inner.getBoundingClientRect() : null;
    return {
      caption: (() => {
        const f = slot.closest("figure") || slot.parentElement;
        const cap = f && f.querySelector("figcaption");
        return cap ? (cap.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40) : null;
      })(),
      slot: box(slot),
      phone: ib ? box(inner) : null,
      aspect: ib ? +(ib.width / ib.height).toFixed(3) : null,
      overflowX: ib ? Math.round(Math.max(0, sb.right - ib.right) + Math.max(0, ib.left - sb.left)) : null,
      overflowY: ib ? Math.round(Math.max(0, sb.bottom - ib.bottom) + Math.max(0, ib.top - sb.top)) : null,
    };
  });

  /* --- Japanese typography ------------------------------------------------ */
  const cjk = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9faf\uff66-\uff9f]/;
  const typo = { minLead: null, minPara: null, orphans: [], tallCards: [] };

    /* Measure the real last line box using a Range.

       Two corrections matter here:
       1. Measure only the VISIBLE language span. Both languages live in the
          DOM, so measuring the parent double-counts every line.
       2. Chrome can emit identical rects more than once; dedupe before
          merging into lines, or the line count doubles and the "last line"
          is a phantom. */
    function lastLineWidth(el) {
      const span = el.querySelector(".i18n__ja") || el;
      if (!span.getClientRects().length) return null;
      const rng = document.createRange();
      rng.selectNodeContents(span);
      const raw = [...rng.getClientRects()].filter((r) => r.width > 0.5);
      const seen = new Set();
      const rects = raw.filter((r) => {
        const k = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (!rects.length) return null;
      const lines = [];
      for (const r of rects) {
        const last = lines[lines.length - 1];
        if (last && Math.abs(r.top - last.top) < Math.max(2, r.height * 0.4)) {
          last.left = Math.min(last.left, r.left);
          last.right = Math.max(last.right, r.right);
        } else {
          lines.push({ left: r.left, right: r.right, top: r.top });
        }
      }
      const l = lines[lines.length - 1];
      return { lines: lines.length, width: l.right - l.left };
    }
  const paraEls = [...document.querySelectorAll("p, .card__text, .checklist__text, .step__text, .hero__lead, li")];
  for (const el of paraEls) {
    if (!vis(el)) continue;
    const s = getComputedStyle(el);
    const lh = parseFloat(s.lineHeight);
    const fs = parseFloat(s.fontSize);
    if (!lh || !fs) continue;
    const ratio = lh / fs;
    const txt = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (!cjk.test(txt)) continue;
    if (el.classList.contains("hero__lead") || el.matches(".prose p, .card__text, .checklist__text, .step__text")) {
      if (typo.minLead === null || ratio < typo.minLead.ratio) {
        typo.minLead = { ratio: +ratio.toFixed(2), cls: String(el.className || "p").slice(0, 24), px: `${fs}/${lh}` };
      }
      if (typo.minPara === null || ratio < typo.minPara.ratio) {
        typo.minPara = { ratio: +ratio.toFixed(2), cls: String(el.className || "p").slice(0, 24), px: `${fs}/${lh}` };
      }
    }
    /* Orphan: the final rendered line box is narrower than ~2 characters, which
       for Japanese means a stranded 1-character last line. */
    const ll = lastLineWidth(el);
    if (ll && ll.lines > 1) {
      const perChar = fs;
      if (ll.width < perChar * 2.2) {
        typo.orphans.push({
          cls: String(el.className || "p").slice(0, 24),
          lines: ll.lines,
          lastLinePx: Math.round(ll.width),
          charsInLastLine: Math.round(ll.width / perChar),
        });
      }
    }
  }
  for (const c of document.querySelectorAll(".card, .checklist__item, .step, .download")) {
    if (!vis(c)) continue;
    typo.tallCards.push({
      cls: String(c.className || "").split(" ")[0],
      h: Math.round(c.getBoundingClientRect().height),
      w: Math.round(c.getBoundingClientRect().width),
    });
  }
  typo.tallCards.sort((a, b) => b.h - a.h);

  /* --- section rhythm ----------------------------------------------------- */
  const sections = [...document.querySelectorAll("main > section, main > div.shell > section, .site-footer")].map(
    (s) => {
      const b = s.getBoundingClientRect();
      const head = s.querySelector("h2, h1");
      return {
        id: s.id || String(s.className || "").split(" ")[0],
        heading: head ? (head.innerText || "").replace(/\s+/g, " ").trim().slice(0, 30) : null,
        top: Math.round(b.top + window.scrollY),
        h: Math.round(b.height),
        padTop: getComputedStyle(s).paddingTop,
        padBottom: getComputedStyle(s).paddingBottom,
      };
    }
  );
  for (let i = 1; i < sections.length; i++) {
    sections[i].gapFromPrev = sections[i].top - (sections[i - 1].top + sections[i - 1].h);
  }

  /* --- footer -------------------------------------------------------------- */
  const fLinks = [...document.querySelectorAll(".footer__nav a, .footer__legal a")].map((a) => {
    const b = a.getBoundingClientRect();
    return {
      text: (a.innerText || a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 22),
      w: Math.round(b.width),
      h: Math.round(b.height),
      y: Math.round(b.top),
      x: Math.round(b.left),
    };
  });
  const footer = {
    links: fLinks,
    rows: new Set(fLinks.map((f) => f.y)).size,
    /* links sharing a row at the same x-band risk looking crowded */
    sameRow: (() => {
      const byRow = {};
      for (const f of fLinks) (byRow[f.y] = byRow[f.y] || []).push(f);
      return Object.values(byRow).map((row) => row.length);
    })(),
  };

  /* --- download state ------------------------------------------------------ */
  const dlBtns = [...document.querySelectorAll("[data-download-btn]")].map((b) => ({
    tag: b.tagName,
    text: (b.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40),
    ariaDisabled: b.getAttribute("aria-disabled"),
    href: b.getAttribute("href"),
    download: b.getAttribute("download"),
    describedBy: b.getAttribute("aria-describedby"),
    box: box(b),
  }));
  const dlNotes = [...document.querySelectorAll("[data-dl]")].map((n) => ({
    state: n.getAttribute("data-dl"),
    visible: vis(n),
    text: (n.innerText || "").replace(/\s+/g, " ").trim().slice(0, 46),
  }));
  const dl = {
    rootState: document.documentElement.getAttribute("data-download-state"),
    buttons: dlBtns,
    notes: dlNotes,
    apkLinks: [...document.querySelectorAll('a[href*=".apk"]')].length,
  };

  /* --- headings / landmarks / a11y ------------------------------------------ */
  const heads = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter((h) => h.getClientRects().length);
  const a11y = {
    h1Count: document.querySelectorAll("h1").length,
    headingOrder: heads.map((h) => Number(h.tagName[1])),
    skips: (() => {
      let s = 0;
      let prev = 0;
      for (const h of heads) {
        const l = Number(h.tagName[1]);
        if (prev && l > prev + 1) s++;
        prev = l;
      }
      return s;
    })(),
    landmarks: {
      header: document.querySelectorAll("header").length,
      nav: document.querySelectorAll("nav").length,
      main: document.querySelectorAll("main").length,
      footer: document.querySelectorAll("footer").length,
    },
    imagesMissingAlt: [...document.querySelectorAll("img")].filter(
      (i) => !i.hasAttribute("alt")
    ).length,
    imgCount: document.querySelectorAll("img").length,
    buttonsWithoutName: [...document.querySelectorAll("button")].filter(
      (b) => !((b.innerText || "").trim() || b.getAttribute("aria-label") || b.getAttribute("title"))
    ).length,
    linksWithoutName: [...document.querySelectorAll("a")].filter(
      (a) => !((a.innerText || a.textContent || "").trim() || a.getAttribute("aria-label"))
    ).length,
    langAttr: document.documentElement.getAttribute("lang"),
    title: document.title,
    skipLink: !!document.querySelector(".skip-link"),
    liveRegion: !!document.querySelector('[aria-live]'),
  };

  /* --- text contrast (WCAG 1.4.3 / 1.4.11) ---------------------------------
     Geometry checks cannot see white text sitting on a white card, so measure
     every distinct text style against its real composited background: walk
     ancestors until an opaque background colour is found, then blend any
     translucent foreground into it. Gradient-only layers are approximated by
     the opaque colour underneath, which is the conservative case for light
     text on a dark panel. */
  const srgb = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = (c) => 0.2126 * srgb(c[0]) + 0.7152 * srgb(c[1]) + 0.0722 * srgb(c[2]);
  const ratio = (a, b) => {
    const hi = Math.max(lum(a), lum(b));
    const lo = Math.min(lum(a), lum(b));
    return (hi + 0.05) / (lo + 0.05);
  };
  const readColor = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((v) => parseFloat(v));
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n.nodeType === 1) {
      const c = readColor(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.85) return c.rgb;
      n = n.parentElement;
    }
    return [255, 255, 255];
  };
  const contrast = [];
  {
    const seenStyles = new Set();
    const textEls = document.querySelectorAll(
      "p, li, h1, h2, h3, h4, a, button, span, figcaption, dt, dd, label, strong, em, small"
    );
    for (const el of textEls) {
      if (!vis(el)) continue;
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join("")
        .trim();
      if (own.length < 2) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none") continue;
      if (parseFloat(s.opacity) < 0.2) continue;
      const bg = bgOf(el);
      const fg = readColor(s.color);
      if (!fg) continue;
      const key = (el.className || "") + "|" + s.color + "|" + bg.join(",") + "|" + s.fontSize + "|" + s.fontWeight;
      if (seenStyles.has(key)) continue;
      seenStyles.add(key);
      const blended = fg.a < 1
        ? fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a))
        : fg.rgb;
      const fs = parseFloat(s.fontSize);
      const bold = parseInt(s.fontWeight, 10) >= 700;
      const large = fs >= 24 || (bold && fs >= 18.66);
      const r = ratio(blended, bg);
      contrast.push({
        sel: String(el.className || el.tagName).slice(0, 30),
        sample: own.slice(0, 18),
        fontPx: fs,
        large,
        color: s.color,
        bg: "rgb(" + bg.map(Math.round).join(",") + ")",
        ratio: Math.round(r * 100) / 100,
        need: large ? 3 : 4.5,
        pass: r >= (large ? 3 : 4.5),
      });
    }
  }
  const contrastFails = contrast.filter((c) => !c.pass);

  return {
    lang,
    vw,
    vh,
    scrollW,
    bodyScrollW,
    docHeight: document.documentElement.scrollHeight,
    overflowPx: Math.max(0, scrollW - vw),
    offenders: offenders.slice(0, 12),
    smallTargets: small,
    clipped,
    overlaps,
    header,
    hero,
    phones,
    typo,
    sections,
    footer,
    dl,
    a11y,
    contrastStyles: contrast.length,
    contrastFails,
  };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    args: ["--allow-file-access-from-files", "--hide-scrollbars", "--force-device-scale-factor=1"],
  });

  const results = [];
  const consoleErrors = [];
  const netFailures = [];

  for (const vp of VIEWPORTS) {
    for (const page of PAGES) {
      for (const lang of LANGS) {
        const p = await browser.newPage();
        await p.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
        p.on("pageerror", (e) => consoleErrors.push(`${vp.name} ${page} ${lang} pageerror: ${e}`));
        p.on("console", (m) => {
          if (m.type() === "error" || m.type() === "warning") {
            consoleErrors.push(`${vp.name} ${page} ${lang} console.${m.type()}: ${m.text()}`);
          }
        });
        p.on("requestfailed", (r) => netFailures.push(`${vp.name} ${page} ${lang} ${r.url()} ${r.failure()?.errorText}`));
        await p.goto(url(page, lang), { waitUntil: "networkidle0" });

        const data = await p.evaluate(probe);
        results.push({ vp: vp.name, kind: vp.kind, page, ...data });

        /* screenshots for the requested set only */
        const wantShot =
          (vp.w === 1440 && lang === "en" && page === "index.html") ||
          (vp.w === 1440 && lang === "ja" && page === "index.html") ||
          (vp.w === 390 && page === "index.html") ||
          (vp.w === 375 && lang === "en" && page === "index.html") ||
          (vp.w === 320 && lang === "ja" && page === "index.html");
        if (wantShot) {
          await p.screenshot({ path: path.join(out, `${vp.name}-${lang}-${page.replace(".html", "")}.png`) });
        }
        await p.close();
      }
    }
  }

  /* --- mobile menu open-state geometry ---------------------------------- */
  const menuStates = [];
  for (const vp of VIEWPORTS.filter((v) => v.kind === "mobile")) {
    for (const lang of LANGS) {
      const p = await browser.newPage();
      await p.setViewport({ width: vp.w, height: vp.h });
      await p.goto(url("index.html", lang), { waitUntil: "networkidle0" });
      await p.click(".nav-toggle");
      await new Promise((r) => setTimeout(r, 120));
      const m = await p.evaluate(() => {
        const nav = document.querySelector(".site-nav");
        const nb = nav.getBoundingClientRect();
        const vw = window.innerWidth;
        const links = [...nav.querySelectorAll("a, button")].map((a) => {
          const b = a.getBoundingClientRect();
          return {
            text: (a.innerText || a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 20),
            w: Math.round(b.width),
            h: Math.round(b.height),
            x: Math.round(b.left),
          };
        });
        return {
          open: nav.classList.contains("is-open"),
          expanded: document.querySelector(".nav-toggle").getAttribute("aria-expanded"),
          navBox: { x: Math.round(nb.left), w: Math.round(nb.width), y: Math.round(nb.top), h: Math.round(nb.height) },
          navRight: Math.round(nb.right),
          vw,
          escapesRight: Math.round(Math.max(0, nb.right - vw)),
          links,
          smallLinks: links.filter((l) => l.w < 43 || l.h < 43),
        };
      });
      /* Escape should close it */
      await p.keyboard.press("Escape");
      await new Promise((r) => setTimeout(r, 100));
      m.closesOnEscape = await p.evaluate(() => ({
        open: document.querySelector(".site-nav").classList.contains("is-open"),
        expanded: document.querySelector(".nav-toggle").getAttribute("aria-expanded"),
      }));
      menuStates.push({ vp: vp.name, lang, ...m });
      await p.close();
    }
  }

  await browser.close();

  const report = { results, menuStates, consoleErrors, netFailures };
  fs.writeFileSync(path.join(out, "visual-report.json"), JSON.stringify(report, null, 1));

  /* ---- console summary --------------------------------------------------- */
  const L = (s = "") => console.log(s);
  L("BJT Trainer — visual inspection");
  L("=".repeat(78));
  L(`combinations: ${results.length}   screenshots: ${path.join(out, "*.png")}`);
  L("");

  L("HORIZONTAL OVERFLOW / SMALL TARGETS / CLIPPING / OVERLAP");
  L("-".repeat(78));
  let bad = 0;
  for (const r of results) {
    const issues = [];
    if (r.overflowPx > 0) issues.push(`overflow ${r.overflowPx}px`);
    if (r.smallTargets.length) issues.push(`small targets ${r.smallTargets.length}: ${JSON.stringify(r.smallTargets.slice(0, 4))}`);
    if (r.clipped.length) issues.push(`clipped: ${JSON.stringify(r.clipped.slice(0, 3))}`);
    if (r.overlaps.length) issues.push(`overlaps: ${JSON.stringify(r.overlaps.slice(0, 3))}`);
    if (issues.length) {
      bad++;
      L(`  [ISSUE] ${r.vp} ${r.page} [${r.lang}]`);
      for (const i of issues) L(`      ${i}`);
    }
  }
  if (!bad) L("  none — all 28 combinations clean");

  L("");
  L("HERO (first-viewport content + mockup size)");
  L("-".repeat(78));
  L("  vp        lang  h1ln  phone(w x h)   nextSecTop  visiblePx  leadLines  leadChars");
  for (const r of results.filter((x) => x.page === "index.html")) {
    const h = r.hero;
    L(
      `  ${r.vp.padEnd(9)} ${r.lang.padEnd(4)} ${String(h.h1Lines).padStart(4)}  ` +
        `${String(h.phoneBox ? h.phoneBox.w : "-").padStart(5)}x${String(h.phoneBox ? h.phoneBox.h : "-").padEnd(5)} ` +
        `${String(h.nextSectionTop).padStart(9)} ${String(h.nextSectionVisiblePx).padStart(10)} ` +
        `${String(h.leadLines).padStart(9)} ${String(h.leadChars).padStart(10)}`
    );
  }

  L("");
  L("MOBILE MENU (open state)");
  L("-".repeat(78));
  for (const m of menuStates) {
    L(
      `  ${m.vp.padEnd(9)} ${m.lang}  open=${m.open} expanded=${m.expanded} ` +
        `navW=${m.navBox.w} escapesRight=${m.escapesRight} smallLinks=${m.smallLinks.length} ` +
        `escapeCloses=${m.closesOnEscape.open === false && m.closesOnEscape.expanded === "false"}`
    );
  }

  L("");
  L("JAPANESE TYPOGRAPHY (line-height ratio, height/lh; 1.0 = cramped)");
  L("-".repeat(78));
  for (const r of results.filter((x) => x.lang === "ja" && x.page === "index.html")) {
    L(
      `  ${r.vp.padEnd(9)} heroLead=${r.typo.minLead ? r.typo.minLead.ratio + " (" + r.typo.minLead.px + ")" : "-"}` +
        `  body=${r.typo.minPara ? r.typo.minPara.ratio + " (" + r.typo.minPara.px + ")" : "-"}` +
        `  orphans=${r.typo.orphans.length}` +
        `  tallestCard=${r.typo.tallCards.length ? r.typo.tallCards[0].h + "px" : "-"}`
    );
    if (r.typo.orphans.length) {
      for (const o of r.typo.orphans.slice(0, 5)) L(`      orphan: ${JSON.stringify(o)}`);
    }
  }

  L("");
  L("HEADER ANATOMY");
  L("-".repeat(78));
  for (const r of results.filter((x) => x.page === "index.html")) {
    const h = r.header;
    L(
      `  ${r.vp.padEnd(9)} ${r.lang}  mark=${h.markPx}px wordmark=${h.wordmarkVisible ? "yes" : "hidden"} ` +
        `nav=${h.navDisplay} toggle=${h.toggleDisplay} headerDl=${h.headerDlDisplay} freeSpace=${h.freeSpace}px`
    );
  }

  L("");
  L("DOWNLOAD STATE");
  L("-".repeat(78));
  const uniqDl = new Map();
  for (const r of results) uniqDl.set(`${r.page}|${r.lang}`, r.dl);
  for (const [k, d] of uniqDl) {
    L(`  ${k}`);
    L(`      rootState=${d.rootState}  apkLinks=${d.apkLinks}  buttons=${d.buttons.length}`);
    for (const b of d.buttons) {
      L(`      ${b.tag} "${b.text}" aria-disabled=${b.ariaDisabled} href=${b.href || "-"} describedBy=${b.describedBy || "-"}`);
    }
    for (const n of d.notes) L(`      [${n.state}] visible=${n.visible} "${n.text}"`);
  }

  L("");
  L("A11Y SUMMARY (distinct values across all combinations)");
  L("-".repeat(78));
  const a = results.map((r) => r.a11y);
  const uniq = (f) => [...new Set(a.map(f).map((v) => JSON.stringify(v)))].map((v) => v).join(" | ");
  L(`  h1Count:            ${uniq((x) => x.h1Count)}`);
  L(`  heading skips:      ${uniq((x) => x.skips)}`);
  L(`  landmarks:          ${uniq((x) => x.landmarks)}`);
  L(`  imgs missing alt:   ${uniq((x) => x.imagesMissingAlt)}`);
  L(`  buttons no name:    ${uniq((x) => x.buttonsWithoutName)}`);
  L(`  links no name:      ${uniq((x) => x.linksWithoutName)}`);
  L(`  lang attr:          ${uniq((x) => x.langAttr)}`);
  L(`  skip link:          ${uniq((x) => x.skipLink)}`);
  L(`  live region:        ${uniq((x) => x.liveRegion)}`);
  L(`  titles (en):        ${results.filter((r) => r.lang === "en").map((r) => r.a11y.title)[0]}`);
  L(`  titles (ja):        ${results.filter((r) => r.lang === "ja").map((r) => r.a11y.title)[0]}`);

  L("");
  L("TEXT CONTRAST (WCAG AA: 4.5:1 normal, 3:1 large)");
  L("-".repeat(78));
  {
    const allFails = results.flatMap((r) =>
      r.contrastFails.map((c) => ({ ...c, where: `${r.vp} ${r.lang} ${r.page}` }))
    );
    const totalStyles = results.reduce((n, r) => n + r.contrastStyles, 0);
    L(`  ${totalStyles} distinct text styles measured, ${allFails.length} below AA`);
    const byKey = new Map();
    for (const f of allFails) {
      const k = `${f.sel}|${f.color}|${f.bg}|${f.ratio}`;
      if (!byKey.has(k)) byKey.set(k, { ...f, where: [] });
      byKey.get(k).where.push(f.where);
    }
    for (const f of byKey.values()) {
      L(
        `  ${String(f.ratio).padStart(6)}:1 (need ${f.need}, ${f.large ? "large" : "normal"} ${f.fontPx}px) ` +
          `.${f.sel} "${f.sample}" ${f.color} on ${f.bg}  x${f.where.length}`
      );
    }
  }

  L("");
  L("SECTION RHYTHM (index.html, en, 1440x900)");
  L("-".repeat(78));
  for (const s of results.find((r) => r.vp === "1440x900" && r.lang === "en" && r.page === "index.html").sections) {
    L(`  ${String(s.id).padEnd(22)} h=${String(s.h).padStart(5)} pad=${s.padTop}/${s.padBottom} gapFromPrev=${s.gapFromPrev ?? "-"}  ${s.heading || ""}`);
  }

  L("");
  L("FOOTER (link rows per viewport, index.html en)");
  L("-".repeat(78));
  for (const r of results.filter((x) => x.page === "index.html" && x.lang === "en")) {
    L(`  ${r.vp.padEnd(9)} links=${r.footer.links.length} rows=${r.footer.rows} perRow=[${r.footer.sameRow.join(",")}] small=${r.footer.links.filter((f) => f.w < 43 || f.h < 43).length}`);
  }

  L("");
  L("CONSOLE ERRORS / WARNINGS");
  L("-".repeat(78));
  L(consoleErrors.length ? consoleErrors.join("\n") : "  none");
  L("");
  L("FAILED REQUESTS");
  L("-".repeat(78));
  L(netFailures.length ? netFailures.join("\n") : "  none");
  L("");
  L(`Full detail: ${path.join(out, "visual-report.json")}`);
})();
