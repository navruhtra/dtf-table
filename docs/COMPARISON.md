# How DTF Table compares

DTF Table is a prepress step. It writes the files a RIP loads; it does
not drive a printer, and it does not replace a RIP. This page says
what was measured against what, and what was not.

## Measured here

`benchmark/run.mjs` scores every method with the same fixed referee
(docs/BENCHMARK.md). All art numbers are model numbers until the test
targets are printed and measured.

| Against | Kind | Result (baseline, 2026-11-18) |
|---|---|---|
| The PNG sent to the RIP untouched ("as-is") | What a RIP gets without prep | 1,880 to 440,631 semi-transparent pixels per case; full white under every pixel with any alpha. DTF Table: 0. |
| A plain "remove semi-transparency" step ("threshold") | The usual free fix | Fades print as a hard cut (fade error 0.16 to 0.26). DTF Table's halftone: 0.006 to 0.008. |
| rectpack 0.2.2 (MIT), best of 16 algorithms × 7 sort orders per case | Open-source rectangle packer used by gang-sheet builders | Over five orders on a 22 in roll: 429.00 in of film for DTF Table, 430.00 in for rectpack's best. Ties on 3 orders, 1.75 in shorter on one, 0.75 in longer on one. |

## Not measured

- **RIP software** (CADlink Digital Factory, AcroRIP, Maintop, Epson
  Garment Creator and others). These are commercial and mostly
  Windows-only. They make their own white layer and choke. They are not
  run here, so there is no head-to-head number for white control. The
  test targets (docs/TEST-TARGETS.md) print our white and the RIP's
  white on the same sheet so a shop can compare them.
- **Commercial gang-sheet builders.** Not run. The nesting comparison
  uses rectpack because it is open source and can be run by anyone.

## What DTF Table does that a RIP may not

- Fades, glows and shadows become halftone dots before the RIP sees
  them, instead of being cut or printed as a solid.
- Preflight names lines and gaps under 0.5 mm and low resolution at
  print size before the file goes to the RIP.
- Sheets of any length are written in bands, in the browser, with no
  upload.

## What a RIP does that DTF Table does not

- Colour management to the printer's inks (DTF Table has no printer
  profile).
- Driving the printer, ink limits and print modes.
