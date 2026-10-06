# Strategies for influencing text editors

A minimal, runnable demonstration that **one piece of JS** can modify the contents
of an editor it is not attached to, by means of one of several strategies.

Seven real rich-text editors — ProseMirror, Wordgard, Quill 2, CodeMirror 6,
CKEditor 5, Lexical and an [EditContext](https://w3c.github.io/edit-context/)-based
editor — mounted **stock**, measured in three engines — Chromium 153, Firefox 155
and WebKit/Safari 26.6 — so you can see which strategies work where, and which fail
in ways that look like success. The EditContext editor is the exception to the
"three engines" claim: the API it is built on has shipped in Chromium only, so it
is measured there and marked `n/a` elsewhere.

Live demo: <https://johanneswilm.github.io/influence-text-editors/>

Strategies used:

* beforeinput event, as `insertReplacementText`, as `insertText`, and as
  `deleteContentBackward`
* synthetic paste — dispatched immediately, after yielding a frame, and with the
  clipboard supplied three different ways
* faked backspace
* execCommand

Editors measured, all at their default configuration:

| editor | version |
| --- | --- |
| ProseMirror | 1.42.5 |
| Wordgard | 0.5.2 |
| Quill 2 | 2.0.3 |
| CodeMirror 6 | 6.43.13 |
| CKEditor 5 | 5.41.4 (classic build) |
| Lexical | 0.52.0 (`registerRichText`, the stock non-React setup) |
| EditContext editor | 0.1.0 (built on the EditContext API — Chromium only) |

Engines measured: Chromium 153, Firefox 155, WebKit/Safari 26.6.

One measured cell is genuinely non-deterministic and recorded as such: in WebKit, a
paste dispatched after `setTimeout(0)` races Wordgard's own asynchronous selection
sync, and has been observed both ways depending on machine load. See
`LOAD_SENSITIVE_CELLS` in `expectations.js`.

## Run it

```sh
npm install
npm run build     # bundles the editors into vendor/ and writes the static site to site/
npm run serve     # then open http://localhost:8080/
```

`npm run build` produces two things: `vendor/` for local development, and `site/` —
`iframes.html`, `extension.html`, their scripts, and `vendor/` — which is the
deployable site. Every path in it is relative, so it works at a domain root or
under a project subdirectory, and inside `frame.html`'s iframe.
`npm run serve` serves the repository root, which is also fine, and additionally
exposes this README and the tests.

To view it the way GitHub Pages will, serve `site/` with anything:

```sh
python3 -m http.server 8099 --directory site
```

A WebKit window with a console attached is one command away:

```sh
npm run webkit          # the demo in WebKit, headed
npm run webkit:console  # …plus a prompt that evaluates JavaScript in the page
```

Cross-browser testing needs the Playwright browser builds:

```sh
npx playwright install firefox webkit
```

Playwright's WebKit on Linux also needs a few shared libraries. The supported fix
requires root:

```sh
sudo npx playwright install-deps webkit
```

That covers everything except `libbacktrace`, which is not part of Playwright's
dependency list. `npm run setup:webkit` supplies whatever is still unresolvable
— on Ubuntu 24.04+ that is just `libbacktrace` and `libhidapi-libusb` — without
root: it downloads the `.deb`s, extracts them, and copies the shared objects
into the WebKit bundle's own library directory, which is the one Playwright puts
on `LD_LIBRARY_PATH` when it launches the browser, so it works regardless of
what the environment says. It checks first and does nothing once the system has
everything.

| command | what it does |
| --- | --- |
| `npm test` | Chromium only — the fast default (the same-document baseline) |
| `npm run test:all` | Chromium, Firefox and WebKit, same-document and iframe contexts |
| `npm run test:contexts` | every context this browser can measure |
| `npm run test:firefox` / `npm run test:webkit` | one engine |
| `npm run measure firefox` | print a matrix for one engine, assert nothing |
| `npm run measure -- --context=code-in-iframe chromium` | …one context too |
| `npm run record` | re-measure and rewrite the tables in `expectations.js` |
| `npm run record:contexts` | …the contexts as well |
| `npm run tables` | rewrite the README's results tables from the recorded values |

`test/harness.mjs` measures, `expectations.js` states what the measurement
should be, and `test/verify.mjs` asserts one against the other — including the
*exact resulting text*, because "the content changed" and "the edit landed where
it was aimed" are not the same claim, and "the word was deleted" and "the word
was replaced" are not either. `index.html` renders its own table straight out of
`expectations.js`, so the page cannot drift from the tests.

### Try the contexts yourself

Everything measured here has a page, and every page is live rather than a
screenshot of the tables.

**`iframes.html`** — the editor in a same-origin iframe, or the influencing code
in one. Nothing to install: it is on
[the deployed site](https://johanneswilm.github.io/influence-text-editors/iframes.html)
and works from `npm run serve` too. Pick a context, pick an editor, press the
same eight buttons, and the *Probes* section at the bottom will run against the
realm the editor actually lives in and show you what each side could see.

**`extension.html`** — the influencing code running as an extension's content
script. This one needs the extension, because a page cannot load a content
script into itself. From a clone of this repository:

```sh
npm install
npm run build        # writes the extension to vendor/extension/
npm run serve        # then open http://localhost:8080/extension.html
```

then install `vendor/extension/` in developer mode and reload the page:

| browser | how |
| --- | --- |
| Chrome, Edge, Brave, any Chromium | `chrome://extensions` → *Developer mode* → *Load unpacked* → choose `vendor/extension/` |
| Firefox | `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on…* → choose `vendor/extension/manifest.json` (a temporary add-on is unloaded when Firefox closes) |
| Safari | no WebExtensions on Linux; on macOS the extension would have to be converted with `xcrun safaridriver`/`web-extension-converter` and enabled in Safari's *Develop → Allow Unsigned Extensions*. Not covered by this repo — see the WebKit column in the tables for why it is recorded as *not measured* rather than guessed. |

The page reports which worlds are listening. The extension injects **two**
content scripts with byte-identical code — one in the default ISOLATED world and
one in the page's own world (`"world": "MAIN"`) — and the page can drive either.
That second script is the control for the whole experiment: if MAIN reproduces
the same-document results and ISOLATED does not, the world is the variable and
not the extension.

## The recipe for the beforeinput event

### Step 4: supplying the target range — there are two ways

`targetRanges` is a member of the spec's `InputEventInit`
(`sequence<StaticRange> targetRanges`), so the *intended* way to give a scripted
`beforeinput` a target range is the constructor:

```js
new InputEvent("beforeinput", {
  inputType: "insertText", data, targetRanges: [staticRange],
});
```

**Chromium and Firefox implement it. WebKit does not** — it accepts the
initializer silently and `getTargetRanges()` comes back empty. So for WebKit the
method has to be shadowed instead:

```js
const staticRange = new StaticRange({
  startContainer: range.startContainer, startOffset: range.startOffset,
  endContainer:   range.endContainer,   endOffset:   range.endOffset,
});
Object.defineProperty(event, "getTargetRanges", {
  value: () => [staticRange], configurable: true,
});
```

A real `StaticRange` rather than a plain object literal, because consumers read
`.collapsed` off it — and because a target range is by definition read-only: an
editor may read it, never mutate it.

Sending both is harmless and covers all three engines: the own property simply
wins where the init dict was honoured anyway. The page's *Supply the target
range* control switches between the three modes so you can watch the difference
per engine; the `insertText` and `deleteContentBackward` rows are measured under
each.

One gotcha worth knowing: **read `getTargetRanges()` before dispatching, not
after.** An engine that took the range from the init dict clears it once the event
has been dispatched, so a check afterwards reports zero ranges for an edit that
did happen. Editors read it from inside their own listener, which is the only
place it is reliably populated. `dispatchBeforeinput` returns
`rangesBeforeDispatch` for this reason.

### The full recipe

`apply-edit.js`, five steps:

1. Build a `Range` over the text to replace. Character offsets → DOM points via
   a `TreeWalker` over text nodes, because inline formatting splits one sentence
   across many text nodes and child indices are useless.
2. Put the **live DOM selection** on that range and fire `selectionchange` at the
   document, the element *and* the window. Rich editors keep their own selection
   model and only re-sync from the DOM when they observe one — and not all of
   them observe it *synchronously*. Wordgard syncs on a task or frame boundary,
   so step 5's edit has to be dispatched after a yield or it goes to the stale
   caret. See finding 2.
3. `new InputEvent("beforeinput", { inputType, data, dataTransfer })`. Formatting
   cannot travel in `data` (a plain string), so it rides in the `dataTransfer`'s
   `text/html` flavour — which Chromium and Firefox fill in from the init dict
   and WebKit does not (finding 7).
4. Supply the target range: `targetRanges` in the init dict, shadowing
   `getTargetRanges()`, or both.
5. `dispatchEvent`, then **verify by re-reading the text.** Never treat "not
   `preventDefault`ed" as success. Read the text a tick *after* dispatching, too:
   editors apply their change on their own schedule rather than inside the event
   handler, and reading in the same task reports "unchanged" for an edit that did
   happen. Wordgard defers its DOM write this way, and reading too early made the
   WebKit measurements disagree with themselves.

## Measured results

Three engines, seven editors — six of them in every engine, the EditContext
editor in Chromium only — `npm run test:all`. The tables below are generated
from the recorded measurements (`npm run record`, then `npm run tables`), so they
cannot drift from what the tests assert.

**You do not need three browsers to read the results.** The page has a *Show
results measured in* selector, so any engine's table can be read from any browser;
it defaults to the engine you are actually in and says so. The same tables are
reproduced below for all three, which is the whole picture in one page.

<!-- BEGIN GENERATED TABLES: npm run tables -->

### `targetRanges` support, per engine

Whether the engine keeps `sequence<StaticRange> targetRanges` from the `InputEventInit` dict:

| probe | Chromium 153 | Firefox 155 | WebKit / Safari 26.6 |
| --- | --- | --- | --- |
| `targetRanges` in the `InputEvent` init dict | **yes** | **yes** | **no** |
| `dataTransfer` in the `InputEvent` init dict | yes | yes | **no** |
| `clipboardData` in the `ClipboardEvent` init dict | yes | **no** | yes |

So `targetRanges` in the init dict is the spec'd route and it works in two of the three engines. Shadowing `getTargetRanges()` is what covers WebKit. The same shape applies to `dataTransfer`: Chromium and Firefox keep the one from the init dict, WebKit drops it — which is why Wordgard's `insertReplacementText` throws there and Lexical falls back to `event.data`.

`replace` = the target word was replaced, `delete` = the word was removed and nothing inserted, `caret` = the content changed but the target word survived, — = nothing changed.

`EditContext editor` runs in chromium only — the EditContext API has not shipped in this engine (Chromium only) — so its Firefox 155 and WebKit / Safari 26.6 cells read `n/a`: not measured, not failed. The pages say `not supported here` for the same columns.

### Chromium 153

| strategy | ProseMirror | Wordgard | Quill 2 | CodeMirror 6 | CKEditor 5 | Lexical | EditContext editor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `beforeinput + getTargetRanges()` | — | replace | replace | — | replace | replace | replace |
| `beforeinput, no getTargetRanges()` | — | — | — | — | — | replace | replace |
| `beforeinput + range, no DOM selection` | — | replace | replace | — | replace | — | caret |
| `beforeinput (insertText) + getTargetRanges()` | — | replace | replace | — | replace | replace | — |
| `beforeinput (insertText), no getTargetRanges()` | — | — | — | — | — | — | — |
| `beforeinput (deleteContentBackward) + getTargetRanges()` | — | **delete** | — | — | **delete** | **delete** | — |
| `beforeinput (deleteContentBackward), no getTargetRanges()` | — | — | — | — | **delete** | **delete** | — |
| `beforeinput (insertText) + targetRanges in init dict` | — | replace | replace | — | replace | replace | — |
| `beforeinput (deleteContentBackward) + targetRanges in init dict` | — | **delete** | — | — | **delete** | **delete** | — |
| `beforeinput (insertText), no DOM selection (override)` | — | replace | replace | — | replace | — | — |
| `beforeinput (insertText), no DOM selection (init dict)` | — | replace | replace | — | replace | — | — |
| `faked keydown Backspace` | — | — | **delete** | **delete** | — | **delete** | — |
| `faked keydown, no DOM selection` | — | — | — | — | — | — | — |
| `execCommand("insertHTML")` | replace | — | replace | replace | — | — | — |
| `synthetic paste` | replace | caret | replace | replace | replace | replace | — |
| `synthetic paste, no DOM selection` | caret | caret | caret | caret | caret | — | — |
| `synthetic paste, clipboardData shadowed as a proxy object` | replace | caret | replace | replace | — | — | — |
| `synthetic paste, clipboardData shadowed as the real DataTransfer` | replace | caret | replace | replace | replace | replace | — |
| `synthetic paste, yield one task first` | replace | replace | replace | replace | replace | replace | — |
| `synthetic paste, yield one frame first` | replace | replace | replace | replace | replace | replace | — |
| `synthetic paste, real DataTransfer + yield one frame` | replace | replace | replace | replace | replace | replace | — |
| `paste via beforeinput (insertFromPaste), paste as backup` | replace | replace | replace | replace | replace | replace | replace |

### Firefox 155

| strategy | ProseMirror | Wordgard | Quill 2 | CodeMirror 6 | CKEditor 5 | Lexical | EditContext editor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `beforeinput + getTargetRanges()` | — | replace | replace | — | replace | replace | n/a |
| `beforeinput, no getTargetRanges()` | — | — | — | — | — | replace | n/a |
| `beforeinput + range, no DOM selection` | — | replace | replace | — | replace | — | n/a |
| `beforeinput (insertText) + getTargetRanges()` | — | replace | replace | — | replace | replace | n/a |
| `beforeinput (insertText), no getTargetRanges()` | — | — | — | — | — | — | n/a |
| `beforeinput (deleteContentBackward) + getTargetRanges()` | — | **delete** | — | — | **delete** | **delete** | n/a |
| `beforeinput (deleteContentBackward), no getTargetRanges()` | — | — | — | — | **delete** | **delete** | n/a |
| `beforeinput (insertText) + targetRanges in init dict` | — | replace | replace | — | replace | replace | n/a |
| `beforeinput (deleteContentBackward) + targetRanges in init dict` | — | **delete** | — | — | **delete** | **delete** | n/a |
| `beforeinput (insertText), no DOM selection (override)` | — | replace | replace | — | replace | — | n/a |
| `beforeinput (insertText), no DOM selection (init dict)` | — | replace | replace | — | replace | — | n/a |
| `faked keydown Backspace` | — | — | **delete** | **delete** | — | **delete** | n/a |
| `faked keydown, no DOM selection` | — | — | — | — | — | — | n/a |
| `execCommand("insertHTML")` | replace | — | replace | replace | — | — | n/a |
| `synthetic paste` | — | — | **delete** | **delete** | — | — | n/a |
| `synthetic paste, no DOM selection` | — | — | — | — | — | — | n/a |
| `synthetic paste, clipboardData shadowed as a proxy object` | replace | caret | replace | replace | — | — | n/a |
| `synthetic paste, clipboardData shadowed as the real DataTransfer` | replace | caret | replace | replace | replace | replace | n/a |
| `synthetic paste, yield one task first` | — | — | **delete** | **delete** | — | — | n/a |
| `synthetic paste, yield one frame first` | — | — | **delete** | **delete** | — | — | n/a |
| `synthetic paste, real DataTransfer + yield one frame` | replace | replace | replace | replace | replace | replace | n/a |
| `paste via beforeinput (insertFromPaste), paste as backup` | replace | replace | replace | replace | replace | replace | n/a |

### WebKit / Safari 26.6

| strategy | ProseMirror | Wordgard | Quill 2 | CodeMirror 6 | CKEditor 5 | Lexical | EditContext editor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `beforeinput + getTargetRanges()` | — | — | replace | — | replace | replace | n/a |
| `beforeinput, no getTargetRanges()` | — | — | — | — | — | replace | n/a |
| `beforeinput + range, no DOM selection` | — | — | replace | — | replace | — | n/a |
| `beforeinput (insertText) + getTargetRanges()` | — | replace | replace | — | replace | replace | n/a |
| `beforeinput (insertText), no getTargetRanges()` | — | — | — | — | — | — | n/a |
| `beforeinput (deleteContentBackward) + getTargetRanges()` | — | **delete** | — | — | **delete** | **delete** | n/a |
| `beforeinput (deleteContentBackward), no getTargetRanges()` | — | — | — | — | **delete** | **delete** | n/a |
| `beforeinput (insertText) + targetRanges in init dict` | — | — | — | — | — | — | n/a |
| `beforeinput (deleteContentBackward) + targetRanges in init dict` | — | — | — | — | **delete** | **delete** | n/a |
| `beforeinput (insertText), no DOM selection (override)` | — | replace | replace | — | replace | — | n/a |
| `beforeinput (insertText), no DOM selection (init dict)` | — | — | — | — | — | — | n/a |
| `faked keydown Backspace` | — | — | **delete** | **delete** | — | **delete** | n/a |
| `faked keydown, no DOM selection` | — | — | — | — | — | — | n/a |
| `execCommand("insertHTML")` | replace | — | replace | replace | replace | — | n/a |
| `synthetic paste` | replace | caret | replace | replace | replace | replace | n/a |
| `synthetic paste, no DOM selection` | caret | caret | caret | caret | caret | — | n/a |
| `synthetic paste, clipboardData shadowed as a proxy object` | replace | caret | replace | replace | — | — | n/a |
| `synthetic paste, clipboardData shadowed as the real DataTransfer` | replace | caret | replace | replace | replace | replace | n/a |
| `synthetic paste, yield one task first` | replace | caret / replace | replace | replace | replace | replace | n/a |
| `synthetic paste, yield one frame first` | replace | replace | replace | replace | replace | replace | n/a |
| `synthetic paste, real DataTransfer + yield one frame` | replace | replace | replace | replace | replace | replace | n/a |
| `paste via beforeinput (insertFromPaste), paste as backup` | replace | replace | replace | replace | replace | replace | n/a |

### editor in a same-origin iframe

*top document → same-origin iframe.*

The common case: a page with an embedded editor. Same origin, so every object is reachable — the question is only whether the editor cares that it lives in another realm.

**Chromium 153** — 154 of 154 cells identical to the same-document baseline.

Every cell is identical. Nothing about this context changes the outcome of any strategy.

**Firefox 155** — 117 of 132 cells identical to the same-document baseline.

| strategy | ProseMirror | Wordgard | Quill 2 | CodeMirror 6 | CKEditor 5 | Lexical | EditContext editor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `beforeinput + getTargetRanges()` | same | replace / — ← replace | same | same | same | same | n/a |
| `beforeinput + range, no DOM selection` | same | replace / — ← replace | same | same | same | same | n/a |
| `beforeinput (insertText) + getTargetRanges()` | same | replace / — ← replace | same | same | same | same | n/a |
| `beforeinput (deleteContentBackward) + getTargetRanges()` | same | **delete** / — ← **delete** | same | same | same | same | n/a |
| `beforeinput (insertText) + targetRanges in init dict` | same | replace / — ← replace | same | same | same | same | n/a |
| `beforeinput (deleteContentBackward) + targetRanges in init dict` | same | **delete** / — ← **delete** | same | same | same | same | n/a |
| `beforeinput (insertText), no DOM selection (override)` | same | replace / — ← replace | same | same | same | same | n/a |
| `beforeinput (insertText), no DOM selection (init dict)` | same | replace / — ← replace | same | same | same | same | n/a |
| `synthetic paste` | same | caret / — ← — | same | same | same | same | n/a |
| `synthetic paste, clipboardData shadowed as a proxy object` | same | caret / — ← caret | same | same | same | same | n/a |
| `synthetic paste, clipboardData shadowed as the real DataTransfer` | same | caret / — ← caret | same | same | same | same | n/a |
| `synthetic paste, yield one task first` | same | replace / — ← — | same | same | same | same | n/a |
| `synthetic paste, yield one frame first` | same | replace / — ← — | same | same | same | same | n/a |
| `synthetic paste, real DataTransfer + yield one frame` | same | replace / — ← replace | same | same | same | same | n/a |
| `paste via beforeinput (insertFromPaste), paste as backup` | same | replace / — ← replace | same | same | same | same | n/a |

**WebKit / Safari 26.6** — 115 of 132 cells identical to the same-document baseline.

| strategy | ProseMirror | Wordgard | Quill 2 | CodeMirror 6 | CKEditor 5 | Lexical | EditContext editor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `beforeinput + getTargetRanges()` | same | replace / — ← — | same | same | same | same | n/a |
| `beforeinput + range, no DOM selection` | same | replace / — ← — | same | same | same | same | n/a |
| `beforeinput (insertText) + getTargetRanges()` | same | replace / — ← replace | same | same | same | same | n/a |
| `beforeinput (deleteContentBackward) + getTargetRanges()` | same | **delete** / — ← **delete** | same | same | same | same | n/a |
| `beforeinput (insertText) + targetRanges in init dict` | same | replace / — ← — | same | same | same | same | n/a |
| `beforeinput (deleteContentBackward) + targetRanges in init dict` | same | **delete** / — ← — | same | same | same | same | n/a |
| `beforeinput (insertText), no DOM selection (override)` | same | replace / — ← replace | same | same | same | same | n/a |
| `beforeinput (insertText), no DOM selection (init dict)` | same | replace / — ← — | same | same | same | same | n/a |
| `execCommand("insertHTML")` | same | replace ← — | same | same | same | same | n/a |
| `synthetic paste` | same | caret / — ← caret | same | same | same | same | n/a |
| `synthetic paste, no DOM selection` | same | — ← caret | same | same | same | same | n/a |
| `synthetic paste, clipboardData shadowed as a proxy object` | same | caret / — ← caret | same | same | same | same | n/a |
| `synthetic paste, clipboardData shadowed as the real DataTransfer` | same | caret / — ← caret | same | same | same | same | n/a |
| `synthetic paste, yield one task first` | same | caret / replace / — ← caret / replace | same | same | same | same | n/a |
| `synthetic paste, yield one frame first` | same | replace / — ← replace | same | same | same | same | n/a |
| `synthetic paste, real DataTransfer + yield one frame` | same | replace / — ← replace | same | same | same | same | n/a |
| `paste via beforeinput (insertFromPaste), paste as backup` | same | replace / — ← replace | same | same | same | same | n/a |

<details><summary>Chromium 153 — what each realm could see</summary>

| probe | what was observed |
| --- | --- |
| ``isTrusted` on a dispatched event` | false |
| `own property on the event, read by the editor's realm` | own property visible → 1 range(s); init dict hidden → 1 range(s) |
| ``event.clipboardData instanceof DataTransfer`, in the editor's realm` | init dict: own property hidden, instanceof DataTransfer true, html true; shadowed: own property visible, instanceof true, html true |
| `DOM selection set by the influencing realm, seen by the editor's realm` | "quick" when set → "quick" once the editors had re-synced |
| ``selectionchange` delivered to the editor's realm` | document+element+window (3) |
| ``targetRanges` in the init dict, honoured cross-realm` | 1 range(s) |
| ``document.execCommand` called from the influencing realm` | true (<b>probe</b>) |
| `one `requestAnimationFrame` in a `display: none` iframe` | fires |
| `a cross-origin iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin "<origin>" from accessing a cross-origin frame. |
| `a `sandbox="allow-scripts"` iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin "<origin>" from accessing a cross-origin frame. |

</details>

<details><summary>Firefox 155 — what each realm could see</summary>

| probe | what was observed |
| --- | --- |
| ``isTrusted` on a dispatched event` | false |
| `own property on the event, read by the editor's realm` | own property visible → 1 range(s); init dict hidden → 1 range(s) |
| ``event.clipboardData instanceof DataTransfer`, in the editor's realm` | init dict: own property hidden, instanceof DataTransfer true, html false; shadowed: own property visible, instanceof true, html true |
| `DOM selection set by the influencing realm, seen by the editor's realm` | "quick" when set → "quick" once the editors had re-synced |
| ``selectionchange` delivered to the editor's realm` | document+element+window (3) |
| ``targetRanges` in the init dict, honoured cross-realm` | 1 range(s) |
| ``document.execCommand` called from the influencing realm` | true (<b>probe</b>) |
| `one `requestAnimationFrame` in a `display: none` iframe` | never fires in a hidden frame |
| `a cross-origin iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property "getSelection" on cross-origin object |
| `a `sandbox="allow-scripts"` iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property "getSelection" on cross-origin object |

</details>

<details><summary>WebKit / Safari 26.6 — what each realm could see</summary>

| probe | what was observed |
| --- | --- |
| ``isTrusted` on a dispatched event` | false |
| `own property on the event, read by the editor's realm` | own property visible → 1 range(s); init dict hidden → 0 range(s) |
| ``event.clipboardData instanceof DataTransfer`, in the editor's realm` | init dict: own property hidden, instanceof DataTransfer true, html true; shadowed: own property visible, instanceof true, html true |
| `DOM selection set by the influencing realm, seen by the editor's realm` | "quick" when set → "quick" once the editors had re-synced |
| ``selectionchange` delivered to the editor's realm` | document+element+window (3) |
| ``targetRanges` in the init dict, honoured cross-realm` | 0 range(s) |
| ``document.execCommand` called from the influencing realm` | true (<b>probe</b><br>) |
| `one `requestAnimationFrame` in a `display: none` iframe` | fires |
| `a cross-origin iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Blocked a frame with origin "<origin>" from accessing a cross-origin frame. Protocols, domains, and ports must match. |
| `a `sandbox="allow-scripts"` iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Sandbox access violation: Blocked a frame at "<origin>" from accessing a cross-origin frame.  The frame being accessed is sandboxed and lacks the "allow-same-origin" flag. |

</details>

Editors threw from their own handlers on these paths (the edit is still ignored):

- **Chromium 153**: run ckeditor / beforeinput (insertText), no getTargetRanges(); run ckeditor / beforeinput, no getTargetRanges(); run ckeditor / synthetic paste, clipboardData shadowed as a proxy object; run lexical / synthetic paste, clipboardData shadowed as a proxy object; run wordgard / beforeinput (insertText), no getTargetRanges(); run wordgard / beforeinput, no getTargetRanges()
- **Firefox 155**: run ckeditor / beforeinput (insertText), no getTargetRanges(); run ckeditor / beforeinput, no getTargetRanges(); run ckeditor / synthetic paste, clipboardData shadowed as a proxy object; run lexical / synthetic paste, clipboardData shadowed as a proxy object; run wordgard / beforeinput (insertText), no getTargetRanges(); run wordgard / beforeinput, no getTargetRanges()
- **WebKit / Safari 26.6**: editor-in-iframe / probes; run ckeditor / beforeinput (insertText) + targetRanges in init dict; run ckeditor / beforeinput (insertText), no DOM selection (init dict); run ckeditor / beforeinput (insertText), no getTargetRanges(); run ckeditor / beforeinput, no getTargetRanges(); run ckeditor / synthetic paste, clipboardData shadowed as a proxy object; run lexical / synthetic paste, clipboardData shadowed as a proxy object; run wordgard / beforeinput (insertText) + targetRanges in init dict; run wordgard / beforeinput (insertText), no DOM selection (init dict); run wordgard / beforeinput (insertText), no getTargetRanges(); run wordgard / beforeinput + getTargetRanges(); run wordgard / beforeinput + range, no DOM selection; run wordgard / execCommand("insertHTML")


### influencing code in a same-origin iframe

*same-origin iframe → top document.*

The reverse direction, and the shape an extension's engine iframe has. The editor is ordinary, but the code doing the editing is a function from another realm.

**Chromium 153** — 154 of 154 cells identical to the same-document baseline.

Every cell is identical. Nothing about this context changes the outcome of any strategy.

**Firefox 155** — 132 of 132 cells identical to the same-document baseline.

Every cell is identical. Nothing about this context changes the outcome of any strategy.

**WebKit / Safari 26.6** — 132 of 132 cells identical to the same-document baseline.

Every cell is identical. Nothing about this context changes the outcome of any strategy.

<details><summary>Chromium 153 — what each realm could see</summary>

| probe | what was observed |
| --- | --- |
| ``isTrusted` on a dispatched event` | false |
| `own property on the event, read by the editor's realm` | own property visible → 1 range(s); init dict hidden → 1 range(s) |
| ``event.clipboardData instanceof DataTransfer`, in the editor's realm` | init dict: own property hidden, instanceof DataTransfer true, html true; shadowed: own property visible, instanceof true, html true |
| `DOM selection set by the influencing realm, seen by the editor's realm` | "quick" when set → "quick" once the editors had re-synced |
| ``selectionchange` delivered to the editor's realm` | document+element+window (3) |
| ``targetRanges` in the init dict, honoured cross-realm` | 1 range(s) |
| ``document.execCommand` called from the influencing realm` | true (<b>probe</b>) |
| `one `requestAnimationFrame` in a `display: none` iframe` | fires |
| `a cross-origin iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin "<origin>" from accessing a cross-origin frame. |
| `a `sandbox="allow-scripts"` iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin "<origin>" from accessing a cross-origin frame. |

</details>

<details><summary>Firefox 155 — what each realm could see</summary>

| probe | what was observed |
| --- | --- |
| ``isTrusted` on a dispatched event` | false |
| `own property on the event, read by the editor's realm` | own property visible → 1 range(s); init dict hidden → 1 range(s) |
| ``event.clipboardData instanceof DataTransfer`, in the editor's realm` | init dict: own property hidden, instanceof DataTransfer true, html false; shadowed: own property visible, instanceof true, html true |
| `DOM selection set by the influencing realm, seen by the editor's realm` | "quick" when set → "quick" once the editors had re-synced |
| ``selectionchange` delivered to the editor's realm` | document+element+window (3) |
| ``targetRanges` in the init dict, honoured cross-realm` | 1 range(s) |
| ``document.execCommand` called from the influencing realm` | true (<b>probe</b>) |
| `one `requestAnimationFrame` in a `display: none` iframe` | never fires in a hidden frame |
| `a cross-origin iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property "getSelection" on cross-origin object |
| `a `sandbox="allow-scripts"` iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property "getSelection" on cross-origin object |

</details>

<details><summary>WebKit / Safari 26.6 — what each realm could see</summary>

| probe | what was observed |
| --- | --- |
| ``isTrusted` on a dispatched event` | false |
| `own property on the event, read by the editor's realm` | own property visible → 1 range(s); init dict hidden → 0 range(s) |
| ``event.clipboardData instanceof DataTransfer`, in the editor's realm` | init dict: own property hidden, instanceof DataTransfer true, html true; shadowed: own property visible, instanceof true, html true |
| `DOM selection set by the influencing realm, seen by the editor's realm` | "quick" when set → "quick" once the editors had re-synced |
| ``selectionchange` delivered to the editor's realm` | document+element+window (3) |
| ``targetRanges` in the init dict, honoured cross-realm` | 0 range(s) |
| ``document.execCommand` called from the influencing realm` | true (<b>probe</b><br>) |
| `one `requestAnimationFrame` in a `display: none` iframe` | fires |
| `a cross-origin iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Blocked a frame with origin "<origin>" from accessing a cross-origin frame. Protocols, domains, and ports must match. |
| `a `sandbox="allow-scripts"` iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Sandbox access violation: Blocked a frame at "<origin>" from accessing a cross-origin frame.  The frame being accessed is sandboxed and lacks the "allow-same-origin" flag. |

</details>

Editors threw from their own handlers on these paths (the edit is still ignored):

- **Chromium 153**: run ckeditor / beforeinput (insertText), no getTargetRanges(); run ckeditor / beforeinput, no getTargetRanges(); run ckeditor / synthetic paste, clipboardData shadowed as a proxy object; run lexical / synthetic paste, clipboardData shadowed as a proxy object; run wordgard / beforeinput (insertText), no getTargetRanges(); run wordgard / beforeinput, no getTargetRanges()
- **Firefox 155**: run ckeditor / beforeinput (insertText), no getTargetRanges(); run ckeditor / beforeinput, no getTargetRanges(); run ckeditor / synthetic paste, clipboardData shadowed as a proxy object; run lexical / synthetic paste, clipboardData shadowed as a proxy object; run wordgard / beforeinput (insertText), no getTargetRanges(); run wordgard / beforeinput, no getTargetRanges()
- **WebKit / Safari 26.6**: code-in-iframe / probes; run ckeditor / beforeinput (insertText) + targetRanges in init dict; run ckeditor / beforeinput (insertText), no DOM selection (init dict); run ckeditor / beforeinput (insertText), no getTargetRanges(); run ckeditor / beforeinput, no getTargetRanges(); run ckeditor / synthetic paste, clipboardData shadowed as a proxy object; run lexical / synthetic paste, clipboardData shadowed as a proxy object; run wordgard / beforeinput (insertText) + targetRanges in init dict; run wordgard / beforeinput (insertText), no DOM selection (init dict); run wordgard / beforeinput (insertText), no getTargetRanges(); run wordgard / beforeinput + getTargetRanges(); run wordgard / beforeinput + range, no DOM selection; run wordgard / execCommand("insertHTML")


### extension content script — ISOLATED world (the default)

*extension ISOLATED world → top document.*

What an extension does by default. Same DOM, different world: it can dispatch events on the page's elements, but own properties it defines on them are its own.

**Chromium 153** — 138 of 154 cells identical to the same-document baseline.

| strategy | ProseMirror | Wordgard | Quill 2 | CodeMirror 6 | CKEditor 5 | Lexical | EditContext editor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `beforeinput + getTargetRanges()` | same | — ← replace | — ← replace | same | — ← replace | same | same |
| `beforeinput + range, no DOM selection` | same | — ← replace | — ← replace | same | — ← replace | same | same |
| `beforeinput (insertText) + getTargetRanges()` | same | — ← replace | — ← replace | same | — ← replace | — ← replace | same |
| `beforeinput (deleteContentBackward) + getTargetRanges()` | same | — ← **delete** | same | same | same | same | same |
| `beforeinput (insertText), no DOM selection (override)` | same | — ← replace | — ← replace | same | — ← replace | same | same |
| `synthetic paste, clipboardData shadowed as a proxy object` | same | same | same | same | replace ← — | replace ← — | same |

**Firefox 155** — 94 of 132 cells identical to the same-document baseline.

| strategy | ProseMirror | Wordgard | Quill 2 | CodeMirror 6 | CKEditor 5 | Lexical | EditContext editor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `beforeinput + getTargetRanges()` | same | — ← replace | — ← replace | same | — ← replace | — ← replace | n/a |
| `beforeinput, no getTargetRanges()` | same | same | same | same | same | — ← replace | n/a |
| `beforeinput + range, no DOM selection` | same | — ← replace | — ← replace | same | — ← replace | same | n/a |
| `beforeinput (insertText) + getTargetRanges()` | same | — ← replace | — ← replace | same | — ← replace | — ← replace | n/a |
| `beforeinput (deleteContentBackward) + getTargetRanges()` | same | — ← **delete** | same | same | same | same | n/a |
| `beforeinput (insertText), no DOM selection (override)` | same | — ← replace | — ← replace | same | — ← replace | same | n/a |
| `synthetic paste, clipboardData shadowed as a proxy object` | — ← replace | — ← caret | **delete** ← replace | **delete** ← replace | same | same | n/a |
| `synthetic paste, clipboardData shadowed as the real DataTransfer` | — ← replace | — ← caret | **delete** ← replace | **delete** ← replace | — ← replace | — ← replace | n/a |
| `synthetic paste, real DataTransfer + yield one frame` | — ← replace | — ← replace | **delete** ← replace | **delete** ← replace | — ← replace | — ← replace | n/a |
| `paste via beforeinput (insertFromPaste), paste as backup` | — ← replace | — ← replace | **delete** ← replace | **delete** ← replace | — ← replace | — ← replace | n/a |

<details><summary>Chromium 153 — what each realm could see</summary>

| probe | what was observed |
| --- | --- |
| ``isTrusted` on a dispatched event` | false |
| `own property on the event, read by the editor's realm` | own property hidden → 0 range(s); init dict hidden → 1 range(s) |
| ``event.clipboardData instanceof DataTransfer`, in the editor's realm` | init dict: own property hidden, instanceof DataTransfer true, html true; shadowed: own property hidden, instanceof false, html false |
| `DOM selection set by the influencing realm, seen by the editor's realm` | "quick" when set → "quick" once the editors had re-synced |
| ``selectionchange` delivered to the editor's realm` | document+element+window (3) |
| ``targetRanges` in the init dict, honoured cross-realm` | 1 range(s) |
| ``document.execCommand` called from the influencing realm` | true (<b>probe</b>) |
| `one `requestAnimationFrame` in a `display: none` iframe` | fires |
| `a cross-origin iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin "<origin>" from accessing a cross-origin frame. |
| `a `sandbox="allow-scripts"` iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin "<origin>" from accessing a cross-origin frame. |

</details>

<details><summary>Firefox 155 — what each realm could see</summary>

| probe | what was observed |
| --- | --- |
| ``isTrusted` on a dispatched event` | false |
| `own property on the event, read by the editor's realm` | own property hidden → 0 range(s); init dict hidden → 1 range(s) |
| ``event.clipboardData instanceof DataTransfer`, in the editor's realm` | init dict: own property hidden, instanceof DataTransfer true, html false; shadowed: own property hidden, instanceof true, html false |
| `DOM selection set by the influencing realm, seen by the editor's realm` | "quick" when set → "quick" once the editors had re-synced |
| ``selectionchange` delivered to the editor's realm` | document+element+window (3) |
| ``targetRanges` in the init dict, honoured cross-realm` | 1 range(s) |
| ``document.execCommand` called from the influencing realm` | true (<b>probe</b>) |
| `one `requestAnimationFrame` in a `display: none` iframe` | never fires in a hidden frame |
| `a cross-origin iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property "getSelection" on cross-origin object |
| `a `sandbox="allow-scripts"` iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property "getSelection" on cross-origin object |

</details>

Editors threw from their own handlers on these paths (the edit is still ignored):

- **Chromium 153**: run ckeditor / beforeinput (insertText) + getTargetRanges(); run ckeditor / beforeinput (insertText), no DOM selection (override); run ckeditor / beforeinput (insertText), no getTargetRanges(); run ckeditor / beforeinput + getTargetRanges(); run ckeditor / beforeinput + range, no DOM selection; run ckeditor / beforeinput, no getTargetRanges(); run wordgard / beforeinput (insertText) + getTargetRanges(); run wordgard / beforeinput (insertText), no DOM selection (override); run wordgard / beforeinput (insertText), no getTargetRanges(); run wordgard / beforeinput + getTargetRanges(); run wordgard / beforeinput + range, no DOM selection; run wordgard / beforeinput, no getTargetRanges()
- **Firefox 155**: run ckeditor / beforeinput (insertText) + getTargetRanges(); run ckeditor / beforeinput (insertText), no DOM selection (override); run ckeditor / beforeinput (insertText), no getTargetRanges(); run ckeditor / beforeinput + getTargetRanges(); run ckeditor / beforeinput + range, no DOM selection; run ckeditor / beforeinput, no getTargetRanges(); run wordgard / beforeinput (insertText) + getTargetRanges(); run wordgard / beforeinput (insertText), no DOM selection (override); run wordgard / beforeinput (insertText), no getTargetRanges(); run wordgard / beforeinput + getTargetRanges(); run wordgard / beforeinput + range, no DOM selection; run wordgard / beforeinput, no getTargetRanges()


### extension content script — MAIN world (injected into the page)

*page's own world → top document.*

The control. Identical code, injected into the page's world instead. Anything that differs from the isolated world is the world, not the extension.

**Chromium 153** — 154 of 154 cells identical to the same-document baseline.

Every cell is identical. Nothing about this context changes the outcome of any strategy.

**Firefox 155** — 132 of 132 cells identical to the same-document baseline.

Every cell is identical. Nothing about this context changes the outcome of any strategy.

<details><summary>Chromium 153 — what each realm could see</summary>

| probe | what was observed |
| --- | --- |
| ``isTrusted` on a dispatched event` | false |
| `own property on the event, read by the editor's realm` | own property visible → 1 range(s); init dict hidden → 1 range(s) |
| ``event.clipboardData instanceof DataTransfer`, in the editor's realm` | init dict: own property hidden, instanceof DataTransfer true, html true; shadowed: own property visible, instanceof true, html true |
| `DOM selection set by the influencing realm, seen by the editor's realm` | "quick" when set → "quick" once the editors had re-synced |
| ``selectionchange` delivered to the editor's realm` | document+element+window (3) |
| ``targetRanges` in the init dict, honoured cross-realm` | 1 range(s) |
| ``document.execCommand` called from the influencing realm` | true (<b>probe</b>) |
| `one `requestAnimationFrame` in a `display: none` iframe` | fires |
| `a cross-origin iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin "<origin>" from accessing a cross-origin frame. |
| `a `sandbox="allow-scripts"` iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin "<origin>" from accessing a cross-origin frame. |

</details>

<details><summary>Firefox 155 — what each realm could see</summary>

| probe | what was observed |
| --- | --- |
| ``isTrusted` on a dispatched event` | false |
| `own property on the event, read by the editor's realm` | own property visible → 1 range(s); init dict hidden → 1 range(s) |
| ``event.clipboardData instanceof DataTransfer`, in the editor's realm` | init dict: own property hidden, instanceof DataTransfer true, html false; shadowed: own property visible, instanceof true, html true |
| `DOM selection set by the influencing realm, seen by the editor's realm` | "quick" when set → "quick" once the editors had re-synced |
| ``selectionchange` delivered to the editor's realm` | document+element+window (3) |
| ``targetRanges` in the init dict, honoured cross-realm` | 1 range(s) |
| ``document.execCommand` called from the influencing realm` | true (<b>probe</b>) |
| `one `requestAnimationFrame` in a `display: none` iframe` | never fires in a hidden frame |
| `a cross-origin iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property "getSelection" on cross-origin object |
| `a `sandbox="allow-scripts"` iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property "getSelection" on cross-origin object |

</details>

Editors threw from their own handlers on these paths (the edit is still ignored):

- **Chromium 153**: run ckeditor / beforeinput (insertText), no getTargetRanges(); run ckeditor / beforeinput, no getTargetRanges(); run ckeditor / synthetic paste, clipboardData shadowed as a proxy object; run lexical / synthetic paste, clipboardData shadowed as a proxy object; run wordgard / beforeinput (insertText), no getTargetRanges(); run wordgard / beforeinput, no getTargetRanges()
- **Firefox 155**: run ckeditor / beforeinput (insertText), no getTargetRanges(); run ckeditor / beforeinput, no getTargetRanges(); run ckeditor / synthetic paste, clipboardData shadowed as a proxy object; run lexical / synthetic paste, clipboardData shadowed as a proxy object; run wordgard / beforeinput (insertText), no getTargetRanges(); run wordgard / beforeinput, no getTargetRanges()


### extension content script, editor in a same-origin iframe

*extension ISOLATED world → same-origin iframe.*

The hardest combination, and the one Google Docs and Word for the web actually present: a content script in its own world editing an editor in another document.

**Chromium 153** — 138 of 154 cells identical to the same-document baseline.

| strategy | ProseMirror | Wordgard | Quill 2 | CodeMirror 6 | CKEditor 5 | Lexical | EditContext editor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `beforeinput + getTargetRanges()` | same | — ← replace | — ← replace | same | — ← replace | same | same |
| `beforeinput + range, no DOM selection` | same | — ← replace | — ← replace | same | — ← replace | same | same |
| `beforeinput (insertText) + getTargetRanges()` | same | — ← replace | — ← replace | same | — ← replace | — ← replace | same |
| `beforeinput (deleteContentBackward) + getTargetRanges()` | same | — ← **delete** | same | same | same | same | same |
| `beforeinput (insertText), no DOM selection (override)` | same | — ← replace | — ← replace | same | — ← replace | same | same |
| `synthetic paste, clipboardData shadowed as a proxy object` | same | same | same | same | replace ← — | replace ← — | same |

**Firefox 155** — 89 of 132 cells identical to the same-document baseline.

| strategy | ProseMirror | Wordgard | Quill 2 | CodeMirror 6 | CKEditor 5 | Lexical | EditContext editor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `beforeinput + getTargetRanges()` | same | — ← replace | — ← replace | same | — ← replace | — ← replace | n/a |
| `beforeinput, no getTargetRanges()` | same | same | same | same | same | — ← replace | n/a |
| `beforeinput + range, no DOM selection` | same | — ← replace | — ← replace | same | — ← replace | same | n/a |
| `beforeinput (insertText) + getTargetRanges()` | same | — ← replace | — ← replace | same | — ← replace | — ← replace | n/a |
| `beforeinput (deleteContentBackward) + getTargetRanges()` | same | — ← **delete** | same | same | same | same | n/a |
| `beforeinput (insertText) + targetRanges in init dict` | same | replace / — ← replace | same | same | same | same | n/a |
| `beforeinput (deleteContentBackward) + targetRanges in init dict` | same | **delete** / — ← **delete** | same | same | same | same | n/a |
| `beforeinput (insertText), no DOM selection (override)` | same | — ← replace | — ← replace | same | — ← replace | same | n/a |
| `beforeinput (insertText), no DOM selection (init dict)` | same | replace / — ← replace | same | same | same | same | n/a |
| `synthetic paste, clipboardData shadowed as a proxy object` | — ← replace | — ← caret | **delete** ← replace | **delete** ← replace | same | same | n/a |
| `synthetic paste, clipboardData shadowed as the real DataTransfer` | — ← replace | — ← caret | **delete** ← replace | **delete** ← replace | — ← replace | — ← replace | n/a |
| `synthetic paste, yield one frame first` | same | same | **delete** / — ← **delete** | **delete** / — ← **delete** | same | same | n/a |
| `synthetic paste, real DataTransfer + yield one frame` | replace / — ← replace | replace / — ← replace | **delete** / replace / — ← replace | **delete** / replace / — ← replace | replace / — ← replace | — ← replace | n/a |
| `paste via beforeinput (insertFromPaste), paste as backup` | — ← replace | — ← replace | **delete** ← replace | **delete** ← replace | — ← replace | — ← replace | n/a |

<details><summary>Chromium 153 — what each realm could see</summary>

| probe | what was observed |
| --- | --- |
| ``isTrusted` on a dispatched event` | false |
| `own property on the event, read by the editor's realm` | own property hidden → 0 range(s); init dict hidden → 1 range(s) |
| ``event.clipboardData instanceof DataTransfer`, in the editor's realm` | init dict: own property hidden, instanceof DataTransfer true, html true; shadowed: own property hidden, instanceof false, html false |
| `DOM selection set by the influencing realm, seen by the editor's realm` | "quick" when set → "quick" once the editors had re-synced |
| ``selectionchange` delivered to the editor's realm` | document+element+window (3) |
| ``targetRanges` in the init dict, honoured cross-realm` | 1 range(s) |
| ``document.execCommand` called from the influencing realm` | true (<b>probe</b>) |
| `one `requestAnimationFrame` in a `display: none` iframe` | fires |
| `a cross-origin iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin "<origin>" from accessing a cross-origin frame. |
| `a `sandbox="allow-scripts"` iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin "<origin>" from accessing a cross-origin frame. |

</details>

<details><summary>Firefox 155 — what each realm could see</summary>

| probe | what was observed |
| --- | --- |
| ``isTrusted` on a dispatched event` | false |
| `own property on the event, read by the editor's realm` | own property hidden → 0 range(s); init dict hidden → 1 range(s) |
| ``event.clipboardData instanceof DataTransfer`, in the editor's realm` | init dict: own property hidden, instanceof DataTransfer true, html false; shadowed: own property hidden, instanceof true, html false |
| `DOM selection set by the influencing realm, seen by the editor's realm` | "quick" when set → "quick" once the editors had re-synced |
| ``selectionchange` delivered to the editor's realm` | document+element+window (3) |
| ``targetRanges` in the init dict, honoured cross-realm` | 1 range(s) |
| ``document.execCommand` called from the influencing realm` | true (<b>probe</b>) |
| `one `requestAnimationFrame` in a `display: none` iframe` | never fires in a hidden frame |
| `a cross-origin iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property "getSelection" on cross-origin object |
| `a `sandbox="allow-scripts"` iframe, from the parent document` | contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property "getSelection" on cross-origin object |

</details>

Editors threw from their own handlers on these paths (the edit is still ignored):

- **Chromium 153**: run ckeditor / beforeinput (insertText) + getTargetRanges(); run ckeditor / beforeinput (insertText), no DOM selection (override); run ckeditor / beforeinput (insertText), no getTargetRanges(); run ckeditor / beforeinput + getTargetRanges(); run ckeditor / beforeinput + range, no DOM selection; run ckeditor / beforeinput, no getTargetRanges(); run wordgard / beforeinput (insertText) + getTargetRanges(); run wordgard / beforeinput (insertText), no DOM selection (override); run wordgard / beforeinput (insertText), no getTargetRanges(); run wordgard / beforeinput + getTargetRanges(); run wordgard / beforeinput + range, no DOM selection; run wordgard / beforeinput, no getTargetRanges()
- **Firefox 155**: run ckeditor / beforeinput (insertText) + getTargetRanges(); run ckeditor / beforeinput (insertText), no DOM selection (override); run ckeditor / beforeinput (insertText), no getTargetRanges(); run ckeditor / beforeinput + getTargetRanges(); run ckeditor / beforeinput + range, no DOM selection; run ckeditor / beforeinput, no getTargetRanges(); run wordgard / beforeinput (insertText) + getTargetRanges(); run wordgard / beforeinput (insertText), no DOM selection (override); run wordgard / beforeinput (insertText), no getTargetRanges(); run wordgard / beforeinput + getTargetRanges(); run wordgard / beforeinput + range, no DOM selection; run wordgard / beforeinput, no getTargetRanges()


Editors: ProseMirror 1.42.5, Wordgard 0.5.2, Quill 2 2.0.3, CodeMirror 6 6.43.13, CKEditor 5 5.41.4, Lexical 0.52.0, EditContext editor 0.1.0.

<!-- END GENERATED TABLES -->

## What the numbers say

**1. `targetRanges` in the init dict works in Chromium and Firefox; only WebKit
needs the method shadowed.** This is the cheapest possible fix for a spec'd
feature that is implemented in two of three engines, and it is invisible: WebKit
accepts `targetRanges` in the initializer without complaint and then reports an
empty target range. Sending both costs nothing and covers all three. Note also
that `getTargetRanges()` must be read *before* dispatch — an engine that took the
range from the init dict clears it afterwards.

> Tracked upstream as [WebKit bug 170416 — *Support
> `InputEventInit.{inputType, dataTransfer, isComposing, targetRanges}`*](https://bugs.webkit.org/show_bug.cgi?id=170416)
> (open since 2017, [PR 19346](https://github.com/WebKit/WebKit/pull/19346)
> attached, not landed). This repo's measurement is the failing half of that
> bug, per editor and per strategy: [`beforeinput (insertText) + targetRanges in
> init dict` is the only row where WebKit loses](#webkit--safari-266).

**2. After changing the selection, yield the thread before dispatching — and
yield a *frame*, not a task.** Wordgard syncs its selection model asynchronously,
so a paste dispatched in the same task as the `selectionchange` goes to its stale
caret and the target word survives. Measured in Chromium and WebKit:

| before the paste | Chromium | WebKit |
| --- | --- | --- |
| no yield | pastes at the caret | pastes at the caret |
| one microtask (`await Promise.resolve()`) | pastes at the caret | pastes at the caret |
| one task (`setTimeout(…, 0)`) | **replaces the word** | **pastes at the caret** |
| one animation frame | **replaces the word** | **replaces the word** |
| 16 ms, 150 ms | replaces the word | replaces the word |

A microtask is not a yield for this purpose. Duration stops mattering after one
frame: 150 ms and 16 ms measure identically in every engine and every editor, so
there is nothing to gain from waiting longer. And `setTimeout(0)` is *not* a
sufficient yield in WebKit — it measures 0 ms and fires without an intervening
frame, so Wordgard still has not seen the selection. One `requestAnimationFrame`
is the smallest yield that works in both. Nothing else about the paste changes:
the same event, same clipboard, different moment. This is why the naive paste
row reads "at caret" for Wordgard and the yielded rows do not, and it is a
general rule for any editor-driven tool, not specific to paste — an editor whose
selection model is asynchronous will ignore a selection you set in the same task.

**3. Firefox's paste is fixable, but only by shadowing `clipboardData` with the
real `DataTransfer`.** Firefox accepts the init-dict `clipboardData` and hands
the editor a *real but empty* `DataTransfer` — `instanceof DataTransfer` is true,
its contents are gone. Overriding the property with the `DataTransfer` you already
built fixes every editor that has a paste path. The version of this workaround
that circulates — a hand-rolled `{ getData, setData }` object — fixes four of the
measured editors in Firefox but **breaks CKEditor and Lexical in every engine**,
where it does nothing *and throws*, because the object is not a real
`DataTransfer`:

| how the clipboard is supplied | ProseMirror | Wordgard | Quill 2 | CodeMirror 6 | CKEditor 5 | Lexical | EditContext editor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `clipboardData` in the init dict (Firefox) | — | — | **delete** | **delete** | — | — | n/a |
| shadowed as a `{getData, setData}` proxy | replace | replace | replace | replace | **throws** | **throws** | n/a |
| shadowed as the real `DataTransfer` | **replace** | **replace** | **replace** | **replace** | **replace** | **replace** | n/a |

(The EditContext editor has no Firefox column — the API it needs has not shipped
there — and in Chromium it has no paste path to fix: it listens for
`beforeinput(insertFromPaste)`, not for `paste`, so every paste row is unchanged
and nothing ever touches the clipboard object, the proxy included.)

The proxy is the trap: it looks like the fix and silently regresses CKEditor
and Lexical everywhere. The same shape applies to `targetRanges` in finding 1 — shadow with
the real object, not a lookalike.

> Tracked upstream as [Mozilla bug 2027025 — *ClipboardEvent constructor does
> not set `clipboardData`*](https://bugzilla.mozilla.org/show_bug.cgi?id=2027025)
> (Core :: DOM: Copy & Paste and Drag & Drop, unconfirmed). The ticket's
> repro is this repo's finding 3 verbatim — `getData()` returns the data in
> Chrome and `""` in Firefox — and it cites the same spec line: for synthetic
> events the drag data store is the data the creating script added. The
> per-editor consequence is the `**delete**` cells in the Firefox table above:
> the editor wipes the selection, then pastes nothing.

Neither fix is sufficient on its own: the clipboard one leaves Wordgard pasting at
its stale caret, and the yield one cannot repair an empty clipboard. **Applied
together — real `DataTransfer` plus one animation frame — all six contenteditable
editors replace correctly in all three engines.** It was the only row in the
whole table with a clean sweep until the two-step paste row (finding 14) earned
the same distinction by answering both paste shapes — and it remains the
configuration to copy:

```js
const dataTransfer = new DataTransfer();
dataTransfer.setData("text/plain", text);
dataTransfer.setData("text/html", html);

const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, composed: true });
Object.defineProperty(event, "clipboardData", { value: dataTransfer });

