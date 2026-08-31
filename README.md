# Wheel Decider

[![CI](https://github.com/ismailbimbashov/Wheel-Decide/actions/workflows/ci.yml/badge.svg)](https://github.com/ismailbimbashov/Wheel-Decide/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![Coverage](https://img.shields.io/badge/coverage-100%25%20lines-brightgreen)](#testing)

A customisable wheel that picks an option for you, entirely in the browser.

## Features

- **Spin to choose** — an eased, single-run animation picks a segment at random and announces the winner ([`src/main.js`](src/main.js), [`src/core/wheel.js`](src/core/wheel.js)).
- **Start a new wheel** — one confirmed click clears every segment and the saved state ([`clearStoredSegments`](src/core/storage.js)).
- **Add, edit and delete segments** — build your own wheel from a text field and two prompts ([`src/main.js`](src/main.js)).
- **Automatic persistence** — the wheel is saved to `localStorage` and restored on the next visit ([`src/core/storage.js`](src/core/storage.js)).
- **Corruption-proof loading** — truncated JSON, non-array values and malformed records are detected, discarded and repaired instead of crashing the app ([`hydrateSegments`](src/core/storage.js)).
- **Readable labels at any size** — text is auto-fitted to its slice and flipped past vertical so it never renders upside-down ([`fitFontSize`, `shouldFlipLabel`](src/core/wheel.js)).
- **No repeated neighbouring colours** — slice colours are assigned so no two adjacent wedges match, including the wrap-around seam ([`paletteFor`](src/core/wheel.js)).
- **Sharp on HiDPI displays** — the canvas backing store scales with `devicePixelRatio` ([`sizeCanvas`](src/main.js)).
- **Accessible** — semantic landmarks, a labelled input, a named canvas, and an `aria-live` region that announces the result ([`src/index.html`](src/index.html)).
- **Responsive and theme-aware** — fluid layout with light and dark palettes, and `prefers-reduced-motion` support ([`src/styles/main.css`](src/styles/main.css)).
- **Zero runtime dependencies** — no framework, no bundler, no CDN requests.

## Tech Stack

| Layer | Choice |
|---|---|
| Language | JavaScript (ES2022 modules) |
| Framework | None — direct DOM + Canvas 2D API |
| Rendering | HTML5 `<canvas>`, 2D context |
| Persistence | Web Storage (`localStorage`) |
| Build step | None — files are served as authored |
| Test runner | `node:test` (Node built-in) |
| Assertions | `node:assert/strict` (Node built-in) |
| Coverage | `node --experimental-test-coverage` (Node built-in) |
| CI/CD | GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) |
| Dev server | Python `http.server` |
| Runtime deps | None |

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | `>=22` (from the `engines` field in [`package.json`](package.json)) | Runs the test suite. Not needed to use the app. |
| Python | 3.7+ | Only for `npm start`, which uses `python3 -m http.server --directory` |
| A modern browser | Any with ES module and Canvas 2D support | Runs the app |

> The app itself has **no dependencies** — there is nothing to install. Node is required only for tests, and Python only for the bundled dev server. Any static file server works instead.

## Getting Started

**1. Clone the repository**

```bash
git clone https://github.com/ismailbimbashov/Wheel-Decide.git
cd Wheel-Decide
```

**2. Install dependencies**

None required. There is no lock file and no `node_modules` — the app and its test suite use only built-ins.

**3. Configure environment variables**

None required. The application reads no environment variables.

**4. Start the dev server**

```bash
npm start
```

Then open <http://localhost:8000>.

> The app **must be served over HTTP**. Opening `src/index.html` directly via `file://` will fail, because browsers block ES module imports on the file protocol. Any static server works, for example `npx serve src` or the VS Code Live Server extension pointed at `src/`.

**5. Run the tests**

```bash
npm test
```

## Project Structure

```
Wheel-Decide/
├── .github/
│   └── workflows/
│       └── ci.yml           # test pipeline: Node 22 + 24 matrix
├── src/                     # all authored source; also the deploy root
│   ├── index.html           # markup, icon links, module entry point
│   ├── main.js              # DOM layer: canvas drawing, events, storage boundary
│   ├── core/                # pure logic — no DOM, no globals, fully unit-tested
│   │   ├── storage.js       # hydration, validation, mutation, bounds checking
│   │   └── wheel.js         # geometry, easing, colour assignment, selection
│   ├── styles/
│   │   └── main.css         # design tokens, layout, light + dark themes
│   └── assets/
│       └── icons/           # SVG favicon + 16/32/48 PNGs + apple-touch icon
├── tests/
│   ├── storage.test.js      # 40 tests against src/core/storage.js
│   └── wheel.test.js        # 35 tests against src/core/wheel.js
├── .gitignore
├── package.json
└── README.md
```

Because there is no build step, `src/` is served as-is — it is both the source
directory and the publish directory. Point a static host's publish setting at
`src/`.


The split between `src/main.js` and `src/core/` is the architectural spine: **`core/` never touches `window`, `document` or `localStorage`.** Anything needing persistence receives a storage object as an argument, and the browser API is named exactly once, in `main.js`:

```js
const storage = window.localStorage;   // the integration boundary
```

That is what lets the entire data layer run under `node --test` with no DOM, no jsdom and no dependencies.

## Testing

The suite uses Node's built-in test runner and assertion library — there is nothing to install.

**Run the full suite with coverage thresholds:**

```bash
npm test
```

**Run a single test file:**

```bash
node --test tests/wheel.test.js
```

**Coverage report only:**

```bash
node --test --experimental-test-coverage
```

Current results — **75 tests, 75 passing**:

| File | Lines | Branches | Functions |
|---|---|---|---|
| `src/core/storage.js` | 100.00% | 98.39% | 100.00% |
| `src/core/wheel.js` | 100.00% | 100.00% | 100.00% |
| **All files** | **100.00%** | **98.88%** | **100.00%** |

`npm test` enforces floors of **70% lines, 70% branches and 80% functions**. Node exits non-zero when any threshold is unmet, so a coverage regression fails the build exactly like a failing assertion.

`src/main.js` is deliberately absent from the report: it is the DOM layer, is never imported by a test, and is therefore never instrumented. Logic worth asserting belongs in `core/`.

## CI/CD Pipeline

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every **push** and every **pull request**.

- **Job `test`** — runs `npm test` on a matrix of **Node 22 and Node 24** on `ubuntu-latest`, with `fail-fast: false` so both versions report rather than stopping at the first failure.
- There is no install step, because the project has no dependencies and no lock file.
- The workflow declares `permissions: contents: read`, so `GITHUB_TOKEN` cannot write to the repository.
- Concurrency is grouped per ref with `cancel-in-progress: true`, so a new push supersedes an in-flight run.

The pipeline fails the build on a failing assertion **or** on a coverage threshold breach, since both surface as a non-zero exit from `npm test`.

## Contributing

There is no `CONTRIBUTING.md` yet. Until there is:

1. Fork the repository and create a branch off `main`:
   ```bash
   git checkout -b feature/your-change
   ```
2. Make your change. If it is logic rather than presentation, put it in `src/core/` and add tests — that directory is expected to stay at full coverage.
3. Run the suite before opening a PR:
   ```bash
   npm test
   ```
4. Open a pull request describing what changed and why. CI must be green on both Node 22 and 24.

The existing commit history is too short to establish a convention. [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`) is a reasonable default if you want one.

## License

No license specified. Without a `LICENSE` file, default copyright applies and others have no right to use, modify or distribute this code. Add one if you intend the project to be reusable.
