# Plan: does anything break when the influencing code is in an extension, or the editor is in an iframe?

## The question

Everything measured so far runs one piece of JS in the same realm as the editor it
edits. Two very different situations are untested:

1. **The influencing code is in an extension** — i.e. a content script in the
   extension's isolated world, not the page's own world.
2. **The editor is in an iframe** — a different realm, and possibly a different
   origin.

Both are not hypothetical for the source of this repo: `LingoTweaker-extension`
is an MV3 extension whose content script runs the isolated world by default
(`manifest.json` → `content_scripts` → `src/content/content.js`), and it already
carries a MAIN-world bridge (`src/content/bridge.js`, `src/mainworld/discovery.js`)
plus per-frame MAIN-world bootstraps for Google Docs (`src/docs/bootstrap.js`) and
Office Online (`src/office/bootstrap.js`) — i.e. it *already* works around this
question for the two hardest editors without having measured whether it was
necessary. This repo should answer it properly.

## Answer shape (what the plan is designed to produce)

* One matrix per **context** (where each of the two sides of the call lives), per
  engine, asserted by the test suite and recorded in `expectations.js`.
* A **delta table** per context in the README: only the rows whose outcome differs
  from the same-document baseline, plus an explicit count of the rows that are
  identical. "Nothing is blocked" is the claim most likely to be true, and a delta
  table is what proves it.
* A **capability/probe table** for the mechanisms that decide it, measured in every
  engine and every reachable context.
* Two new interactive pages on GitHub Pages, so anybody can try it:
  * `iframes.html` — fully interactive, no extension needed.
  * `extension.html` — interactive **if** the reader has installed the extension
    from this repo in developer mode; graceful, explanatory fallback if not.
* Nothing existing is removed or weakened: same rows, same findings, same ids, same
  selectors, same `npm test` meaning.

## Evidence already gathered (Chromium 153, MV3 extension, isolated world)

Measured with a throwaway probe (`/tmp/kilo`, nothing in this repo was touched):

| probe | result |
| --- | --- |
| extension loads under Playwright | yes — needs `headless: false` + `--headless=new` + explicit `executablePath` to the full `chromium-1243/chrome-linux64/chrome`, plus `--disable-extensions-except` / `--load-extension`. `channel: "chromium"` would need a browser build that is not installed, and `chrome-headless-shell` cannot load extensions at all. |
| `dispatchEvent` on a page-world element, event built in the isolated world | works (`dispatchEvent` returns `true`) |
| `Object.defineProperty(event, "getTargetRanges", …)` defined in the isolated world, read by a page-world listener | **own property is NOT visible to the page world** |
| `event.isTrusted` seen by a page-world listener | `false` — unforgeable, extension or not |
| DOM selection set from the isolated world | visible to the page world (`selection.anchorNode` is inside the host) |
| `selectionchange` in the page world after an isolated-world selection change | fires on the **document**, not on the **window** |
| `new DataTransfer()` / `new StaticRange()` / `new InputEvent()` in the isolated world | all available |

The expando result is the headline: **the two workarounds this repo's recipe depends
on (shadowing `getTargetRanges()`, shadowing `clipboardData` with the real
`DataTransfer`) are own-property writes on the event object, and own properties do
not cross a world boundary.** So the WebKit fix and the Firefox clipboard fix are
expected to be unreachable from an isolated world, while the rest of the recipe
(selection, event dispatch, `execCommand`) is expected to survive. The matrix will
confirm or refute that per editor.

## Contexts to measure

