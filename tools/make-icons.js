/**
 * Rasterises assets/icons/icon.svg into the PNG sizes the web manifest,
 * Apple touch icon and Open Graph card need.
 *
 * Rendering happens in the local Chrome via puppeteer-core, so there is no
 * image toolchain to install and no network dependency beyond npm install
 * of puppeteer-core itself.
 *
 * Usage (from a scratch directory, NOT from the site root):
 *   npm install puppeteer-core
 *   node tools/make-icons.js <site-root> <chrome-exe>
 */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const siteRoot = process.argv[2] || process.cwd();
const chrome = process.argv[3] || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const svg = fs.readFileSync(path.join(siteRoot, "assets", "icons", "icon.svg"), "utf8");

const targets = [
  { file: "favicon-32.png", size: 32, og: false },
  { file: "favicon-192.png", size: 192, og: false },
  { file: "favicon-512.png", size: 512, og: false },
  { file: "apple-touch-icon.png", size: 180, og: false },
  { file: "icon-512.png", size: 512, og: false },
  // Open Graph card: brand tile on a light background.
  { file: "og-image.png", size: 1200, og: true },
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    args: ["--no-sandbox", "--force-device-scale-factor=1"],
  });

  for (const t of targets) {
    const page = await browser.newPage();

    let markup;
    if (t.og) {
      markup = `<!doctype html><meta charset="utf-8">
        <style>
          html,body{margin:0;padding:0;background:#ffffff;}
          body{width:1200px;height:630px;display:flex;align-items:center;
               font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
          .wrap{display:flex;align-items:center;gap:56px;padding:0 80px;}
          .tile{width:220px;height:220px;flex:none;}
          .tile svg{width:100%;height:100%;display:block;border-radius:20%;
                    box-shadow:0 18px 48px rgba(16,26,38,.18);}
          h1{margin:0 0 18px;font-size:64px;line-height:1.1;font-weight:800;
             letter-spacing:-.02em;color:#101a26;}
          p{margin:0;font-size:32px;line-height:1.35;color:#5c6878;max-width:15em;}
        </style>
        <div class="wrap">
          <div class="tile">${svg}</div>
          <div><h1>BJT Trainer</h1>
          <p>Business Japanese practice, wherever you are.</p></div>
        </div>`;
    } else {
      markup = `<!doctype html><meta charset="utf-8">
        <style>html,body{margin:0;padding:0;background:transparent;}
        svg{display:block;width:${t.size}px;height:${t.size}px;}</style>${svg}`;
    }

    await page.setViewport({ width: t.size, height: t.og ? 630 : t.size, deviceScaleFactor: 1 });
    await page.setContent(markup, { waitUntil: "load" });
    const out = path.join(siteRoot, "assets", "icons", t.file);
    await page.screenshot({ path: out, omitBackground: !t.og });
    await page.close();
    const bytes = fs.statSync(out).size;
    console.log(`${t.file.padEnd(22)} ${t.size}px  ${(bytes / 1024).toFixed(1)} KB`);
  }

  await browser.close();
})();
