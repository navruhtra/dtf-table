# DTF Table benchmark

The standing record of how DTF Table performs, modelled on the
Separation Table's. Every number below came out of
`benchmark/run.mjs`. All quality numbers are **model only** until a
shop prints the test targets (TEST-TARGETS.md) and the prints are measured.

## Run it

```bash
npm run setup         # pinned libraries and the Separation Table engine
npm run setup:bench   # the nesting competitor: rectpack 0.2.2 in .venv/
npm run benchmark
```

About 8 s on one core. The exit code is 0 when DTF Table is no worse
than `benchmark/baseline.json` on any measure, and 2 when it is (the
tool is deterministic, so there is no tolerance beyond rounding).
`--update` rewrites the baseline: do that only on main, after a merged
change, in its own pull request. `--json <file>` saves the run.

## Parts

- `benchmark/cases.mjs`: the test art, drawn from shapes at 300 dpi with
  a fixed seed, so the truth is known. It has five pieces:
  - **logo**: hard shapes with 1 px anti-aliased rims.
  - **glow**: a disc with a 10 mm glow.
  - **shadow**: a 50 % drop shadow with an 8 mm blur.
  - **fade**: a linear and a radial fade to clear.
  - **lines**: strokes of 0.2, 0.3, 0.4, 0.45, 0.55, 0.6, 0.8 and 1.0 mm,
    horizontal and diagonal.

  It also has five gang-sheet orders for a 22 in roll.
- `benchmark/referee.mjs`: the scoring. It imports nothing from `src/`,
  so a change to the tool cannot change how the tool is judged. Change it
  only in its own pull request, and re-record the baseline after.
- `benchmark/rectpack_strip.py`: the nesting competitor (below).

## Measures

Lower is better unless the measure says otherwise.

| Measure | What it is |
|---|---|
| semi | Pixels with alpha neither 0 nor 255. DTF cannot print them. Target 0. |
| show ±k | White with no colour over it, at the worst shift of the white against the colour up to ±k px (1 px = 0.085 mm at 300 dpi), per 1,000 colour pixels. A white rim shows. |
| bare ±k | Colour with no white under it at the same worst shift, per 1,000 colour pixels. The colour prints thin and holds less powder. |
| fade | Wanted alpha and printed coverage, each averaged over two halftone cells (17 px), mean absolute difference over the art's fade pixels, on a 0 to 1 scale. |
| recall | The share of strokes under 0.5 mm that preflight flags (at least half their pixels). Higher is better. |
| false alarms | Strokes of 0.55 mm or more with a tenth of their pixels flagged. |
| film use | Art area over the film used (22 in × length). Higher is better. |

## Methods compared

- **as-is**: the PNG sent to the RIP untouched. A RIP that makes white
  puts full white under every pixel with any alpha.
- **threshold**: a plain "remove semi-transparency" step. Alpha 128 or
  more prints, white goes under all of it, and there is no choke.
- **dtf-table**: alpha repair (fades become halftone dots) and the white
  layer with a 1 px choke, plus preflight's thin-line check.
- **dtf-table c2**: the same with a 2 px choke.

CADlink Digital Factory, the named competitor for white control, is
Windows-only, commercial software, and is not run here. Comparing
against it needs an install. For nesting the competitor is
**rectpack 0.2.2** (MIT), an open-source rectangle packer. For each case
it gets its best result over all 16 of its algorithms and 7 sort orders,
with rotation on.

## Baseline (2026-11-18)

Art (model only):

