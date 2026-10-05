# Strategies for influencing text editors

A minimal, runnable demonstration that **one piece of JS** can modify the contents
of an editor it is not attached to, by means of one of several strategies.

Five real rich-text editors — ProseMirror, Wordgard, Quill 2, CodeMirror 6 and
CKEditor 5 — mounted **stock**, measured in three engines — Chromium 153,
Firefox 155 and WebKit/Safari 26.6 — so you can see which strategies work
where, and which fail in ways that look like success.

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
`index.html`, `page.js` and `vendor/` — which is the deployable page. Every path in
it is relative, so it works at a domain root or under a project subdirectory.
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
| `npm test` | Chromium only — the fast default |
| `npm run test:all` | Chromium, Firefox and WebKit |
| `npm run test:firefox` / `npm run test:webkit` | one engine |
| `npm run measure firefox` | print a matrix for one engine, assert nothing |
| `npm run record` | re-measure all three engines and rewrite the tables in `expectations.js` |
| `npm run tables` | rewrite the README's results tables from the recorded values |

`test/harness.mjs` measures, `expectations.js` states what the measurement
should be, and `test/verify.mjs` asserts one against the other — including the
*exact resulting text*, because "the content changed" and "the edit landed where
it was aimed" are not the same claim, and "the word was deleted" and "the word
was replaced" are not either. `index.html` renders its own table straight out of
`expectations.js`, so the page cannot drift from the tests.

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
   `text/html` flavour — which, see finding 4, no engine will actually fill in.
4. Supply the target range: `targetRanges` in the init dict, shadowing
   `getTargetRanges()`, or both.
5. `dispatchEvent`, then **verify by re-reading the text.** Never treat "not
   `preventDefault`ed" as success. Read the text a tick *after* dispatching, too:
   editors apply their change on their own schedule rather than inside the event
   handler, and reading in the same task reports "unchanged" for an edit that did
   happen. Wordgard defers its DOM write this way, and reading too early made the
   WebKit measurements disagree with themselves.

## Measured results

Three engines, five editors, `npm run test:all`. The tables below are generated
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
| `dataTransfer` in the `InputEvent` init dict | **no** | **no** | **no** |
| `clipboardData` in the `ClipboardEvent` init dict | yes | **no** | yes |

So `targetRanges` in the init dict is the spec'd route and it works in two of the three engines. Shadowing `getTargetRanges()` is what covers WebKit.

`replace` = the target word was replaced, `delete` = the word was removed and nothing inserted, `caret` = the content changed but the target word survived, — = nothing changed.

### Chromium 153

| strategy | ProseMirror | Wordgard | Quill 2 | CodeMirror 6 | CKEditor 5 |
| --- | --- | --- | --- | --- | --- |
| `beforeinput + getTargetRanges()` | — | replace | replace | — | replace |
| `beforeinput, no getTargetRanges()` | — | — | — | — | — |
| `beforeinput + range, no DOM selection` | — | replace | replace | — | replace |
| `beforeinput (insertText) + getTargetRanges()` | — | replace | replace | — | replace |
| `beforeinput (insertText), no getTargetRanges()` | — | — | — | — | — |
| `beforeinput (deleteContentBackward) + getTargetRanges()` | — | **delete** | — | — | **delete** |
| `beforeinput (deleteContentBackward), no getTargetRanges()` | — | — | — | — | **delete** |
| `beforeinput (insertText) + targetRanges in init dict` | — | replace | replace | — | replace |
| `beforeinput (deleteContentBackward) + targetRanges in init dict` | — | **delete** | — | — | **delete** |
| `beforeinput (insertText), no DOM selection (override)` | — | replace | replace | — | replace |
| `beforeinput (insertText), no DOM selection (init dict)` | — | replace | replace | — | replace |
| `faked keydown Backspace` | — | — | **delete** | **delete** | — |
| `faked keydown, no DOM selection` | — | — | — | — | — |
| `execCommand("insertHTML")` | replace | — | replace | replace | — |
| `synthetic paste` | replace | caret | replace | replace | replace |
| `synthetic paste, no DOM selection` | caret | caret | caret | caret | caret |
| `synthetic paste, clipboardData shadowed as a proxy object` | replace | caret | replace | replace | — |
| `synthetic paste, clipboardData shadowed as the real DataTransfer` | replace | caret | replace | replace | replace |
| `synthetic paste, yield one task first` | replace | replace | replace | replace | replace |
| `synthetic paste, yield one frame first` | replace | replace | replace | replace | replace |
| `synthetic paste, real DataTransfer + yield one frame` | replace | replace | replace | replace | replace |

