// The pinned third-party and shared files the DTF Table needs, in one place (data only, no side effects).
// fetch-vendor.mjs downloads them into src/vendor/ (git-ignored), notices.mjs writes THIRD-PARTY-NOTICES.md and
// src/vendor.sha256 from them, and fetch-vendor.mjs and CI verify the bytes against src/vendor.sha256.

/** npm packages at exact versions, and the files each one gives src/vendor/ (from its package folder → vendor path). */
export const PACKAGES = [
  // streaming deflate in the browser, for PNG, TIFF and PDF written in bands
  { pkg: "fflate", version: "0.8.2", files: { "esm/browser.js": "fflate.js", "LICENSE": "fflate.LICENSE" } },
  // the Separation Table engine imports ./vendor/quickhull.js: bundled by esbuild with the packages quickhull3d imports
  // (notices.mjs reads them from the build's metafile), next to the engine files below
  { pkg: "quickhull3d", version: "3.1.2", bundle: "separation-table/vendor/quickhull.js" },
  // build tool only: nothing of it is served
  { pkg: "esbuild", version: "0.24.0", tool: true },
];

/** The Separation Table engine (MIT, American Dream Network), downloaded from its public repository at a pinned commit.
    The repository has no release tag yet; this is the newest public commit, and it has every function the DTF Table
    imports with the same code as the engine the DTF Table was built against (release.mjs engine checks this). */
export const ENGINE = {
  name: "Separation Table engine",
  repo: "navruhtra/separation-table",
  commit: "00e00bb2b59efa600e859018d56f088b6f15361c",
  license: "MIT",
  // repository path → src/vendor/ path. engine.js is what alpha.js and white.js import; checks.js (thinWidths, for
  // preflight.js) imports plan.js, pipeline.js, sizes.js and version.js; bench.css is the page's stylesheet.
  files: {
    "LICENSE": "separation-table/LICENSE",
    "src/engine.js": "separation-table/engine.js",
    "src/checks.js": "separation-table/checks.js",
    "src/plan.js": "separation-table/plan.js",
    "src/pipeline.js": "separation-table/pipeline.js",
    "src/sizes.js": "separation-table/sizes.js",
    "src/version.js": "separation-table/version.js",
    "src/bench.css": "separation-table/bench.css",
  },
  // what the DTF Table imports from it (release.mjs engine compares these with a local Separation Table)
  imports: {
    "engine.js": ["rgb2lab", "hex2rgb", "de2000", "baseFraction", "minFilter", "adaptiveChoke", "screenAxes", "shapeDot", "dotOn", "bayerCell", "scatterHoles", "SCATTER_FLOOR"],
    "checks.js": ["thinWidths"],
  },
};
export const rawUrl = (e, path) => `https://raw.githubusercontent.com/${e.repo}/${e.commit}/${path}`;

/** Packages that ship no license file, in the package or its repository: what they do state, quoted. */
export const NO_LICENSE_FILE = {
  "point-line-distance": "The package and its repository (github.com/mauriciopoppe/point-line-distance, tag v1.0.1) ship no license file. Its package.json declares MIT and its README says: \"2015 MIT © Mauricio Poppe\".",
};

export const npmSpec = p => `${p.pkg}@${p.version}`;