target.focus();
// …set the DOM selection and fire selectionchange at document, element and window…
await new Promise((resolve) => requestAnimationFrame(resolve));  // the yield
target.dispatchEvent(event);
```

On the page, set *Hand the clipboard* to **shadowed as the real `DataTransfer`**,
*Yield* to **one animation frame**, and press *Replace via synthetic paste, after
the yield above*.

**4. No engine and no editor honours a synthetic `beforeinput` without a target
range, whichever way the range is supplied — except Lexical, which does not want
the range at all.** Three of the seven editors implement the event as Quill does,
and each of them bails on a missing range.
Quill's `handleBeforeInput` is explicit about it:

```js
const range = event.getTargetRanges ? event.getTargetRanges()[0] : null;
if (!range || range.collapsed === true) return;
```

Wordgard reads `getTargetRanges()[0]` and maps it into document positions, but
only *after* checking it exists — and if it does not, it throws rather than
returning quietly (see finding 9). ProseMirror and CodeMirror 6 do not implement
`beforeinput` for insertion at all: ProseMirror's built-in handler is `if (android
&& event.inputType == "deleteContentBackward")`. So supplying the range is not an
optimisation — for the editors that implement the event, it is the difference
between working and doing nothing.

Lexical is the exception that proves the rule from the other side: it *does*
handle `beforeinput`, but it never aims with the target range — for a
`beforeinput` it re-derives its selection from the DOM selection and takes the
replacement from `event.dataTransfer` where the engine kept the init dict
(Chromium and Firefox) or falls back to `event.data` where it did not (WebKit).
So `insertReplacementText` replaces with or without `getTargetRanges()` — the
only editor with a working no-range row. Its `insertText`
path is stricter: without a non-collapsed target range it hands the event back to
the browser's default action, and a synthetic event has none, so nothing happens.
The result is a mirror image of the other editors: they need the range and not
the selection, Lexical needs the selection and — for `insertText` — the range too.
The EditContext editor is the second no-range editor, for a different reason: its
`beforeinput` handler takes `insertReplacementText` straight from `event.data`
(the range appears nowhere in its code path), while `insertText` and the
`delete*` types are left to the EditContext buffer, which only the browser's own
input pipeline drives.

**5. The `inputType` you choose decides whether an editor acts at all.**
`insertReplacementText` and `insertText` are both "replace the selection", and
editors implement different ones. Wordgard handles `insertText`, the `delete*`
types, and `insertReplacementText` — but that last one only through
`event.dataTransfer`, which Chromium and Firefox fill in from the init dict and
WebKit drops (finding 7). So Wordgard's `insertReplacementText` is live in two
engines and dead in the third, where it does not just do nothing but throws on
the null transfer (finding 9). Quill and CKEditor handle either inputType
everywhere; Lexical does too, but asymmetrically — `insertReplacementText`
without a target range, `insertText` only with one. The EditContext editor is
asymmetric in the extreme: `insertReplacementText` works off `event.data`,
`insertText` and the delete types are its buffer's business and a synthetic
event of those types does nothing at all. An integration that picks one
`inputType` and never tries the other looks like a broken editor when it is
really a mismatched `inputType`.

**6. Firefox turns a synthetic paste into a deletion.** Firefox does not accept
`clipboardData` in the `ClipboardEvent` init dict, so the event arrives with an
empty clipboard. Quill and CodeMirror then paste nothing over the selection,
which *removes the target word*: the document changes, the page reports a change,
and a naive success check passes. ProseMirror, Wordgard, CKEditor and Lexical do
nothing — Lexical's paste handler bails on an empty clipboard rather than pasting
emptiness over the selection.
Chromium and WebKit both honour `clipboardData` and replace correctly. This is the
single most important row in the tables: the failure mode is not "the edit did
not happen", it is "the user's word is gone" — and finding 3 shows it is fixable.

**7. `dataTransfer` in the `InputEvent` init dict is honoured by two of the three
engines — WebKit is the one that drops it.** Chromium and Firefox keep the
`dataTransfer` passed in the init dict, contents included; WebKit's
`event.dataTransfer` comes back `null`. (The capability probe used to get this
wrong by constructing its test event *without* a `dataTransfer` in the dict and
reporting `null` in every engine; fixing the probe is what surfaced this.)
Wordgard's `insertReplacementText` handling is the clearest demonstration:

```js
let read = readClipboard(wg.state, event.dataTransfer, wg.state.sel.head, true);
if (read) wg.dispatch({ changes: { from, to, insert: read.slice, … } });
```

That branch is what performs Wordgard's row-one replacement in Chromium and
Firefox — and in WebKit, where `event.dataTransfer` is `null`, the unguarded
`data.getData` throws on the way (a recorded page error, not a silent no-op).
Lexical is the editor that becomes formatting-aware through this route: it
inserts the `text/html` flavour wherever the init dict survived, so bold `quick`
becomes *sluggish*; where it did not, it falls back to `event.data` and applies
the replacement with whatever marks the replaced range already carried — bold
`quick` becomes **bold** `sluggish`, the same rule Quill and CKEditor follow
everywhere. Only `paste` and `execCommand` install new marks in every engine.
In Firefox's isolated world the transfer crosses as an object but arrives
*empty* — the same bug as the `ClipboardEvent` init dict — which is why
Wordgard's and Lexical's `insertReplacementText` rows go dark there too.

**8. `execCommand` behaves differently in Safari, and this is w3c/editing#200.**
CKEditor 5 ignores `execCommand("insertHTML")` in Chromium and Firefox but
*applies* it in WebKit. The mechanism is the question that issue asks: Safari
dispatches a `beforeinput` event for `execCommand`, and CKEditor — blind to
`execCommand` itself — reacts to the event. Chromium dispatches no `beforeinput`
for `execCommand`, so nothing happens. An editor integration cannot be reasoned
about from one engine.

**9. Wordgard 0.5.2 throws on a `beforeinput` that carries no target range.**
`InputState.beforeInput` dereferences `range.from` without checking that a range
was derived from `getTargetRanges()`, so the failure mode for "you forgot to
attach the target range" is a `TypeError` in the editor's own handler, in every
engine, rather than a silent no-op. CKEditor 5 has the same shape of problem on a
different path: it throws `Cannot read properties of null (reading 'root')` for
the same event. Lexical joins them from the paste path: handed the
`{ getData, setData }` clipboard lookalike, its `eventFiles` helper reads
`clipboardData.types` — which the lookalike does not carry — and throws on the
`undefined` result, in every engine, because the throw is the lookalike's fault,
not the engine's. All of these are asserted by the test suite, so a library
update that fixes or worsens them is noticed.

**10. The keydown path is not dead, it is editor-specific.** Quill 2, CodeMirror 6
and Lexical all apply a faked `Backspace` natively, in all three browsers,
because each implements it in an ordinary `keydown` handler (Quill through its
keyboard bindings, CodeMirror through `defaultKeymap`, Lexical by mapping the key
to its own delete-character command). ProseMirror, Wordgard, CKEditor 5 and the
EditContext editor do not. ProseMirror leaves Backspace to the browser and reads
the mutation back through its `MutationObserver`, so a scripted keypress — which
has no default action — cannot work; the EditContext editor's Backspace is
applied to the EditContext buffer by the browser, which a scripted keypress
cannot drive either. The same synthetic keydown is the best option for three
editors and useless for the other four, which is the argument for a ladder
rather than a single bet.

**11. Synthetic `paste` is the only strategy that works broadly when the browser
cooperates — and the only one that cannot be aimed.** Five of the seven editors
handle `ClipboardEvent("paste")` with a populated `DataTransfer` out of the box
in Chromium and WebKit, and honour the `text/html` flavour. The two exceptions
are the newest: Lexical, which has no paste selection to fall back to when none
was set and does nothing at all, and the EditContext editor, which has no `paste`
listener at all — its paste arrives as `beforeinput(insertFromPaste)` on an
EditContext host, so a synthetic paste event addresses a door that is not there.
The two-step row (finding 14) dispatches that door's event first and falls back
to the paste event, which is why it is a clean sweep where this row is not. For the five, a `ClipboardEvent`
has no target-range concept at all, so the editor falls back to its *current*
selection: with no DOM selection set, every editor inserts the replacement at the
caret and leaves the target word intact. Wordgard also pasted at the caret *with*
the selection set, until it turned out to be a timing problem rather than a
capability one — see finding 2.

**12. `execCommand` leaves `&nbsp;` behind.** Chromium re-serialises a space
adjacent to an inline element inside `contenteditable` as `&nbsp;`, so after
`execCommand("insertHTML", …)` both ProseMirror and Quill end up with
`The&nbsp;<em>sluggish</em>&nbsp;brown…` where the surrounding text used ordinary
spaces. Harmless to a reader, but it changes the document's text, so anything
comparing text before and after has to expect it. Lexical shows the third
possible attitude: nothing survives — its model re-asserts itself and the
document ends up exactly as it was. The EditContext editor the fourth:
`execCommand` looks for an editable region, finds a plain div, and does nothing.

**13. Read the result a tick after dispatching, or you will measure a lie.**
Editors apply their change on their own schedule, not inside the event handler:
Wordgard defers its DOM write. Reading the text in the same task as the dispatch
reported "unchanged" for a WebKit deletion that had in fact happened, and made the
recorded tables disagree with themselves. `verifyEdit` now settles before it reads.

**14. The strategy ladder is a contenteditable ladder.** The EditContext editor —
measured in Chromium, the only engine with the API — is the demonstration of what
happens to this whole matrix when the editor is not contenteditable: its editable
surface is a plain focusable div with an `EditContext` attached, its document is
the editor's own JSON model, and its caret is drawn by the library. Of the
twenty-two cells, exactly four do anything. Three belong to
`beforeinput insertReplacementText`, which replaces through `event.data` at
whatever the model selection is — aim it by setting the DOM selection (the
editor maps it back), and without a selection it inserts at the caret, position
0, leaving the target word intact. The fourth is the two-step paste row: its
`beforeinput(insertFromPaste)` event is handled — formatting-aware, since the
editor reads the `text/html` flavour — while for the six contenteditable editors
that first event does nothing and the backup paste carries the row to `replace`
in all three engines, which makes it the second clean-sweep row in the tables
(finding 3).
Everything else is structural, not stubbornness: `insertText` and the
`delete*` types are applied to the EditContext *buffer* by the browser and
reported back as `textupdate`, which a synthetic event cannot drive; Backspace
takes the same buffer path; `execCommand` finds no editable region to operate
on. Eighteen of twenty-two cells read unchanged — the strategies are not
reaching the editor's input surface, they are reaching contenteditable's. What
works against such an editor is the same events with different shapes, plus the
model's own API for everything else.

### For browser developers

Two of the thirteen are engine bugs rather than editor bugs, and both are the
reason a workaround exists at all — every row above that needs a shadowed
property is a row that would need nothing if the init dict worked. Each is
measured here per editor and per strategy, with the resulting text asserted, so
a fix can be verified against the same table:

| engine | bug | what this repo measures | what a fix changes |
| --- | --- | --- | --- |
| WebKit | [170416 — *Support `InputEventInit.{… targetRanges}`*](https://bugs.webkit.org/show_bug.cgi?id=170416) (open since 2017; [PR 19346](https://github.com/WebKit/WebKit/pull/19346) attached, unlanded) | [`beforeinput (insertText) + targetRanges in init dict`](#webkit--safari-266) reports an empty range for Wordgard, Quill 2, CodeMirror 6, ProseMirror and Lexical; CKEditor 5 alone still deletes, because it takes the range from the shadowed method | that row joins the two engines that already pass, and the shadowed-`getTargetRanges()` route — the own property that cannot cross an isolated world — stops being load-bearing on WebKit |
| Firefox | [2027025 — *ClipboardEvent constructor does not set `clipboardData`*](https://bugzilla.mozilla.org/show_bug.cgi?id=2027025) (unconfirmed) | the [`synthetic paste` rows in Firefox](#firefox-155) hand the editor a real-but-empty `DataTransfer`: ProseMirror, CKEditor 5 and Lexical do nothing, Quill 2 and CodeMirror 6 wipe the selection and insert nothing | the paste stops needing the real-`DataTransfer` shadow — which is the own property that costs Firefox extensions their paste path from an isolated world |

Both fixes land in the *spec'd* route, which is the route that survives an
extension's isolated world. As long as they are open, the practical recipe is:
send both supply routes, shadow with the real object (never a lookalike), and on
Firefox inject a main-world bootstrap when the strategy is a paste.

## When the code is not in the same realm

Everything above has one piece of JavaScript doing both jobs: building the event
and being the editor it is sent to. Two very common situations break that
assumption, and they break it in different ways:

- **the editor is in an iframe** — a second realm, reachable because the origin
  matches, but with its *own* `InputEvent`, `DataTransfer`, `StaticRange` and
  `ClipboardEvent` constructors;
- **the code is in an extension** — a content script in an *isolated world*,
  which shares the DOM with the page but has its own JavaScript realm, its own
  constructors, and no way to be reached from the page.

Both are measured here with the full 22-row matrix, and the delta tables in the
generated block above say exactly which cells changed. The mechanism behind them
is measured by the **probes**, which ask one question per step of the recipe and
answer it in whichever realm the editor lives in:

| probe | the question |
| --- | --- |
| `isTrusted` | can any realm make a synthetic event look real? |
| `expando` | does an own property written onto the event by the influencing realm reach the editor's realm? |
| `clipboard` | does the DataTransfer the influencing realm built satisfy the editor's own `instanceof DataTransfer`? |
| `targetRanges-init-dict` | does the spec'd init-dict route cross where the own property does not? |
| `selection` / `selectionchange` | does the selection cross, and which of document/element/window in the editor's realm hear about it? |
| `execCommand` | does the one strategy that is not an event survive the crossing? |
| `raf-hidden` | does the frame yield the paste path depends on ever arrive in a hidden frame? |
| `cross-origin` / `sandboxed` | what is reachable when the origin does not match? |

### What the iframe says

**Nothing is blocked by a same-origin iframe in Chromium, and one editor loses
its beforeinput behaviour in Firefox and WebKit.** Both iframe directions were
measured against the same-document baseline, cell for cell:

- Chromium: all 154 cells identical in both directions.
- Firefox: 132 of 132 identical with the code in the iframe; 118 of 132 with the
  *editor* in the iframe — every difference is a Wordgard `beforeinput` or paste
  row inside the frame.
- WebKit: the same shape as Firefox (120 of 132, all Wordgard).

The explanation is in the probes, not in the matrix. The selection the parent
sets *is* visible inside the frame — the probe reads `"quick"` the instant it is
set, in all three engines, and all three places (document, element, window) in
the frame hear the `selectionchange`. But Wordgard re-syncs its own selection
model asynchronously when it observes that event, and inside a frame in Firefox
and WebKit that re-sync leaves the DOM selection empty, so the edit it finally
dispatches goes nowhere. The same rows are fine in Chromium. This is finding 2 of the same-document section seen from another realm: an
editor whose selection model is asynchronous will ignore a selection set in the
same task, and *where the editor lives* decides how badly that bites.

Everything else — ProseMirror, Quill 2, CodeMirror 6, CKEditor 5, Lexical, the
EditContext editor, and every paste, `execCommand` and faked-keypress row in
every engine — is unchanged by an iframe. Notably, the two steps that depend on own properties written onto the
event survive: a same-origin frame's expandos *do* cross realms in all three
engines, so the shadowed `getTargetRanges()` still works in WebKit and the
shadowed real `DataTransfer` still satisfies CKEditor's `instanceof` check.

### What the extension says

The extension injects **two content scripts with byte-identical code** — one in the
default ISOLATED world, one in the page's own world (`"world": "MAIN"`) — and the
same eight buttons are driven through either. MAIN is the control, and it is
unambiguous:

| context | Chromium | Firefox |
| --- | --- | --- |
| MAIN world (injected into the page) | 154 of 154 cells identical to the same-document baseline | 132 of 132 identical |
| ISOLATED world (the default) | 138 of 154 identical | 94 of 132 identical |

**MAIN is perfect in both engines: an extension per se blocks nothing.** Every
difference below is caused by the isolated world alone, and the delta tables in
the generated block spell out which cells. The mechanism is the probes, and it is
one sentence long: **an own property belongs to the realm that wrote it, and an
isolated world is another realm.**

- Every `beforeinput` row that depends on the shadowed `getTargetRanges()` stops
  working for Wordgard, Quill 2 and CKEditor 5, in both engines. The probe says
  it directly: the editor's realm reports the range as `own property hidden →
  0 range(s)` while `targetRanges` in the init dict still arrives as
  `1 range(s)`. Lexical — which does not need the range, only the DOM selection
  and the init-dict `dataTransfer` — is the interesting edge: in Chromium its
  `insertReplacementText` rows survive the isolated world untouched, while in
  Firefox they go dark with the paste rows, because the `dataTransfer` it reads
  crosses the world as an object but arrives empty — Firefox's init-dict bug
  again, on the InputEvent this time.
- The **init-dict rows keep working** — `targetRanges` in the constructor is
  spec'd, needs no own property, and crosses the world. That is the route to
  use from an isolated world in Chromium and Firefox, and it is why the
  same-document advice (send both) is even more important here.
- The **paste** is where the two engines part company. In Chromium the
  init-dict `clipboardData` carries its contents across the world, so every
  paste row survives — including CKEditor's and Lexical's, which now *work*
  with the proxy object that breaks them in the same-document case, because
  the proxy never reaches the editor at all and the engine's own DataTransfer
  does. In Firefox
  the paste path is dead from the isolated world: the DataTransfer the editor
  gets is empty, and the real-`DataTransfer` shadow that fixes it in the
  same-document case cannot be applied, because it is an own property. Firefox's
  paste rows go from `replace` (baseline, shadowed) to `deleted` or unchanged.
- The **EditContext editor is identical to its baseline in every measured
  context**, isolated world included: its two working strategies need only
  `event.data` and the DOM selection, and neither is an own property. What the
  isolated world breaks everywhere else — the shadowed `getTargetRanges()` and
  the shadowed clipboard — this editor never relied on in the first place.

So the answer to "is any of this blocked in an extension?" is: *the workarounds
are; the spec'd routes are not; and Firefox's paste needs the main world.* That
is the same conclusion the production extension reached for Google Docs and Word
for the web — it injects a MAIN-world bootstrap for exactly those two editors —
but measured rather than inferred, and reproducible on this page by anyone who
loads the extension.

`isTrusted` is `false` in every realm including the extension's, which is worth
stating plainly: nothing about being an extension makes a synthetic event look
real, so no editor that checks it can be fooled by any of this.

**WebKit / Safari — expectation, not a measurement.** Playwright's WebKit build
cannot load an extension on Linux, so the isolated world has no WebKit column in
the tables: an absent column is the honest entry, and the extension page renders
`not measured here` rather than an empty cell. What is *expected*, from the
same-document WebKit results plus the mechanism the probes establish:

- WebKit needs the shadowed `getTargetRanges()` — it drops `targetRanges` from
  the init dict even in the same realm, as the probe records (`init dict hidden
  → 0 range(s)`). Own properties do not cross a content world in Chromium or
  Firefox, so WebKit's `beforeinput` rows are expected to lose their only
  target-range supply from a content script. There is no spec'd fallback for
  WebKit, which would make it the one engine where a content script cannot aim
  a `beforeinput` at all.
- WebKit honours the init-dict `clipboardData` in the same realm, so its paste
  path is expected to survive the isolated world the way Chromium's does.
- `isTrusted` is expected to stay `false`; it did in the same-document
  measurement, and nothing about a content world changes it.

Nothing above is printed as a result anywhere in this project; it is the
reasoning a reader needs before trusting the two measured engines to stand in
for the third.

The hardest combination — isolated world *and* an editor in a same-origin
iframe, which is what Google Docs and Word for the web actually present — is
measured too, as `extension-isolated-in-iframe`. Its delta against the
baseline is the isolated-world delta plus the iframe delta on top; the two
boundaries do not cancel each other out.

### What is genuinely unreachable

A **cross-origin iframe** and a **sandboxed iframe** (`sandbox="allow-scripts"`
without `allow-same-origin`) are blocked by the engine, not by the editor:
`contentDocument` is `null` and `getSelection` throws, in all three engines, with
the engine's own message. There is no recipe for that case — the strategies have
to run *inside* that frame (which is what `all_frames` is for) or the two sides
have to cooperate over `postMessage`. Every editor reachable at all is editable
by everything above.

One related trap is measured rather than assumed: **Firefox never delivers a
`requestAnimationFrame` callback to a hidden iframe.** The paste path's yield is
a frame, so a paste into a hidden frame in Firefox would never be dispatched at
all rather than merely being late — the probe reports "never fires" where
Chromium and WebKit report "fires". `settleSelection` therefore takes the window
whose frame clock to wait on and falls back to a task if the frame does not
deliver, and the recipe documents the hazard rather than silently hanging.

## Files

| file | what it is |
| --- | --- |
| `apply-edit.js` | **the point of the demo** — the five-step recipe, plus the sibling strategies (`beforeinput` at three `inputType`s, faked `keydown`, `paste` immediately and after a yield, paste as a paste-shaped `beforeinput` with a paste fallback, `execCommand`), the two target-range supply modes, the three clipboard supply modes, `settleSelection`, and the engine capability probe. Editor-agnostic: no editor is imported, none is special-cased. |
| `expectations.js` | what each editor does with each strategy, per engine *and per context*, plus the classifier, the engine capability notes, and the cells that are load-sensitive. The single source of truth: the tests assert against it and the pages render from it. Partly generated by `test/record.mjs`. |
| `editable.js` | the parts that need no editor library: the demo sentence, the target word, and the offset→DOM-range `TreeWalker` walk. Shared by the page, the iframe realm and the extension bundle, so all three compute the same range. |
| `editors.js` | the seven stock editors behind one interface (`el`, `text()`, `html()`, `rangeForWord()`, `destroy()`). Every mounter works from the host element's own document, so an editor can be mounted inside an iframe and belong to that realm. |
| `strategy-runners.js` | one implementation of "press a button", shared by the page, the iframe realm and the extension: which dispatch to run with which `inputType`, and what to report about it. |
| `page.js` | wires the baseline page to the shared UI: which context, which recorded table. No editor logic, no strategy logic. |
| `contexts.js` | what the contexts are (where the code lives, where the editor lives), which engines can measure each, why the others cannot, and the probe definitions. Pure data — the tests import it too. |
| `context-impls.js` | how the browser brings a context about: which realm mounts the editor, which realm dispatches the strategy, and where the probes listen. |
| `probes.js` | the isolation probes, each in two halves: what the *influencing* realm dispatches, and what the *editor's* realm can see. Results cross realms through a data attribute, the one thing the two realms certainly share. |
| `extension-bridge.js` | the page's half of the page ↔ content script exchange: CustomEvents with a JSON *string* detail, keyed by request id, bound to a document so the same code reaches a content script inside an iframe. |
| `demo-ui.js` | the shared demo UI — switcher, buttons, report panel, event log, matrix — built from `cases.js` and `expectations.js`, so the three pages cannot describe a measurement differently. |
| `extension/` | the loadable extension: `manifest.json` and the content-script source, bundled by `build.mjs` into `vendor/extension/` twice — once for the ISOLATED world, once for `world: "MAIN"` — from one file that differs only in the value of `WORLD`. |
| `index.html` | the baseline page: the recipe, the switcher, the toggles, the supply and yield controls, the buttons, the matrix, the log. |
| `iframes.html` + `iframes-page.js` | the iframe contexts page, deployable as-is. |
| `extension.html` + `extension-page.js` | the extension contexts page, deployable as-is; drives the extension through the bridge when it is installed. |
| `frame.html` | the same-origin iframe both iframe contexts use: the same bundle, its own realm. |
| `demo-base.css` | the demo's styles, in a file instead of a `<style>` block, because an editor mounted inside an iframe has to be styled by that iframe's document. |
| `cases.js` | the measured cases and the buttons that produce them — imported by the pages *and* the harness, so a row cannot exist without a button, and a button cannot exist without a row. |
| `test/harness.mjs` | drives the page in a real browser and measures every case in every editor and context; asserts nothing, so it can also be used to discover behaviour in a new engine. Loads the extension for the extension contexts: `--load-extension` in Chromium, marionette's `Addon:Install` in Firefox. |
| `test/record.mjs` | re-measures and rewrites the generated tables in `expectations.js`, per context, printing what each context changed against the same-document baseline. Run deliberately, never as part of `npm test`. |
| `test/tables.mjs` | rewrites the README's results tables from those recorded values, including the per-context delta tables. |
| `test/verify.mjs` | asserts the measurements against `expectations.js`, per browser *and* per context, and says so loudly for any context it cannot measure. |
| `tools/marionette.mjs` | just enough of Firefox's marionette protocol to install an unsigned extension into Playwright's Firefox — the only route that works, and the reason `tools/xpi.mjs` exists. |
| `tools/xpi.mjs` | a minimal ZIP writer, for producing the XPI that marionette's `Addon:Install` needs. |
| `build.mjs` | esbuild → `vendor/demo.js` + `vendor/demo.css`, copies CKEditor's build to `vendor/ckeditor.js`, builds the extension into `vendor/extension/`, and assembles the static site in `site/`. |
| `serve.mjs` | development static server for the repository root. |
| `tools/webkit.sh` | opens the demo in Playwright's WebKit build, headed. |
| `tools/webkit-console.mjs` | the same window with a JavaScript console for the page. |
| `.github/workflows/pages.yml` | builds and deploys `site/` to GitHub Pages on every push to `main`. |
| `scripts/setup-webkit-deps.sh` | no-root fallback for the shared libraries Playwright's WebKit needs on Linux and `install-deps` does not cover. |

CKEditor 5 is deliberately not bundled — it is ~4 MB and loads its own assets at
runtime, so it is fetched from its own build on demand when you switch to it.
ProseMirror, Wordgard, Quill, CodeMirror, Lexical and the EditContext editor
(zero dependencies, installed from its own repository) are bundled.

Wordgard's editable is `editor.contentDOM`, not `editor.dom`: the latter is the
outer `<wordgard-editor>` wrapper, and an event dispatched on it never reaches the
nested `contenteditable`. Getting that wrong makes Wordgard look completely inert
— which is exactly what happened first time.

### A note on teardown

CKEditor 5 keeps document-level listeners, so switching away from it without
calling `destroy()` leaves a live editor reacting to everything afterwards —
which silently corrupts later results. `editor.destroy()` is also asynchronous
and has to be awaited before the document is touched again. `editors.js` exposes
`destroy()` per editor for exactly this reason, and the shared UI awaits it before
every mount.

## Publishing

`.github/workflows/pages.yml` builds and deploys `site/` to GitHub Pages on every
push to `main`. In the repository settings, set **Pages → Source** to **GitHub
Actions**. `site/` and `vendor/` are build artifacts and are gitignored, so nothing
large is committed — the workflow regenerates both.

If you would rather not use Actions, `npm run build` and commit `site/` instead and
point Pages at the branch; the `.nojekyll` file it writes keeps Jekyll from
interfering.

## Sourcing

The event-construction code is a minimal extraction of `src/content/strategy.js`
in the **LingoTweaker** extension, which is where this example comes from. The
production version adds capability probing, strategy ordering, per-adapter
configuration and selection restoration on top of the same five steps; this repo
keeps only what is needed to see the mechanism and the differences between
engines and editors.

MIT licensed. ProseMirror, Wordgard, Quill, CodeMirror, CKEditor, Lexical and the
EditContext editor are the
trademarks of their respective authors and are used here unmodified, as
devDependencies. Wordgard is by the same author as ProseMirror.