### Firefox 155

| strategy | ProseMirror | Wordgard | Quill 2 | CodeMirror 6 | CKEditor 5 |
| --- | --- | --- | --- | --- | --- |
| `beforeinput + getTargetRanges()` | — | replace | replace | — | replace |
| `beforeinput, no getTargetRanges()` | — | — | — | — | — |
| `beforeinput + range, no DOM selection` | — | replace | replace | — | replace |
| `beforeinput (insertText) + getTargetRanges()` | — | replace | replace | — | replace |
| `beforeinput (insertText), no getTargetRanges()` | — | — | — | — | — |
| `beforeinput (deleteContentBackward) + getTargetRanges()` | — | **delete** | — | — | **delete** |
| `beforeinput (deleteContentBackward), no getTargetRanges()` | — | — | — | — | **delete** |
| `beforeinput (insertText) + targetRanges in init dict` | — | replace | replace | — | replace |
| `beforeinput (deleteContentBackward) + targetRanges in init dict` | — | **delete** | — | — | **delete** |
| `beforeinput (insertText), no DOM selection (override)` | — | replace | replace | — | replace |
| `beforeinput (insertText), no DOM selection (init dict)` | — | replace | replace | — | replace |
| `faked keydown Backspace` | — | — | **delete** | **delete** | — |
| `faked keydown, no DOM selection` | — | — | — | — | — |
| `execCommand("insertHTML")` | replace | — | replace | replace | — |
| `synthetic paste` | — | — | **delete** | **delete** | — |
| `synthetic paste, no DOM selection` | — | — | — | — | — |
| `synthetic paste, clipboardData shadowed as a proxy object` | replace | caret | replace | replace | — |
| `synthetic paste, clipboardData shadowed as the real DataTransfer` | replace | caret | replace | replace | replace |
| `synthetic paste, yield one task first` | — | — | **delete** | **delete** | — |
| `synthetic paste, yield one frame first` | — | — | **delete** | **delete** | — |
| `synthetic paste, real DataTransfer + yield one frame` | replace | replace | replace | replace | replace |

### WebKit / Safari 26.6

| strategy | ProseMirror | Wordgard | Quill 2 | CodeMirror 6 | CKEditor 5 |
| --- | --- | --- | --- | --- | --- |
| `beforeinput + getTargetRanges()` | — | — | replace | — | replace |
| `beforeinput, no getTargetRanges()` | — | — | — | — | — |
| `beforeinput + range, no DOM selection` | — | — | replace | — | replace |
| `beforeinput (insertText) + getTargetRanges()` | — | replace | replace | — | replace |
| `beforeinput (insertText), no getTargetRanges()` | — | — | — | — | — |
| `beforeinput (deleteContentBackward) + getTargetRanges()` | — | **delete** | — | — | **delete** |
| `beforeinput (deleteContentBackward), no getTargetRanges()` | — | — | — | — | **delete** |
| `beforeinput (insertText) + targetRanges in init dict` | — | — | — | — | — |
| `beforeinput (deleteContentBackward) + targetRanges in init dict` | — | — | — | — | **delete** |
| `beforeinput (insertText), no DOM selection (override)` | — | replace | replace | — | replace |
| `beforeinput (insertText), no DOM selection (init dict)` | — | — | — | — | — |
| `faked keydown Backspace` | — | — | **delete** | **delete** | — |
| `faked keydown, no DOM selection` | — | — | — | — | — |
| `execCommand("insertHTML")` | replace | — | replace | replace | replace |
| `synthetic paste` | replace | caret | replace | replace | replace |
| `synthetic paste, no DOM selection` | caret | caret | caret | caret | caret |
| `synthetic paste, clipboardData shadowed as a proxy object` | replace | caret | replace | replace | — |
| `synthetic paste, clipboardData shadowed as the real DataTransfer` | replace | caret | replace | replace | replace |
| `synthetic paste, yield one task first` | replace | caret / replace | replace | replace | replace |
| `synthetic paste, yield one frame first` | replace | replace | replace | replace | replace |
| `synthetic paste, real DataTransfer + yield one frame` | replace | replace | replace | replace | replace |

Editors: ProseMirror 1.42.5, Wordgard 0.5.2, Quill 2 2.0.3, CodeMirror 6 6.43.13, CKEditor 5 5.41.4.

<!-- END GENERATED TABLES -->

## What the numbers say

