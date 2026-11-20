# Changelog

What changed in the DTF Table, in plain words, newest first.
Versions follow semantic versioning; the number lives in src/version.js.

## 0.1.0 (2026-11-20)

First public release. It holds every change since the tool's first
code on 2026-11-18, grouped by the day each change was made (Pacific
time).

[Full release notes](releases/0.1.0.md)

### 2026-11-20

- Own repository: the Separation Table engine is downloaded at a
  pinned commit and checked by SHA-256 (`npm run setup`), with
  NOTICE, THIRD-PARTY-NOTICES.md, a release check and CI

### 2026-11-19

- The page works like the Separation Table: four steps on the left,
  the workspace in the middle, Advanced Settings on the right, Back /
  Next on a phone, Light / Dark / Device, Shop setup and Help
- Framed in an ADN page, the tool shows no second header

### 2026-11-18

- Test targets for a shop to print, press and measure (choke, thin
  lines, halftone fades, wash, and whether the RIP keeps our white)
- The page: drop designs, pick a roll, build the gang sheet, export
- Nesting tries four placement rules and a swap search
- Preflight measures thin lines on the art's soft alpha
- Benchmark: a fixed referee, synthetic test art and a baseline,
  with rectpack as the nesting competitor
- Machine profiles, gang-sheet nesting, the banded sheet writer
  (PNG, TIFF, PDF) and preflight
- Alpha repair and the white layer