| case | method | semi | show ±1 | bare ±1 | show ±2 | bare ±2 | fade | recall | false alarms |
|---|---|---|---|---|---|---|---|---|---|
| logo | as-is | 1880 | 11.87 | 7.36 | 20.87 | 16.37 | — | — | — |
| logo | threshold | 0 | 9.11 | 9.11 | 18.20 | 18.20 | — | — | — |
| logo | dtf-table | 0 | 0.00 | 22.06 | 8.50 | 30.56 | — | — | — |
| logo | dtf-table c2 | 0 | 0.03 | 43.96 | 0.03 | 43.97 | — | — | — |
| glow | as-is | 214848 | 661.70 | 0.00 | 661.70 | 0.00 | 0.1557 | — | — |
| glow | threshold | 0 | 3.28 | 3.28 | 6.55 | 6.55 | 0.1557 | — | — |
| glow | dtf-table | 0 | 7.77 | 148.44 | 42.59 | 183.26 | 0.0075 | — | — |
| glow | dtf-table c2 | 0 | 8.62 | 215.15 | 26.25 | 232.78 | 0.0075 | — | — |
| shadow | as-is | 77341 | 525.41 | 0.00 | 525.41 | 0.00 | 0.1931 | — | — |
| shadow | threshold | 0 | 5.29 | 5.29 | 10.57 | 10.57 | 0.1931 | — | — |
| shadow | dtf-table | 0 | 5.42 | 76.55 | 25.54 | 96.67 | 0.0070 | — | — |
| shadow | dtf-table c2 | 0 | 5.44 | 90.43 | 19.55 | 104.54 | 0.0070 | — | — |
| fade | as-is | 440631 | 1146.69 | 3.64 | 1148.15 | 7.27 | 0.2601 | — | — |
| fade | threshold | 0 | 5.53 | 5.71 | 10.90 | 11.33 | 0.2601 | — | — |
| fade | dtf-table | 0 | 10.81 | 516.19 | 126.57 | 632.31 | 0.0061 | — | — |
| fade | dtf-table c2 | 0 | 13.94 | 776.22 | 58.12 | 822.16 | 0.0061 | — | — |
| lines | as-is | 8694 | 228.89 | 107.10 | 394.79 | 273.01 | — | 0.00 | 0 |
| lines | threshold | 0 | 167.13 | 167.13 | 331.81 | 331.81 | — | 0.00 | 0 |
| lines | dtf-table | 0 | 20.92 | 313.66 | 182.49 | 474.97 | — | 1.00 | 0 |
| lines | dtf-table c2 | 0 | 20.92 | 510.73 | 83.55 | 573.75 | — | 1.00 | 0 |

Nesting, 22 in roll, 0.25 in gap:

| case | pieces | DTF Table length in | film use | rectpack best length in | film use | rectpack's best setting | area bound in |
|---|---|---|---|---|---|---|---|
| tees | 32 | 79.00 | 87.5 % | 79.00 | 87.5 % | MaxRectsBl/area | 69.11 |
| logos | 143 | 57.25 | 79.6 % | 56.50 | 80.6 % | MaxRectsBaf/sside | 45.55 |
| mixed | 58 | 131.00 | 89.6 % | 132.75 | 88.5 % | MaxRectsBl/lside | 117.43 |
| strips | 29 | 64.25 | 85.7 % | 64.25 | 85.7 % | MaxRectsBl/sside | 55.09 |
| random | 40 | 97.50 | 89.3 % | 97.50 | 89.3 % | SkylineBlWm/peri | 87.05 |
| total | 302 | 429.00 | | 430.00 | | | 374.24 |

## What the baseline says

- **Semi-transparent pixels: 0** in every case for dtf-table. as-is
  sends between 1,880 (logo) and 440,631 (fade) of them to the RIP.
- **Fades:** threshold prints a fade as a hard cut (fade error 0.16 to
  0.26). dtf-table's halftone holds it at 0.006 to 0.008, 20 to 43 times
  lower.
- **White at the edges of solid art (logo):** a 1 px choke shows 0 white
  at ±1 px, and a 2 px choke shows 0.03 per 1,000 at ±2 px. threshold
  shows 9 to 18. The cost is colour without white at the edge: 22 to 44
  per 1,000, against 9 to 18 for threshold.
- **The weak spot is white under halftone dots.** A choke shrinks or
  removes the white under small dots, so on fades 516 to 776 per 1,000
  colour pixels have no white at a ±1 px shift. threshold scores lower
  here only because it has no dots: it drops the fade. The right choke
  for dots (none, smaller, or a dot-sized white) is a question for the
  choke test target. A model cannot settle it.
- **Thin lines:** preflight flags all 4 strokes under 0.5 mm, with no
  false alarms on the 0.55 to 1.0 mm strokes. It measures the art's
  soft alpha. It used to measure the repaired art, which
  missed the 0.45 mm stroke (6 whole pixels after repair) and flagged
  the halftone dots in fades as thin lines.
- **Nesting:** with four placement rules, seven orders and a
  200-swap search, DTF Table ties rectpack's best on 3 of 5 orders,
  is 1.75 in shorter on "mixed" and 0.75 in longer on "logos". Over
  all five orders it uses 429.00 in against rectpack's 430.00 in
  (rectpack gets its best of 112 settings per order).
