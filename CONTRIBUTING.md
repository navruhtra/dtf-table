# Contributing

Thanks for helping. Issues and pull requests are welcome.

## Report a problem

Open an issue. Say which roll and settings you used, and attach the
art if you can share it. A problem we can open again is a problem we
can fix.

## Before you open a pull request

Run these in the repository root, after `npm run setup`. All must
pass.

```bash
npm test             # alpha repair, white layer, profiles, nesting, writers, preflight
npm run typecheck    # tsc on the files marked @ts-check
npm run setup:bench  # once: rectpack 0.2.2 in .venv/ (Python 3)
npm run benchmark    # no measure worse than benchmark/baseline.json
npm run setup:e2e    # once: Playwright and its Chromium
npm run e2e          # the page at a phone and a desktop size
```

A change to alpha repair or the white layer also shows its effect on
the sample designs in the page (Proof and White views), before and
after. The benchmark supports that check; it does not replace it.

## One change per pull request

Keep a pull request to one feature or one fix, made from current
`main`. A pull request that does several things, or that conflicts
with `main`, will be asked to split.

`benchmark/referee.mjs` changes only in its own pull request, and
the baseline is re-recorded after it (`node benchmark/run.mjs
--update`).

## Rules for code and data

- No new dependency without a reason in the pull request. Pin its
  version in `scripts/vendor-pins.mjs` and run
  `node scripts/notices.mjs` to add its hash and notice.
- The Separation Table engine is downloaded, not copied. A change to
  the engine goes to the Separation Table; a new pin here follows its
  release (docs/RELEASE.md).
- Copy no code or data without a licence that lets us ship it under
  MIT. Name its source in NOTICE.
- Every quality number is a model number until a print measures it.
  Say so in the text.

## Licence

By contributing you agree that your work ships under the MIT licence
in LICENSE.
