# DTF test targets: what to print and what to measure

Every quality number DTF Table reports today is a model. This sheet
turns the model into measurements on one shop's printer, ink, powder
and press, and answers four questions:

1. How much choke does the white need so no white rim shows?
2. What is the thinnest line, gap and dot that survive print, powder,
   cure, press and wash?
3. Which halftone settings print a fade cleanly?
4. Does the shop's RIP use the white we send, or make its own?

## Make the files

```bash
npm run setup
node scripts/test-targets.mjs <folder>          # 22 in roll; --width 13 or 24 for other rolls
```

The script writes these files:

| File | What |
|---|---|
| `dtf-targets.png` | Colour layer, 22 × 18.35 in at 300 dpi, transparent background, no semi-transparent pixels |
| `dtf-targets-white.png` | White layer, gray, 255 = full white |
| `dtf-targets.pdf` | Colour layer as a PDF at size |
| `key.json` | Every patch id and what it tests |

The sheet is about 18.35 in long on any roll width. Narrower rolls
(`--width 13`) cut the right side of each row. Use 22 or 24 in if the
shop has it.

## Print it twice

The same sheet, on the same film, powder and press settings:

- **Run 1, our white:** load `dtf-targets.png` and
  `dtf-targets-white.png` and tell the RIP to use the white file as
  the white channel. If the RIP cannot take a white file, write that
  down; it answers question 4.
- **Run 2, the RIP's white:** load `dtf-targets.png` alone and let the
  RIP make white with its usual settings (write them down: choke,
  white percentage, "white under black" on or off).

Press each run on:
- a black 100 % cotton tee
- a white 100 % cotton tee
- if possible, a dark polyester tee

Keep one of each unwashed.

**Write down:** printer, RIP and version, ink, film, powder, cure
(temperature, time), press (temperature, time, pressure, peel hot or
cold), and the date.

## What to measure

Use a loupe (10× or more) or a phone macro photo with a millimetre
ruler in the shot. Photograph every patch group and name the photo
by its id (A1, B3 …).

### A1 to A5: white choke 0 to 4 px (0 to 0.34 mm)

Each row has the same six ink squares (red, royal, black, yellow,
green, grey), a red ring, four blue bars and small type, with the
white choked by a different amount.

| Row | Choke | White rim visible on the black tee? (none / some / clear) | Colour edge washed out on the black tee? (none / some / clear) | Small type 2 mm readable? |
|---|---|---|---|---|
| A1 | 0 px | | | |
| A2 | 1 px | | | |
| A3 | 2 px | | | |
| A4 | 3 px | | | |
| A5 | 4 px | | | |

**Result:** the smallest choke with no rim becomes the default for
this machine profile (`whiteLayer` `chokePx`). If every row shows a
rim, the printer's white misregisters by more than 0.34 mm. Write it
down; DTF Table then needs larger chokes.

### B1 to B4: thinnest line, gap, dot and hole

Sizes left to right: 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50, 0.60,
0.80 and 1.00 mm. At 300 dpi one pixel is 0.085 mm, so 0.10 and
0.15 mm are 1 to 2 pixels and are the art's own limit.

| Group | What | Smallest that survives press | Smallest that survives 10 washes |
|---|---|---|---|
| B1 | Black lines, vertical and horizontal | | |
| B2 | Gaps cut in royal (do they stay open?) | | |
| B3 | White dots on royal | | |
| B4 | Holes in royal (do they stay open?) | | |

**Result:** this sets preflight's limit (`minFeatureMm`, today 0.5 mm
from the product plan). If lines hold at 0.3 mm, the warning moves
down; if they break at 0.5 mm, it moves up.

### C1 to C9: halftone fades

Rows give 25, 35 and 45 LPI, each with a smallest dot of 5, 10 and
15 %. Each row has red steps from 0 to 100 % in tens and a continuous
blue fade.

| Row | LPI | Smallest dot | First step with whole dots | Steps that plug (go solid) or flake after press | Blue fade smooth, or bands? |
|---|---|---|---|---|---|
| C1 | 25 | 5 % | | | |
| C2 | 25 | 10 % | | | |
| C3 | 25 | 15 % | | | |
| C4 | 35 | 5 % | | | |
| C5 | 35 | 10 % | | | |
| C6 | 35 | 15 % | | | |
| C7 | 45 | 5 % | | | |
| C8 | 45 | 10 % | | | |
| C9 | 45 | 15 % | | | |

**Result:** this sets alpha repair's defaults (`lpi`, `minDot`, today
35 LPI and 10 %, unmeasured). It also answers the benchmark's open
question: whether halftone dots need their white choked at all.

### D1 to D8: wash

D1 to D6 are solids in red, royal, black, yellow, green and grey. D7
is white alone. D8 is a star of 0.3 mm spokes.

Wash the pressed tees inside out, warm (40 °C), tumble dry low.
Photograph after 5, 10 and 25 washes.

| Patch | Cracking (none / fine / heavy) | Edges lifting? | Colour change (none / slight / clear) |
|---|---|---|---|
| D1 to D6 | | | |
| D7 | | | |
| D8: spokes lost? | | | |

### Question 4: the RIP and our white

Compare run 1 and run 2 on the black tee.

- [ ] The RIP accepted `dtf-targets-white.png` as the white channel
- [ ] Run 1's white follows the chokes per row (A1 to A5 differ); if
      they all look the same, the RIP replaced our white
- [ ] Run 2's white, with the RIP's own settings, shows a rim on: ___

## What comes back

The photos, the filled tables above and the settings list. Results go
into `docs/BENCHMARK.md` as measured numbers next to the model numbers, and
into the default machine profile values. They are labelled with the
shop's printer and RIP, because another machine may differ.
