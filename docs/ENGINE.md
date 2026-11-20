# How DTF Table works

DTF Table prepares art for a direct-to-film RIP. Every step is a pure
function with no DOM, in `src/`, so the page, the tests and the
benchmark run the same code.

| Step | File | Method |
|---|---|---|
| Alpha repair | `src/alpha.js` | DTF film cannot print a half-clear pixel. Soft bands up to 2 × `edgePx` + 1 px wide are edges and are cut at `cut`; wider soft areas are fades and become halftone dots (round, area-exact, the Separation Table's dot functions), so they print as fades. Under the smallest dot, whole smallest dots scatter over the cells; over the largest dot, whole smallest holes. After repair no pixel is half clear. |
| White layer | `src/white.js` | White under the colour, choked by `chokePx` with the Separation Table's adaptive choke, so a small misregistration shows no white rim. Lines the choke would erase keep their white. Optional spread (a white outline), density, `by-colour` white (less white under dark colours, from the Separation Table's base rule), knockouts (colours within ΔE00 `matchDE` of a listed colour are removed, so the shirt shows) and colours printed with no white. |
| Machine profiles | `src/machines.js` | A 13, 22 or 24 in roll, or a custom width, longest print, file resolution and how the RIP takes white. The shape (`adn.machine/1`) is shared with the DTG Table. Saved in the browser. |
| Nesting | `src/nest.js` | Designs and copies packed onto the roll width: four placement rules, seven orders and a 200-swap search, turning a piece where that saves film, splitting onto more sheets past the longest print. |
| Gang sheets | `src/sheet.js` | Written in bands of rows, so a 22 × 100 in sheet at 300 dpi (about 800 MB as one image) never sits in memory whole. PNG, TIFF or PDF at size, plus a separate white file. Deflate comes from `node:zlib` (`src/node.js`) or fflate in the browser (`src/browser.js`). |
| Preflight | `src/preflight.js` | Under 300 ppi at print size (under 150 is an error), too large for the roll, lines and gaps under 0.5 mm (the Separation Table's thin-line measure, `thinWidths`, on the art's soft alpha), and the semi-transparent pixels alpha repair will fix. |

## The Separation Table engine

The colour maths (CIELAB, CIEDE2000), the halftone dot functions, the
choke and the thin-line measure come from the
[Separation Table](https://github.com/navruhtra/separation-table)
engine (MIT, American Dream Network). It is not copied into this
repository: `npm run setup` downloads the files below from its public
repository at the commit pinned in `scripts/vendor-pins.mjs`, into
`src/vendor/separation-table/`, and checks each against
`src/vendor.sha256`.

| File | Used for |
|---|---|
| `engine.js` | `rgb2lab`, `hex2rgb`, `de2000`, `baseFraction`, `minFilter`, `adaptiveChoke`, `screenAxes`, `shapeDot`, `dotOn`, `bayerCell`, `scatterHoles`, `SCATTER_FLOOR` |
| `checks.js` | `thinWidths` (preflight). It imports `plan.js`, `pipeline.js`, `sizes.js` and `version.js`, which are downloaded with it. |
| `vendor/quickhull.js` | Imported by `engine.js`. Built here from quickhull3d 3.1.2 with esbuild, as the Separation Table builds it. |
| `bench.css` | The page's stylesheet: DTF Table keeps the Separation Table's layout, ids and class names. `src/page.css` holds only what bench.css has no rule for. |

`node scripts/release.mjs check --engine <separation-table>/src`
checks that every name above is in a local Separation Table with the
same code as the pinned copy.

## Alpha repair options

| Option | Default | Meaning |
|---|---|---|
| `mode` | `halftone` | `halftone` screens fades; `threshold` cuts everything |
| `edgePx` | 1 | soft bands up to 2 × this + 1 px wide are edges, cut; wider is a fade |
| `cut` | 128 | an edge pixel prints when its alpha is at least this |
| `floor` | 8 | alpha under this is clear everywhere |
| `dpi`, `lpi`, `angle` | 300, 35, 22.5 | the halftone for fades |
| `minDot`, `maxDot` | 0.1, 0.9 | smallest dot and largest dot before solid |
| `x0`, `y0` | 0 | where this tile sits in a larger sheet |

## White layer options

| Option | Default | Meaning |
|---|---|---|
| `chokePx` | 1 | pull the white in this many px from the colour's edge |
| `spreadPx` | 0 | grow the white this many px past the colour |
| `density` | 1 | white amount, 0 to 1 |
| `mode` | `full` | `by-colour` puts less white under dark colours |
| `minWhite` | 0.5 | least white in `by-colour` mode |
| `knockouts` | none | hex colours removed from the print |
| `noWhite` | none | hex colours printed with no white |
| `matchDE` | 6 | ΔE00 for a colour to match a knockout |
| `keepThin` | true | lines the choke would erase keep their white |

## Use the functions

```js
import { repairAlpha } from "./src/alpha.js";
import { whiteLayer, misregistration } from "./src/white.js";

// rgba: Uint8ClampedArray, 4 bytes per pixel, straight alpha
const fixed = repairAlpha(rgba, W, H, { dpi: 300, lpi: 35 });
const { colour, white, stats } = whiteLayer(fixed.rgba, W, H, { chokePx: 1 });
const check = misregistration(colour, white, W, H, 2); // white showing at ±2 px
```

A gang sheet:

```js
import { nest } from "./src/nest.js";
import { prepareDesign, layout, writeSheet } from "./src/sheet.js";
import { deflateRaw, fileSink } from "./src/node.js";

const { sheets } = nest([{ id: "logo", wIn: 5, hIn: 5, copies: 20 }], { widthIn: 22, gapIn: 0.25 });
const designs = new Map([["logo", prepareDesign(art, { wIn: 5, hIn: 5, dpi: 300 })]]);
const lay = layout(sheets[0], designs, 300), sink = fileSink("sheet.png");
writeSheet({ lay, dpi: 300, format: "png", sink, deflateRaw });
sink.close();
```

`npm run big-sheet -- <folder>` writes a full 22 in × 100 in test
sheet in all three formats and prints the time and memory.

## Releases

The version lives in `src/version.js`. `node scripts/release.mjs
check` (CI, every pull request) checks that package.json, the top
CHANGELOG entry, `releases/<version>.md` and the README agree.
[RELEASE.md](RELEASE.md) has the steps.
