# Screenshots

Placeholder folder for **real** app captures from a signed Android release.

## Status for Website V1

The "Product preview" section on `index.html` currently uses stylised
HTML/CSS phone mockups, clearly labelled in their captions as illustrations.
They are not screenshots, and they are not presented as real UI. This is
intentional for V1 — the signed release screenshots do not exist yet.

Nothing in this folder is used by the site today.

## The architecture is already in place

The illustration was built so a capture can replace it without touching the
layout:

- Every mockup sits in a `.phone-slot`, which owns the reserved size
  (`--pw: 264px`, `--ph: 572px`) and the responsive scale steps (`--s`).
- A real capture is just an image inside that same slot:

  ```html
  <figure class="preview__item">
    <div class="phone-slot">
      <img class="shot" src="assets/screenshots/study.png" width="264" height="572"
           alt="BJT Trainer study screen showing a multiple-choice question.">
    </div>
    <figcaption class="preview__caption">…</figcaption>
  </figure>
  ```

- `.shot` is already styled: same box, same `--s` scaling, same rounded
  corners. It inherits `--pw`/`--ph`/`--s` from the slot.

Capture at exactly 264 x 572 (or the same aspect ratio, ~0.4615) and the swap
is visually seamless.

## Steps to switch over

1. Drop captures here: `study.png`, `listening.png`, `mock-exam.png`,
   `progress.png`.
2. For each figure, replace the inner `.phone` block with the `<img class="shot">`
   above. Do not change `.phone-slot` or `.preview__item`.
3. Update the caption so it no longer says it is an illustration.
4. Write real `alt` text describing what the screen shows. The current
   illustrations use `role="img"` with descriptive labels; screenshots should
   get equally descriptive `alt` text.
5. Update section 7 of the root `README.md`, which currently describes the
   illustrations as in use.

## A note on honesty

The current app UI is English-only. If the captures are of the real app, the
captions should say so plainly. Do not present the illustrations as real
screenshots, and do not add fake reviews or testimonials.

Prefer WebP or well-compressed PNG — the whole site currently ships in about
200 KB, and real screenshots are the one thing that could undo that.