| id | influencing code lives in | editor lives in | engines |
| --- | --- | --- | --- |
| `top` | top document | top document (today's baseline) | chromium, firefox, webkit |
| `editor-in-iframe` | top document | same-origin `<iframe>` | chromium, firefox, webkit |
| `code-in-iframe` | same-origin `<iframe>` (own realm) | top document | chromium, firefox, webkit |
| `extension-isolated` | MV3 content script, `ISOLATED` world | top document, same frame | chromium, + firefox if the XPI route works |
| `extension-main` | MV3 content script, `world: "MAIN"` | top document, same frame | chromium, + firefox if the XPI route works |
| `extension-isolated-in-iframe` | MV3 content script, `ISOLATED` world | same-origin iframe (the Docs/Office shape) | chromium, + firefox if the XPI route works |
| `cross-origin-iframe` | top document | iframe on a second origin | probe only — the point is what is *unreachable*, so no matrix |

`extension-main` is the control that separates "extension" from "isolated world":
if `extension-main` matches `top` everywhere and `extension-isolated` does not, the
isolated world is the cause and MAIN-world injection is the fix. That is exactly the
workaround the extension already ships.

Everything reachable is measured with the **full 21-row matrix** — no subset.

## Engines

* Chromium: authoritative for all extension contexts, via a real loaded MV3
  extension.
* Firefox: **attempt** an unsigned XPI in a Playwright Firefox profile
  (`xpinstall.signatures.required=false`, XPI dropped into `<profile>/extensions/`,
  `firefoxUserPrefs`). Firefox content scripts run in a sandbox with Xray vision,
  where expandos land in a sandbox-only expando object — the interesting difference.
  If it does not load, say so loudly in the README, record the reason, and fall back
  to a documented, cited, clearly-labelled *expected* result for the Firefox
  isolated world. Bounded experiment, done early (step 1), because it decides
  whether two engine columns are measured or predicted.
* WebKit: no extension support on Linux, full stop. The isolated-world rows for
  WebKit are documented expectations (Safari content scripts run in a separate
  content world) and are rendered in the tables with an explicit
  "not measured here" marker, never as if they were measured.

Per the project's existing convention, the three-engine overview must describe the
expected behaviour of **all three** engines so the full state is readable without
loading the project in each browser.

## Architecture

### Shared, realm-agnostic core

`apply-edit.js` already derives its constructors from
`target.ownerDocument.defaultView`, which is the right instinct and is why the
iframe direction has a chance of working. Two steps still reach for the *ambient*
global instead of the target's document:

* `setDomSelection` fires `selectionchange` at `globalThis` — the window that
  *called* it, not the editor's window. The probe above shows window-level
  `selectionchange` is a real delivery path, so this matters.
* `settleSelection` uses the global `requestAnimationFrame`, which never fires in a
  hidden/throttled iframe — so the one yield this project proved is necessary
  (finding 2) would hang rather than degrade.

Both get an optional `scope` parameter, defaulting to the target's document view.
**The matrix is recorded before the fix** so the "recipe as written" rows and the
"recipe scoped to the editor's document" rows both exist, and the difference is
evidence rather than a claim.

New `editable.js` — `SENTENCE`, `CONTENT_HTML`, `WORD`, `rangeForOffsets` — extracted
from `editors.js` so the extension bundle, the page and the iframe realms share one
copy of the offset→DOM-range walk without dragging the five editors into the
extension.

### Editor mounting into another document

`editors.js` reaches for the ambient `document`/`window` in two places
(`loadCkeditorScript`, `mountCkeditor`'s throwaway slot). Both become
`host.ownerDocument`-derived so an editor mounts inside an iframe. Everything else
already takes a parent element.

### Page → extension bridge

Deliberately not the same realm on either side, and deliberately string-payload
`CustomEvent`s rather than object `detail`s (Firefox will not hand an isolated-world
object detail to the page without `cloneInto`).

* The page announces a run request: `lingo-demo:run` with a JSON string
  `{ case, ui }`.
* Both content scripts (`ISOLATED` and `MAIN`) listen, resolve
  `document.querySelector("[data-demo-editor]")` **per request** (CKEditor replaces
  its editable element, and remounting produces new nodes), run the same
  `apply-edit.js` function in their own world, and reply with `lingo-demo:result`
  carrying `{ case, text, html, extras }` as a JSON string.
* Both scripts set `document.documentElement.dataset.lingoExtension = "isolated" |
  "main" | "isolated,main"` at startup. Data attributes are shared DOM, so this
  reaches the page, the other world and Playwright alike (verified in the probe).
* `all_frames: true`, so a frame whose editor lives in an iframe is served by the
  content script injected into *that* frame — which is exactly the
  `extension-isolated-in-iframe` context and the real Docs/Office shape.

### The extension itself

`extension/` in the repo, built by esbuild (already a dependency) into
`vendor/extension/` (gitignored), producing:

* `extension/manifest.json` — MV3, two content scripts: `content-isolated.js`
  (default world) and `content-main.js` (`"world": "MAIN"`), `all_frames: true`,
  `run_at: document_idle`, `matches: ["http://*/*", "https://*/*"]`.
* `extension/content.js` — the entry both bundles share: imports
  `apply-edit.js` + `editable.js`, installs the bridge, and tags the document.

Load unpacked from `vendor/extension/` after `npm run build`.

### Pages

* **`iframes.html` + `iframes-page.js`** (deployed). Same five editors, same seven
  buttons, same toggles, plus a *context* selector (`editor in an iframe`,
  `influencing code in an iframe`) and the recorded matrix for every context, so any
  engine's table is readable from any browser. Also a live "what is blocked here"
  panel showing the cross-origin, sandboxed and `display:none`-iframe probes with
  real results.
* **`extension.html` + `extension-page.js`** (deployed). Explains the install steps,
  shows bridge status per world, and — when the extension is present — runs the same
  buttons through the extension's world with the same report panel. Without the
  extension it still renders the recorded isolated-world matrices and the probe
  table, so the page is useful either way.
* **`index.html`** keeps its current contents and gains a link to the two new pages.
  Its ids, classes and behaviour stay byte-for-byte compatible with what the harness
  drives (`#switcher button`, `#ranges`, `#selection`, `#supply`, `#settle`,
  `#clipboard`, `#go-*`, `#host[data-mounted]`, `#outcome .verdict`, `#text-after`,
  `#dom-after`) so `npm test` keeps meaning exactly what it means today.
* The strategy/report UI (~250 lines of `page.js`) is extracted into a shared module
  so the three pages cannot drift apart — the same reason `expectations.js` is the
  single source of truth today. The demo's base CSS moves out of `index.html`'s
  `<style>` into a shared stylesheet the iframes can link too.

### Measurement plumbing

`test/harness.mjs` gains a `context` parameter and `CONTEXTS` / `CONTEXT_ENGINES`
metadata; the existing loop is already generic enough that this is mostly plumbing.
The extension contexts use the button-click flow unchanged, because execution
happens in the extension's world behind the bridge and the *page* reports the
outcome — so measurement stays "click a button, read the verdict".

Extension launches: a persistent context with the loaded extension for Chromium;
the profile/XPI route for Firefox, with a documented failure mode.

`test/record.mjs` extends to `for (context of CONTEXTS) for (engine of enginesFor(context))`
and writes new generated exports (`CONTEXT_EXPECTATIONS`, `CONTEXT_ARTIFACTS`,
`CONTEXT_PAGE_ERRORS`, `ISOLATION_PROBES`) *inside the existing GENERATED markers*,
leaving every current export untouched.

`test/verify.mjs` asserts each context/engine it can measure, and prints a loud,
explicit "not measured — <reason>" line for any context/engine that is skipped.
Skipping is never silent, and a skipped column can never pass as if measured.

`test/tables.mjs` keeps the existing three per-engine tables exactly as they are and
appends, per context, a delta table (rows that differ from `top`, plus a
"n of 21 rows identical to the same-document case" line) and the probe table.

`package.json`: `test` stays the fast Chromium default (baseline + probes + iframe
contexts), `test:all` covers every engine × every measurable context, plus
`build:extension`, `measure:contexts`, `record:contexts`.

## Files

| file | change |
| --- | --- |
| `apply-edit.js` | `scope` for `setDomSelection` (fire `selectionchange` at the editor's window too) and `settleSelection` (the editor's `requestAnimationFrame`, with a documented fallback). No behaviour change for the existing top-document rows. |
| `editable.js` | **new** — `SENTENCE`, `CONTENT_HTML`, `WORD`, `rangeForOffsets`, extracted from `editors.js`. |
| `editors.js` | import from `editable.js`; derive the document/window from the host element so an editor mounts in an iframe. |
| `contexts.js` | **new** — context ids, labels, engine coverage, probe definitions, expected-value metadata (hand-maintained, next to `expectations.js`). |
| `demo-ui.js` | **new** — the shared switcher/toggles/buttons/report panel, extracted from `page.js` and exported through `main.js` → `window.LingoDemo`. |
| `page.js` | shrinks to the top-document wiring; ids and behaviour unchanged. |
| `index.html` | gains links to the two new pages; base CSS moves to a shared stylesheet. |
| `iframes.html`, `iframes-page.js` | **new**, deployed. |
| `extension.html`, `extension-page.js` | **new**, deployed. |
| `extension/manifest.json`, `extension/content.js` | **new** — the loadable extension. |
| `build.mjs` | adds the two pages to `SITE_FILES` and builds `vendor/extension/`. |
| `expectations.js` | new generated exports only; hand-written section gains the probe and context notes. |
| `test/harness.mjs` | context parameter, extension launch paths, per-context probes. |
| `test/record.mjs`, `test/verify.mjs`, `test/tables.mjs` | loop over contexts; delta tables; explicit skip reporting. |
| `README.md` | new findings, the context tables, install instructions, and the three-engine overview. |
| `.gitignore` | `vendor/extension/` is already covered by `vendor/`. |

## Risks

1. **Firefox unsigned XPI may simply not load.** Mitigated by doing it in step 1,
   with an explicit fallback to a labelled expectation and a stated reason.
2. **CKEditor inside an iframe**: its asset URLs must resolve against the iframe's
   document base. Verify early; fall back to a same-directory `srcdoc` frame with an
   explicit `<base>`.
3. **`chrome-headless-shell` cannot load extensions** — the harness must always use
   the full Chromium binary with `--headless=new` (already proven to work).
4. **Runtime**. 21 rows × 5 editors × up to 6 contexts × 3 engines is a lot of
   browser time, and CKEditor dominates it. `npm test` stays Chromium-scoped;
   `test:all` is the deliberate full run.
5. **Drift.** Three pages + one harness must agree. The mitigation is structural:
   one shared UI module, one shared recorded-expectations file, generated tables.

## Order of work

1. Firefox unsigned-XPI spike: does a content script run at all in Playwright's
   Firefox? Record the answer either way. Everything else is unaffected by it.
2. `editable.js` extraction; `editors.js` document-derived mounting; prove an editor
   (CKEditor first — hardest) mounts in a same-origin iframe in all three engines.
3. `apply-edit.js` scope fixes; prove the existing top-document matrix is unchanged
   (`npm test` must stay green at every step).
4. `iframes.html` + shared UI, both iframe directions, full matrix, all three
   engines; record.
5. Extension bundle + bridge; Chromium isolated and MAIN worlds; full matrix;
   record.
6. `extension-isolated-in-iframe`; record.
7. Probes: `isTrusted`, expando visibility, cross-realm `instanceof`, window vs
   document `selectionchange`, hidden-iframe rAF, cross-origin iframe, sandboxed
   iframe.
8. Record all contexts into `expectations.js`; extend `verify.mjs`; extend
   `tables.mjs` (delta tables).
9. `extension.html`; install instructions for Chrome/Edge (load unpacked), Firefox
   (temporary add-on), Safari (what is and is not possible on each platform).
10. README findings + the three-engine overview; final `npm run test:all`.

## Definition of done

* `npm test` green, with the original 21 rows asserted exactly as before.
* `npm run test:all` green for every context/engine it claims to cover, and a loud
  line naming every context/engine it does not, with the reason.
* Every new claim in the README traceable to a generated table or a recorded probe.
* A stranger can load `iframes.html` from GitHub Pages and reproduce every iframe
  row by hand, and can load `extension.html`, install the extension from a fresh
  clone in under five minutes, and reproduce every extension row by hand.