**1. `targetRanges` in the init dict works in Chromium and Firefox; only WebKit
needs the method shadowed.** This is the cheapest possible fix for a spec'd
feature that is implemented in two of three engines, and it is invisible: WebKit
accepts `targetRanges` in the initializer without complaint and then reports an
empty target range. Sending both costs nothing and covers all three. Note also
that `getTargetRanges()` must be read *before* dispatch — an engine that took the
range from the init dict clears it afterwards.

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
built fixes all five editors. The version of this workaround that circulates — a
hand-rolled `{ getData, setData }` object — fixes four of the five in Firefox but
**breaks CKEditor in every engine**, where it does nothing *and throws*, because
the object is not a real `DataTransfer`:

| how the clipboard is supplied | ProseMirror | Wordgard | Quill 2 | CodeMirror 6 | CKEditor 5 |
| --- | --- | --- | --- | --- | --- |
| `clipboardData` in the init dict (Firefox) | — | — | **delete** | **delete** | — |
| shadowed as a `{getData, setData}` proxy | replace | replace | replace | replace | **throws** |
| shadowed as the real `DataTransfer` | **replace** | **replace** | **replace** | **replace** | **replace** |

The proxy is the trap: it looks like the fix and silently regresses CKEditor
everywhere. The same shape applies to `targetRanges` in finding 1 — shadow with
the real object, not a lookalike.

Neither fix is sufficient on its own: the clipboard one leaves Wordgard pasting at
its stale caret, and the yield one cannot repair an empty clipboard. **Applied
together — real `DataTransfer` plus one animation frame — all five editors
replace correctly in all three engines.** That is the only row in the whole table
with a clean sweep everywhere, and it is the configuration to copy:

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
range, whichever way the range is supplied.** Three of the five editors implement
the event at all, and each of them bails on a missing range.
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

**5. The `inputType` you choose decides whether an editor acts at all.**
`insertReplacementText` and `insertText` are both "replace the selection", and
editors implement different ones. Wordgard handles `insertText` and the `delete*`
types, and its `insertReplacementText` branch is dead code in practice: it reads
the replacement out of `event.dataTransfer`, which is `null` in all three engines
(see finding 7). So Wordgard replaces the target word via `insertText` and does
nothing at all via `insertReplacementText`, while Quill and CKEditor handle
either. An integration that picks one `inputType` and never tries the other looks
like a broken editor when it is really a mismatched `inputType`.

**6. Firefox turns a synthetic paste into a deletion.** Firefox does not accept
`clipboardData` in the `ClipboardEvent` init dict, so the event arrives with an
empty clipboard. Quill and CodeMirror then paste nothing over the selection,
which *removes the target word*: the document changes, the page reports a change,
and a naive success check passes. ProseMirror, Wordgard and CKEditor do nothing.
Chromium and WebKit both honour `clipboardData` and replace correctly. This is the
single most important row in the tables: the failure mode is not "the edit did
not happen", it is "the user's word is gone" — and finding 3 shows it is fixable.

**7. `dataTransfer` in the `InputEvent` init dict is ignored by all three
engines.** `event.dataTransfer` is `null` in Chromium, Firefox and WebKit alike.
Wordgard's `insertReplacementText` handling is the clearest demonstration:

```js
let read = readClipboard(wg.state, event.dataTransfer, wg.state.sel.head, true);
if (read) wg.dispatch({ changes: { from, to, insert: read.slice, … } });
```

No engine fills the clipboard in, so `read` is never truthy and nothing is
dispatched — and in WebKit the unguarded `data.getData` throws on the way. This
is also why no `beforeinput` implementation anywhere can be formatting-aware: the
`text/html` flavour never arrives. Quill and CKEditor apply the replacement with
whatever marks the replaced range already carried, so bold `quick` becomes **bold**
`sluggish`. Only `paste` and `execCommand` install new marks.

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
the same event. Both are asserted by the test suite, so a library update that
fixes or worsens them is noticed.

**10. The keydown path is not dead, it is editor-specific.** Quill 2 and
CodeMirror 6 both apply a faked `Backspace` natively, in all three browsers,
because both implement it in an ordinary `keydown` handler (Quill through its
keyboard bindings, CodeMirror through `defaultKeymap`). ProseMirror, Wordgard and
CKEditor 5 do not. ProseMirror leaves Backspace to the browser and reads the
mutation back through its `MutationObserver`, so a scripted keypress — which has
no default action — cannot work. The same synthetic keydown is the best option
for two editors and useless for the other three, which is the argument for a
ladder rather than a single bet.

