/**
 * i18n lint for the BJT Trainer website.
 *
 * Checks every .i18n__ja / .i18n__en span in an HTML file:
 *   1. No characters outside the expected scripts (catches stray Arabic,
 *      Cyrillic, Hangul, etc. that render as plausible-looking Latin).
 *   2. Every .i18n__en span has a matching .i18n__ja sibling.
 *   3. No leftover placeholder tokens.
 *
 * Usage: node tools/lint-i18n.js index.html [privacy.html]
 */
const fs = require("fs");

const ALLOWED = [
  [0x0020, 0x007e], // ASCII
  [0x00a0, 0x00ff], // Latin-1 supplement (·, nbsp)
  [0x2010, 0x201f], // hyphens / quotes
  [0x2032, 0x2033],
  [0x3000, 0x303f], // CJK punctuation 、。「」
  [0x3040, 0x309f], // hiragana
  [0x30a0, 0x30ff], // katakana
  [0x4e00, 0x9fff], // CJK ideographs
  [0xff00, 0xffef], // fullwidth forms
];

const PLACEHOLDERS = /CONTACT_EMAIL_TO_BE_ADDED|YOUR-DOMAIN|your-cdn\.example|placeholder|TODO|FIXME|LOREM/i;

/* Latin tokens legitimately used inside Japanese copy. Anything else is a
 * sign of a stray fragment and should be investigated.
 *
 * `APK`, `Google` and `Play` are here because the direct-install note has to
 * name the file format and say plainly that the app is not on Google Play.
 * `apk` (lowercase) appears in the published file name. */
const LATIN_OK = new Set([
  "BJT", "JETRO", "Android", "HTML", "CSS", "JavaScript", "SDK", "Trainer",
  "Study", "Progress", "Practice", "Home", "Settings", "Mock", "Exam",
  "Cookie", "Cookies", "No", "of", "span", "data", "config", "version", "u",
  "i18n", "en", "ja", "class", "div", "a", "span", "strong", "p", "id", "href",
  "aria", "pressed", "true", "false", "lang", "btn", "NOT", "MIR", "API",
  "ID", "VOICEVOX", "APK", "apk", "SHA", "Google", "Play",
]);

function latinWords(s) {
  return (s.match(/[A-Za-z]{2,}/g) || []).filter((w) => !LATIN_OK.has(w));
}

function allowed(cp) {
  return ALLOWED.some(([lo, hi]) => cp >= lo && cp <= hi);
}

function describe(cp) {
  return "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
}

let problems = 0;

for (const file of process.argv.slice(2)) {
  const txt = fs.readFileSync(file, "utf8");

  const spans = [];
  // Class order is not fixed: an element may carry extra utility classes
  // alongside the language class, e.g. class="nav-toggle__label i18n__ja".
  const re = /<(\w+)[^>]*class="[^"]*\bi18n__(en|ja)\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(txt))) {
    spans.push({ lang: m[2], text: m[3] });
  }

  // 1. script + stray-latin check
  spans.forEach((s, i) => {
    const bad = [];
    for (const ch of s.text) {
      const cp = ch.codePointAt(0);
      if (!allowed(cp)) {
        bad.push(`${ch} (${describe(cp)})`);
      }
    }
    // Japanese copy should not contain untranslated English fragments.
    if (s.lang === "ja") {
      const words = latinWords(s.text);
      if (words.length) {
        bad.push(`stray latin: ${words.join(", ")}`);
      }
    }
    if (bad.length) {
      problems++;
      console.log(
        `${file} [${s.lang} #${i + 1}] ${bad.join("; ")}\n    ${s.text.replace(/\s+/g, " ").trim().slice(0, 200)}`
      );
    }
  });

  // 2. language pairing
  const en = spans.filter((s) => s.lang === "en").map((s) => s.text.replace(/\s+/g, " ").trim());
  const ja = spans.filter((s) => s.lang === "ja").map((s) => s.text.replace(/\s+/g, " ").trim());
  if (en.length !== ja.length) {
    problems++;
    console.log(`${file} MISMATCH: ${en.length} en spans vs ${ja.length} ja spans`);
  } else {
    for (let i = 0; i < en.length; i++) {
      if (!en[i] || !ja[i]) {
        problems++;
        console.log(`${file} EMPTY span pair at #${i + 1}: en=${JSON.stringify(en[i])} ja=${JSON.stringify(ja[i])}`);
      }
    }
  }

  // 3. placeholders (HTML comments are stripped first: deploy-time markers
  //    such as YOUR-DOMAIN are intentionally left in the source as comments)
  const ph = txt.replace(/<!--[\s\S]*?-->/g, "").match(PLACEHOLDERS);
  if (ph) {
    problems++;
    console.log(`${file} PLACEHOLDER present: ${[...new Set(ph)].join(", ")}`);
  }

  console.log(`${file}: ${en.length} en / ${ja.length} ja string pairs`);
}

console.log(problems ? `\nFAIL — ${problems} problem(s)` : "\nOK — i18n lint passed");
process.exit(problems ? 1 : 0);
