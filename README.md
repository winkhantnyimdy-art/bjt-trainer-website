# BJT Trainer — website

Static, bilingual (English / 日本語) marketing site for **BJT Trainer 1.0.0**, the
offline Business Japanese study app for Android.

No framework, no compile step, no backend, no dependencies, no analytics, no
external requests. Every page works from `file://` as well as from a static
host. The live site is **https://bjt-trainer.netlify.app**.

---

## 1. Run it locally

Double-click `index.html`, or from PowerShell:

```powershell
Start-Process "C:\Users\jpas\Downloads\BJT-Trainer-Website\index.html"
```

To preview over HTTP instead (closer to how it will be deployed):

```powershell
cd C:\Users\jpas\Downloads\BJT-Trainer-Website
python -m http.server 8000
# then open http://localhost:8000
```

`file://` is fully supported, so a server is optional.

---

## 2. File structure

```
index.html              Landing page (hero, features, practice, previews,
                        privacy, about, download CTA, footer)
privacy.html            Privacy policy
css/styles.css          All styling. Design tokens at the top.
js/config.js            Product facts + the download switch.  <-- edit this
js/app.js               Language toggle, mobile menu, scroll spy, download logic
assets/site.webmanifest PWA-style manifest
assets/icons/           Icon sources and generated PNGs
assets/screenshots/     Optional real app screenshots (see section 7)
netlify.toml            Netlify build config: strips dev files from the publish
                        directory so the repo root can stay the site root
downloads/
  BJT-Trainer-1.0.0.apk The signed Android 1.0.0 release build. Untracked on
                        purpose - see section 4 for the 100 MiB Git limit
tools/lint-i18n.js      Bilingual pair + stray-Latin linter
tools/make-icons.js     Regenerates the PNG icons from icon.svg
tools/qa.js             Headless-Chrome layout / a11y / link QA
tools/visual-inspect.js Visual QA: 7 viewports x 2 pages x 2 languages, plus
                        WCAG AA text-contrast measurement
```

`tools/` is development-only. Nothing in it ships to visitors, and the site
works if you delete the whole folder.

---

## 3. English / 日本語

Both languages are always present in the HTML as paired spans:

```html
<span class="i18n__en">Features</span><span class="i18n__ja">機能</span>
```

CSS shows one set based on `<html data-lang="en|ja">`, which `js/app.js` manages.
There is no runtime string table and no per-language page to keep in sync.

- The choice is stored in `localStorage` under `bjt-lang`.
- The URL carries it too: `index.html?lang=ja` opens Japanese directly, which
  makes a language-specific link shareable.
- **English is the default** for a first-time visitor on every machine. The
  browser's language is deliberately *not* used to auto-switch — a Japanese
  device must not silently change the page before anyone has chosen anything.
- With JavaScript disabled the page renders in English, fully readable.

To edit copy, find the `i18n__en` span and change the matching `i18n__ja`
span next to it. Then run the linter:

```powershell
node tools\lint-i18n.js index.html privacy.html
```

It reports unpaired spans, and flags stray untranslated English left in
Japanese copy.

---

## 4. Publishing the APK

The signed Android 1.0.0 release build is **published** as a GitHub Release
asset and is what the live download button serves.

```
downloads/BJT-Trainer-1.0.0.apk
160,574,584 bytes  (153.13 MiB)
SHA-256  E0D54B13C0D03D162774BE088FC92537B98B50BED277992E7CD8E4A890052D07
package  com.bjttrainer.app   versionName 1.0.0   versionCode 1
min SDK 28   target SDK 36
signature APK Signature Scheme v2, CN=BJT Trainer Release, O=BJT Trainer, C=JP
```

### Why the APK is not in git

`downloads/` is listed in `.gitignore`. GitHub **hard-blocks any git object
larger than 100 MiB**, and this APK is 153.13 MiB. Committing it would make
this repository impossible to push to GitHub at all — Pages included — so the
APK is published as a **GitHub Release asset** instead. Assets are attachments
rather than git objects and are capped at 2 GB.