**11. Synthetic `paste` is the only strategy that works broadly when the browser
cooperates — and the only one that cannot be aimed.** All five editors handle
`ClipboardEvent("paste")` with a populated `DataTransfer` out of the box in
Chromium and WebKit, and honour the `text/html` flavour. But a `ClipboardEvent`
has no target-range concept at all, so the editor falls back to its *current*
selection: with no DOM selection set, every editor inserts the replacement at the
caret and leaves the target word intact. Wordgard also did this *with* the
selection set, until it turned out to be a timing problem rather than a
capability one — see finding 2.

**12. `execCommand` leaves `&nbsp;` behind.** Chromium re-serialises a space
adjacent to an inline element inside `contenteditable` as `&nbsp;`, so after
`execCommand("insertHTML", …)` both ProseMirror and Quill end up with
`The&nbsp;<em>sluggish</em>&nbsp;brown…` where the surrounding text used ordinary
spaces. Harmless to a reader, but it changes the document's text, so anything
comparing text before and after has to expect it.

**13. Read the result a tick after dispatching, or you will measure a lie.**
Editors apply their change on their own schedule, not inside the event handler:
Wordgard defers its DOM write. Reading the text in the same task as the dispatch
reported "unchanged" for a WebKit deletion that had in fact happened, and made the
recorded tables disagree with themselves. `verifyEdit` now settles before it reads.

## Files

| file | what it is |
| --- | --- |
| `apply-edit.js` | **the point of the demo** — the five-step recipe, plus the sibling strategies (`beforeinput` at three `inputType`s, faked `keydown`, `paste` immediately and after a yield, `execCommand`), the two target-range supply modes, the three clipboard supply modes, and `settleSelection`. Editor-agnostic: no editor is imported, none is special-cased. |
| `expectations.js` | what each editor does with each strategy, per engine, plus the classifier, the engine capability notes, and the cells that are load-sensitive. The single source of truth: the tests assert against it and the page renders from it. Partly generated by `test/record.mjs`. |
| `editors.js` | the five stock editors behind one interface (`el`, `text()`, `html()`, `rangeForWord()`, `destroy()`), plus the offset→DOM-range `TreeWalker` walk. |
| `index.html` | the page: the recipe, the switcher, the toggles, the target-range supply and yield controls, seven buttons, the matrix, the log. |
| `page.js` | builds the DOM, drives the buttons, reports what changed. No editor logic. |
| `test/harness.mjs` | drives the page in a real browser and measures every case in every editor; asserts nothing, so it can also be used to discover behaviour in a new engine. |
| `test/record.mjs` | re-measures and rewrites the generated tables in `expectations.js`. Run deliberately, never as part of `npm test`. |
| `test/tables.mjs` | rewrites the README's results tables from those recorded values. |
| `test/verify.mjs` | asserts the measurements against `expectations.js`, per browser. |
| `build.mjs` | esbuild → `vendor/demo.js` + `vendor/demo.css`, copies CKEditor's build to `vendor/ckeditor.js`, and assembles the static site in `site/`. |
| `serve.mjs` | development static server for the repository root. |
| `tools/webkit.sh` | opens the demo in Playwright's WebKit build, headed. |
| `tools/webkit-console.mjs` | the same window with a JavaScript console for the page. |
| `.github/workflows/pages.yml` | builds and deploys `site/` to GitHub Pages on every push to `main`. |
| `scripts/setup-webkit-deps.sh` | no-root fallback for the shared libraries Playwright's WebKit needs on Linux and `install-deps` does not cover. |

CKEditor 5 is deliberately not bundled — it is ~4 MB and loads its own assets at
runtime, so it is fetched from its own build on demand when you switch to it.
ProseMirror, Wordgard, Quill and CodeMirror are bundled.

Wordgard's editable is `editor.contentDOM`, not `editor.dom`: the latter is the
outer `<wordgard-editor>` wrapper, and an event dispatched on it never reaches the
nested `contenteditable`. Getting that wrong makes Wordgard look completely inert
— which is exactly what happened first time.

### A note on teardown

CKEditor 5 keeps document-level listeners, so switching away from it without
calling `destroy()` leaves a live editor reacting to everything afterwards —
which silently corrupts later results. `editor.destroy()` is also asynchronous
and has to be awaited before the document is touched again. `editors.js` exposes
`destroy()` per editor for exactly this reason, and `page.js` awaits it.

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

MIT licensed. ProseMirror, Wordgard, Quill, CodeMirror and CKEditor are the
trademarks of their respective authors and are used here unmodified, as
devDependencies. Wordgard is by the same author as ProseMirror.
