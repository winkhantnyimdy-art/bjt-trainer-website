/*!
 * BJT Trainer — website configuration
 * ===================================
 *
 * THIS IS THE ONLY FILE YOU NEED TO EDIT to change product/release facts
 * on the public website. Both pages (index.html and privacy.html) read
 * from `window.BJT_SITE_CONFIG`.
 *
 * ---------------------------------------------------------------------------
 * HOW THE ANDROID DOWNLOAD WORKS
 * ---------------------------------------------------------------------------
 *
 * The signed Android 1.0.0 release APK is published as a GitHub Release
 * asset (see the download block below), and `androidDownloadUrl` points at
 * that absolute https URL.
 *
 * js/app.js watches `downloadAvailable` and `androidDownloadUrl` and, when
 * `downloadAvailable` is true with a non-empty URL, it:
 *   - sets data-download-state="ready" on <html>, which swaps every
 *     `data-dl="pending"` element for its `data-dl="ready"` twin (the
 *     "coming soon" notes and status pill become the real ones), and
 *   - replaces each disabled <button data-download-btn> with a real
 *     <a href download> carrying the same classes, label and `download`
 *     attribute, so the page needs no markup edit.
 *
 * If either half of the switch is missing the page stays in the safe disabled
 * state, so a half-finished publish can never ship a broken download button.
 *
 * Leave the buttons as <button data-download-btn aria-disabled="true"> in
 * the HTML. Do not hand-write download links.
 *
 * Notes
 * -----
 * - Use an absolute https URL for a release asset. A relative path would
 *   resolve against the site host, which does not serve the APK.
 * - Do NOT put a local Windows file path (e.g. C:\...) in this file.
 * - Never commit the keystore, key.properties or any signing material. Only
 *   the already-signed APK may be published.
* - The APK is deliberately untracked in git (see .gitignore): at 147.24 MiB
   *   it exceeds GitHub's 100 MiB hard per-object limit and would make the
   *   repository impossible to push.
 * - The site works from the file:// protocol, so config is plain JavaScript
 *   rather than JSON (fetch() of a local JSON file is blocked by CORS).
 * ---------------------------------------------------------------------------
 */

window.BJT_SITE_CONFIG = {
  /* ---------------------------------------------------------------- product */
  appName: "BJT Trainer",
  version: "1.0.0",
  platform: "Android",
  androidPackageId: "com.bjttrainer.app",
  androidMinVersion: "Android 9.0 (API 28) or later",
  studyQuestionCount: 196,

  /* ---------------------------------------------------------------- download
   * >>> THESE TWO LINES CONTROL THE PUBLIC DOWNLOAD <<<
   *
   * The signed Android 1.0.0 release APK is published as a GitHub Release
   * asset:
   *   https://github.com/winkhantnyimdy-art/bjt-trainer-website/releases/tag/v1.0.0
   *
   * The APK is 154,375,447 bytes = 147.24 MiB. GitHub hard-blocks any git
   * object over 100 MiB, so it is NOT tracked in this repository; release
   * assets are attachments capped at 2 GB. A local copy is kept in
   * `downloads/` as the verified reference and is re-hashed by tools/qa.js.
   *
   * The URL below was verified by downloading the published asset back and
   * confirming it is byte-identical to the approved build.
   *
   * To take the download offline, set:
   *     downloadAvailable: false,
   *     androidDownloadUrl: "",
   */
  downloadAvailable: true,
  androidDownloadUrl:
    "https://github.com/winkhantnyimdy-art/bjt-trainer-website/releases/download/v1.0.0/BJT-Trainer-1.0.0.apk",

  /* Name of the published file. Used for the `download` attribute so the file
   * keeps this name regardless of the URL or any cache-busting query. */
  androidFileName: "BJT-Trainer-1.0.0.apk",

  /* Integrity facts for the published file, shown on the download card so a
   * visitor can confirm they received exactly the approved build.
   * Verified against the asset downloaded back from the public release URL. */
  androidFileSizeBytes: 154375447,
  androidFileSizeLabel: "147.2 MB",
  androidFileSha256:
    "222F2650444A64910D3AD42A422035D86EAD4C23C8F7ADF42865A4F01BF020F6",

  /* Name of the published file. Used for the `download` attribute so the file
   * keeps this name regardless of the URL or any cache-busting query. */
  androidFileName: "BJT-Trainer-1.0.0.apk",

  /* Integrity facts for the published file, shown on the download card so a
   * visitor can confirm they received exactly the approved build.
   * These describe the GitHub Release asset and must never be changed to
   * match a different build without re-verifying the signature. */
  androidFileSizeBytes: 154375447,
  androidFileSizeLabel: "147.2 MB",
  androidFileSha256:
    "222F2650444A64910D3AD42A422035D86EAD4C23C8F7ADF42865A4F01BF020F6",

  /* Label shown on the download button once the download is available. */
  downloadLabel: {
    en: "Download for Android",
    ja: "Android 版をダウンロード",
  },

  /* ------------------------------------------------------------------ contact
   * A support address is required before public distribution. Until one is
   * set, the contact block is hidden entirely by js/app.js — visitors never
   * see the placeholder token below.
   * Replace with a real address, e.g. "support@example.com".
   */
  contactEmail: "CONTACT_EMAIL_TO_BE_ADDED",

  /* Optional: a link to a public source repository or support page. */
  supportUrl: "",

  /* -------------------------------------------------------------------- meta */
  /* Relative path to the social preview image. Some crawlers require an
   * absolute URL, so make this absolute at deploy time — see README.md. */
  ogImage: "assets/icons/og-image.png",

  /* Privacy policy "last updated" label, per language. */
  privacyLastUpdated: {
    en: "September 2026",
    ja: "2026年9月",
  },
};