A local copy is kept in `downloads/` purely as the verified reference that gets
uploaded. `tools/qa.js` re-hashes it on every run so a swapped or truncated
file is caught before publication.

### The download switch

The download is **live**. `js/config.js` currently holds:

```js
downloadAvailable: true,
androidDownloadUrl:
  "https://github.com/winkhantnyimdy-art/bjt-trainer-website/releases/download/v1.0.0/BJT-Trainer-1.0.0.apk",
```

To publish a future build, create the Release first, then update only
`androidDownloadUrl` (and the size/SHA-256 fields in section "Replacing the
APK"). Never point it at a `<owner>`/`<repo>` template.

`js/app.js` then sets `data-download-state="ready"` on `<html>`, which swaps
every `data-dl="pending"` element for its `data-dl="ready"` twin — the
"Android download coming soon" notes, the "Coming soon" status pill, the
pending release paragraph, and the installation note are all replaced by the
real copy — and turns each `<button data-download-btn>` into a real
`<a href download>` carrying the same classes, label, and filename. No HTML
edit is needed.

Leave the buttons as `<button data-download-btn aria-disabled="true">` in
the HTML. Do not hand-write download links, and never put a local path such
as `C:\...` in the config.

If either half of the switch is missing, the page stays in the safe disabled
state, so a half-finished publish can never ship a broken download button.
`tools/qa.js` fails the run if `downloadAvailable` is `true` with an empty URL,
or if the URL still contains a `<owner>`/`<repo>` template or a placeholder
host.

### Taking the download back offline

Set `downloadAvailable: false` and `androidDownloadUrl: ""`. Every
`data-dl="ready"` element hides and its pending twin takes over, and each
`<a href download>` reverts to a disabled
`<button data-download-btn aria-disabled="true">` paired with its note via
`aria-describedby` so screen readers explain *why* it does nothing.

### Never commit signing material

Only the **already-signed** APK may be published. The keystore,
`key.properties` and any other signing material belong to the Android
repository and must never be copied into this one, committed, or uploaded.

### Replacing the APK

If a future build replaces this one, update `androidFileName`,
`androidFileSizeBytes`, `androidFileSizeLabel` and `androidFileSha256`
together, then re-run QA. The tool re-hashes `downloads/<fileName>` and
requires the size and SHA-256 to match, so a mismatched pair fails loudly.

```powershell
node tools\qa.js "<site-root>" "<chrome-exe>" "<out-dir>"
```

### Contact address

`js/config.js` also holds `contactEmail`, currently the placeholder
`CONTACT_EMAIL_TO_BE_ADDED`. Until you replace it with a real address,
`js/app.js` keeps the contact block on `privacy.html` **hidden**, so
visitors never see the placeholder token.

---

## 5. Deploying

The live site is **https://bjt-trainer.netlify.app**, deployed from this
repository's `master` branch. Any static host still works, but only Netlify
reads `netlify.toml`, so use that when deploying elsewhere.

### `netlify.toml` — what actually gets published

The site is plain static files, so there is nothing to compile. `netlify.toml`
exists purely so the repository root can stay the site root while
development-only files are still never served:

```toml
[build]
  command = "rm -rf tools assets/screenshots README.md .nojekyll .netlifyignore .gitattributes .gitignore netlify.toml"
  publish = "."
```

`netlify.toml` takes precedence over the equivalent settings in the Netlify
UI, so a Git push produces the same publish set with no dashboard
configuration. `.netlifyignore` covers manual/CLI folder deploys as a second
layer. `.nojekyll` is only meaningful for GitHub Pages, which is not used.
`assets/screenshots/` is referenced by comments only, so removing it is safe.

To add a new development-only file, add it to the `rm -rf` list **and** to
`.netlifyignore`. To add a new public asset, do neither.

### Metadata

`canonical`, `og:url` and `og:image` are set to absolute production URLs in
both `index.html` and `privacy.html`, because most crawlers require absolute
URLs and a relative canonical such as `href="index.html"` resolves to
`/index.html` rather than `/`. A relative canonical was deliberately avoided.
If the site ever moves domains, update the origin in both files together.

---

## 6. Accessibility and performance notes

- Semantic landmarks, one `<h1>` per page, no heading-level skips.
- Skip-to-content link; the mobile menu manages focus, supports `Escape`, and
  restores focus to the button that opened it.
- All interactive targets are at least 44 x 44 px, including nav rows and the
  language toggle. The footer and desktop nav rows are padded to reach this
  even when the label is short.
- Colour contrast meets WCAG AA on the navy/red palette.
- `prefers-reduced-motion` disables transitions and smooth scrolling.
- Phone mockups are `role="img"` with descriptive labels; decorative SVGs are
  `aria-hidden`.
- No web fonts, no autoplaying video, no animation libraries, and no
  third-party requests — the whole site is a few hundred KB.

---

## 7. Adding real screenshots

`assets/screenshots/` is an empty, git-ignored-ready folder for real captures
once the app is public.

The phone mockups in "Product preview" are **stylised HTML/CSS illustrations**,
labelled as such in their captions. They are not screenshots, and they are
deliberately not presented as real UI — the current app UI is English-only.

To swap in real screenshots: drop PNGs into `assets/screenshots/`, then
replace the corresponding `.phone` block in `index.html` with an `<img>` inside
the existing `figure`/`figcaption`, and keep the same aspect ratio so the
layout does not shift. Update the caption to stop calling it an illustration.

---

## 8. Dev tools

These need Node and, for QA and icon generation, `puppeteer-core`. They are
optional.

```powershell
# bilingual / stray-Latin lint (no dependencies)
node tools\lint-i18n.js index.html privacy.html

# regenerate PNG icons from assets\icons\icon.svg
node tools\make-icons.js

# layout + a11y + link QA across 6 viewports x 2 pages x 2 languages
node tools\qa.js "C:\Users\jpas\Downloads\BJT-Trainer-Website" "C:\Program Files\Google\Chrome\Application\chrome.exe" "C:\Users\jpas\Downloads\BJT-Trainer-Website\.qa"

# visual QA at the 7 target viewports, with contrast and Japanese line metrics
node tools\visual-inspect.js "C:\Users\jpas\Downloads\BJT-Trainer-Website" "C:\Program Files\Google\Chrome\Application\chrome.exe" "C:\Users\jpas\Downloads\BJT-Trainer-Website\.qa"
```

`qa.js` writes screenshots to the output directory and exits non-zero on any
failure. Current status: **0 failures** across all 24 combinations, covering
horizontal overflow, touch-target size, heading order, language switching,
the mobile menu, and every internal link.

`visual-inspect.js` covers 7 viewports (1920x1080, 1440x900, 1366x768, 390x844,
375x812, 360x800, 320x568) x 2 pages x 2 languages = 28 combinations. It
reports hero and mockup geometry, the open mobile menu, section rhythm, footer
link rows, the download state, accessibility basics, Japanese line-height and
one/two-character line ends, and a WCAG AA contrast measurement of every
distinct text style. Write its output outside the repository — it is QA output,
not site content.

`puppeteer-core` is not vendored into this project. If it is not resolvable,
install it somewhere and point `NODE_PATH` at it:

```powershell
$env:NODE_PATH = "C:\path\to\node_modules"
```

---

## 9. Brand

The palette is taken from the BJT Trainer Android app icon:

| Token         | Value     | Use                        |
| ------------- | --------- | -------------------------- |
| `--navy-700`  | `#1E3A5F` | brand navy, primary button |
| `--red-500`   | `#D23434` | accent, current state      |

`assets/icons/icon.svg` is a simplified web interpretation of the app icon. No
third-party or trademarked logos are used anywhere on the site.
