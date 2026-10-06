/**
 * The one piece of JS this example is about.
 *
 * A synthetic `beforeinput` needs a target range before an editor will act on
 * it. There are two ways to supply one, and they are not equivalent across
 * engines:
 *
 *   1. `targetRanges` in the constructor's init dict. This is the spec'd way —
 *      `InputEventInit` carries `sequence<StaticRange> targetRanges` — and
 *      Chromium and Firefox both honour it, so nothing else is needed there.
 *      **WebKit ignores it silently**, and `getTargetRanges()` comes back empty.
 *   2. Shadowing `getTargetRanges()` with an own property returning a real
 *      `StaticRange`. Unconventional, but it works in every engine measured,
 *      including WebKit.
 *
 * So path 1 is the correct thing to try first and path 2 is what you are left
 * with. Sending both is harmless and covers all three.
 *
 * Editors that honour the spec's target range — Quill's `handleBeforeInput`,
 * CKEditor 5's beforeinput observer, Wordgard's `InputState.beforeInput` — read
 * `getTargetRanges()[0]` and bail out when it is empty. With neither path taken
 * they do nothing at all, and Wordgard throws.
 *
 * Nothing here is editor-specific: the helpers know only about `InputEvent`,
 * `StaticRange`, `KeyboardEvent`, `DataTransfer` and `Element.dispatchEvent`.
 */

/** How the target range is handed to the `beforeinput` event. */
export const TARGET_RANGE_SUPPLY = {
  /** Shadow `getTargetRanges()`. Works in every engine measured. */
  OVERRIDE: "override",
  /** Pass `targetRanges` in the init dict. Chromium and Firefox; not WebKit. */
  INIT: "init",
  /** Both, so WebKit is covered by the override and the spec path is exercised. */
  BOTH: "both",
};

/**
 * How the clipboard is handed to the synthetic `paste`.
 *
 * Firefox does not accept `clipboardData` in the `ClipboardEventInit` dict, so
 * the event arrives with an *empty* clipboard and every editor that pastes over
 * the selection simply deletes it. Shadowing the property fixes that, but *what
 * you shadow it with* matters:
 *
 *   INIT      the init dict alone. Right in Chromium and WebKit; in Firefox the
 *             clipboard is empty and ProseMirror, Wordgard and CKEditor do
 *             nothing while Quill and CodeMirror **delete the target word**.
 *   PROXY     a hand-rolled `{ getData, setData }` object. Fixes four of the
 *             five in Firefox — but **breaks CKEditor in every engine**, because
 *             it is not a real DataTransfer.
 *   INSTANCE  the real DataTransfer, shadowed onto the event. Fixes all five in
 *             Firefox and changes nothing in the other two.
 *
 * So INSTANCE is the one to use. PROXY is recorded here only because it is the
 * version that circulates in the wild, and it is a trap: it looks like a fix and
 * silently regresses CKEditor everywhere.
 */
export const CLIPBOARD_SUPPLY = {
  INIT: "init",
  PROXY: "proxy",
  INSTANCE: "instance",
};

/**
 * Build a `StaticRange` from a live `Range`.
 *
 * A real `StaticRange` rather than a plain object literal, because consumers read
 * `.collapsed` off it — and because a target range is by definition read-only:
 * an editor may read it, never mutate it.
 *
 * @param {Range} range
 * @param {Window} scope window the range belongs to (for cross-realm use)
 * @returns {StaticRange|null} null where `StaticRange` is unavailable
 */
export function toStaticRange(range, scope = globalThis) {
  if (!range || typeof scope.StaticRange !== "function") {
    return null;
  }
  try {
    return new scope.StaticRange({
      startContainer: range.startContainer,
      startOffset: range.startOffset,
      endContainer: range.endContainer,
      endOffset: range.endOffset,
    });
  } catch {
    return null;
  }
}

/**
 * Shadow `getTargetRanges()` on `event` so it returns `[staticRange]`.
 *
 * The fallback for engines that ignore `targetRanges` in the init dict. Where
 * the init dict is honoured this is redundant — but harmless, since the own
 * property simply wins.
 *
 * @param {InputEvent} event    event built but not yet dispatched
 * @param {Range} range         live DOM range the edit is meant to affect
 * @param {Window} scope        window the event belongs to (for cross-realm use)
 * @returns {StaticRange|null}  the attached range, or null when unavailable
 */
export function attachTargetRanges(event, range, scope = globalThis) {
  const staticRange = toStaticRange(range, scope);
  if (!staticRange) {
    return null;
  }
  try {
    Object.defineProperty(event, "getTargetRanges", {
      value: () => [staticRange],
      configurable: true,
    });
  } catch {
    return null;
  }
  return staticRange;
}

/**
 * Put the live DOM selection on `range` and tell listeners about it.
 *
 * `element.select()` and `Selection.setBaseAndExtent()` cannot be used on an
 * editor's behalf, because rich editors keep their *own* selection model and
 * only re-sync from the DOM when they observe a `selectionchange`. Firing that
 * event at the document, the element and the window covers the three places
 * editors listen from.
 *
 * The window is the *target's* window, not this module's ambient one. That is not
 * a detail: when the editor lives in an iframe, a `selectionchange` fired at the
 * top window reaches nobody who matters, and when this code is running inside an
 * extension's content script the two sides are different worlds entirely. Measured
 * in all three engines — see ISOLATION_PROBES in expectations.js.
 *
 * @param {HTMLElement} target editable root that will receive the event
 * @param {Range} range
 * @returns {boolean} whether the selection actually took inside `target`
 */
export function setDomSelection(target, range) {
  const doc = target.ownerDocument;
  const view = doc.defaultView ?? globalThis;
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
  const selection = doc.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  // A listener that throws cannot make dispatchEvent throw, so there is nothing
  // to guard here — but not every editor wants a synthetic one, hence all three
  // targets: the document, the element, and the window they actually live in.
  // Built with *their* Event constructor, so the event belongs to the realm it is
  // dispatched in rather than to whichever realm called this function.
  const EventCtor = typeof view.Event === "function" ? view.Event : Event;
  for (const node of [doc, target, view]) {
    node.dispatchEvent(new EventCtor("selectionchange"));
  }

  return selection.rangeCount > 0 && target.contains(selection.anchorNode);
}

/**
 * Strategy 1 — replace/insert formatted content with a `beforeinput` event.
 *
 * `insertReplacementText` is the spec's "replace what is selected with `data`".
 * `insertText` and `insertFromPaste` are the other two worth trying;
 * `deleteContentBackward` and `deleteWordBackward` cover deletions.
 *
 * Formatting cannot travel in `data`, which is a plain string, so it rides
 * along in the `dataTransfer`'s `text/html` flavour. Editors that parse that
 * HTML keep the replacement's own formatting; editors that ignore it fall back
 * to `data` plus whatever marks the replaced range carried.
 *
 * @param {{target: HTMLElement, range: Range, text: string, html?: string,
 *          inputType?: string, selectFirst?: boolean, attachRanges?: boolean}} options
 * @returns {{event: InputEvent, prevented: boolean, selectionOk: boolean,
 *            attached: StaticRange|null}}
 */
export function dispatchBeforeinput({
  target,
  range,
  text,
  html = "",
  inputType = "insertReplacementText",
  selectFirst = true,
  attachRanges = true,
  supply = TARGET_RANGE_SUPPLY.OVERRIDE,
}) {
  const scope = target.ownerDocument.defaultView ?? globalThis;
  const selectionOk = selectFirst ? setDomSelection(target, range) : false;

  // A deletion carries no text, and there is nothing to format.
  const inserting = !inputType.startsWith("delete");

  let dataTransfer = null;
  try {
    dataTransfer = new scope.DataTransfer();
    if (inserting) {
      dataTransfer.setData("text/plain", text);
      if (html) {
        dataTransfer.setData("text/html", html);
      }
    }
  } catch {
    dataTransfer = null;
  }

  // `targetRanges` in the init dict is the spec'd route. Chromium and Firefox
  // keep it; WebKit drops it, which is why TARGET_RANGE_SUPPLY.OVERRIDE exists.
  const initRange =
    attachRanges && supply !== TARGET_RANGE_SUPPLY.OVERRIDE ? toStaticRange(range, scope) : null;

  const event = new scope.InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    composed: true,
    inputType,
    data: inserting ? text : null,
    ...(dataTransfer ? { dataTransfer } : {}),
    ...(initRange ? { targetRanges: [initRange] } : {}),
  });
  // Read *before* dispatching: an engine that took the range from the init dict
  // clears it once the event has been dispatched, so asking afterwards reports 0
  // ranges for an edit that did happen. Editors read it from inside their own
  // listener, which is the only place it is reliably populated.
  let attached = null;
  let rangesBeforeDispatch = 0;
  let methodShadowed = false;
  if (attachRanges) {
    if (supply === TARGET_RANGE_SUPPLY.INIT) {
      // Shadowing here would mask whether the engine kept the init-dict range.
      rangesBeforeDispatch = event.getTargetRanges?.().length ?? 0;
      attached = event.getTargetRanges?.()[0] ?? null;
    } else {
      attached = attachTargetRanges(event, range, scope);
      methodShadowed = attached !== null;
      rangesBeforeDispatch = attached ? 1 : 0;
    }
  }
  target.dispatchEvent(event);
  return {
    event,
    prevented: event.defaultPrevented,
    selectionOk,
    attached,
    rangesBeforeDispatch,
    methodShadowed,
  };
}

/**
 * Strategy 2 — delete by faking a Backspace/Delete keypress.
 *
 * `keydown` is dispatched on its own, without `keyup`: a widget that reacts to
 * both would remove a second character once the selection has already collapsed.
 * The legacy `keyCode`/`which` fields are shadowed because they are read-only
 * derived attributes that stay 0 on a scripted event.
 *
 * @param {{target: HTMLElement, key?: string, keyCode?: number,
 *          range?: Range, selectFirst?: boolean}} options
 * @returns {{event: KeyboardEvent, prevented: boolean}}
 */
export function dispatchDeleteKey({
  target,
  key = "Backspace",
  keyCode = 8,
  range = null,
  selectFirst = true,
}) {
  const scope = target.ownerDocument.defaultView ?? globalThis;
  if (selectFirst && range) {
    setDomSelection(target, range);
  }
  const event = new scope.KeyboardEvent("keydown", {
    key,
    code: key,
    location: 0,
    repeat: false,
    isComposing: false,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  try {
    Object.defineProperties(event, {
      keyCode: { get: () => keyCode, configurable: true },
      which: { get: () => keyCode, configurable: true },
      charCode: { get: () => 0, configurable: true },
    });
  } catch {
    // The standard `key`/`code` members are already set.
  }
  target.dispatchEvent(event);
  return { event, prevented: event.defaultPrevented };
}

/**
 * Strategy 3 — a synthetic `paste`.
 *
 * A `ClipboardEvent` has no target-range concept at all, so there is nothing to
 * attach: `getTargetRanges()` does not exist on it and the editor falls back to
 * its current selection. This strategy is the most widely supported one because
 * every editor has a paste path, but it can only ever act on the current selection.
 *
 * `dataTransfer` carries both `text/plain` and `text/html`, which is what makes
 * this the only replacement route that can install *new* formatting: the
 * `beforeinput` implementations in the wild apply the replacement with whatever
 * marks the replaced range already had.
 *
 * Dispatches without yielding first, which is what a naive integration does.
 * Wordgard pastes at its stale caret in that case — see
 * `dispatchPasteWithWait`.
 *
 * @param {{target: HTMLElement, text: string, html?: string, range?: Range,
 *          selectFirst?: boolean, clipboard?: string}} options
 *   `clipboard` is one of CLIPBOARD_SUPPLY.
 * @returns {{event: ClipboardEvent, prevented: boolean, selectionOk: boolean,
 *            clipboardSupplied: boolean, clipboardIsReal: boolean}}
 */
export function dispatchPaste({
  target,
  text,
  html = "",
  range = null,
  selectFirst = true,
  clipboard = CLIPBOARD_SUPPLY.INIT,
}) {
  const scope = target.ownerDocument.defaultView ?? globalThis;
  const selectionOk = selectFirst && range ? setDomSelection(target, range) : false;
  const dataTransfer = new scope.DataTransfer();
  dataTransfer.setData("text/plain", text);
  if (html) {
    dataTransfer.setData("text/html", html);
  }
  const event = new scope.ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    composed: true,
    clipboardData: dataTransfer,
  });

  // Only shadow when the init dict was not honoured, or — as measured — when the
  // engine honoured it but the editor still wants a *real* DataTransfer. See
  // CLIPBOARD_SUPPLY for why the hand-rolled proxy is not the right choice.
  let clipboardSupplied = false;
  if (clipboard === CLIPBOARD_SUPPLY.PROXY) {
    Object.defineProperty(event, "clipboardData", {
      configurable: true,
      value: {
        getData: (format) => dataTransfer.getData(format),
        setData: (format, value) => dataTransfer.setData(format, value),
      },
    });
    clipboardSupplied = true;
  } else if (clipboard === CLIPBOARD_SUPPLY.INSTANCE) {
    Object.defineProperty(event, "clipboardData", {
      configurable: true,
      value: dataTransfer,
    });
    clipboardSupplied = true;
  }

  target.dispatchEvent(event);
  return {
    event,
    prevented: event.defaultPrevented,
    selectionOk,
    clipboardSupplied,
    clipboardIsReal: event.clipboardData instanceof scope.DataTransfer,
  };
}

/**
 * Strategy 3a — a synthetic `paste` with a wait between selection change and paste.
 *
 * Same concept as strategy 3, but with a wait between making the change to the
 * selection and executing the paste.
 *
 * @param {{target: HTMLElement, text: string, html?: string,
 *          range?: Range, selectFirst?: boolean}} options
 * @returns {{event: ClipboardEvent, prevented: boolean, selectionOk: boolean}}
 */
/**
 * How long to yield after changing the DOM selection, before dispatching the
 * edit that depends on it.
 *
 * Editors do not all observe a `selectionchange` synchronously. Wordgard syncs
 * its selection model on a task or frame boundary, so a paste dispatched in the
 * same task as the selection change goes to its *stale* caret and the target
 * word survives. Measured, in Chromium and WebKit:
 *
 *   no yield          -> pastes at the caret   ("sluggishThe quick brown fox…")
 *   one microtask     -> pastes at the caret
 *   setTimeout(0)     -> replaces the target word
 *   requestAnimationFrame -> replaces the target word
 *   1ms, 5ms, 16ms    -> replaces the target word
 *
 * So it is not about duration: yielding the thread once is enough, and a
 * microtask is not a yield for this purpose.
 */
export const SELECTION_SETTLE = {
  /** Dispatch in the same task as the selection change. */
  NONE: "none",
  /** One macrotask via setTimeout(…, 0). The cheapest thing that works. */
  TASK: "task",
  /** One animation frame. */
  FRAME: "frame",
};

/**
 * Yield so the editor has processed the `selectionchange`.
 *
 * `scope` is the window whose frame clock to wait on, and it matters more than it
 * looks: Firefox never delivers a frame callback to a hidden or `display: none`
 * iframe at all — the paste that depends on this yield would never be dispatched
 * rather than merely being late. Measured: see `raf-hidden` in CONTEXT_PROBES. So
 * the frame callback is raced against a task, and if the frame loses, the caller at
 * least gets its paste back, aimed at whatever selection the editor has by then.
 *
 * @param {string|number} settle one of SELECTION_SETTLE, or milliseconds to wait
 * @param {Window} [scope] window to take the frame clock from
 * @returns {Promise<number>} milliseconds actually waited
 */
/**
 * What this engine honours in a *constructed* event, as opposed to what this engine
 * honours in an event someone else constructed.
 *
 * `CAPABILITIES` in expectations.js records the first kind of answer, and
 * test/verify.mjs asserts against it: if Firefox starts honouring `clipboardData`, its
 * paste rows have to change with it. This function produces that answer, so the page and
 * the test suite cannot report different capabilities for the same browser.
 *
 * @param {Window} [scope]
 * @returns {Record<string, string>}
 */
export function probeCapabilities(scope = globalThis) {
  const doc = scope.document;
  const probe = (fn) => {
    try {
      return fn();
    } catch (error) {
      return `threw: ${error.message}`;
    }
  };
  const withData = new scope.DataTransfer();
  withData.setData("text/plain", "x");
  withData.setData("text/html", "<em>x</em>");
  const event = new scope.ClipboardEvent("paste", { clipboardData: withData, cancelable: true });
  const withTransfer = new scope.DataTransfer();
  withTransfer.setData("text/plain", "x");
  const input = new scope.InputEvent("beforeinput", {
    inputType: "insertText",
    data: "x",
    dataTransfer: withTransfer,
    cancelable: true,
  });
  return {
    userAgent: scope.navigator.userAgent,
    StaticRange: typeof scope.StaticRange,
    InputEvent: typeof scope.InputEvent,
    DataTransfer: probe(() => typeof new scope.DataTransfer()),
    clipboardEventConstructor: probe(() => typeof new scope.ClipboardEvent),
    "clipboardData honoured in init dict": probe(() => {
      const data = event.clipboardData;
      return data ? `text/html=${JSON.stringify(data.getData("text/html"))}` : String(data);
    }),
    "clipboardData is a real DataTransfer": probe(() =>
      String(event.clipboardData instanceof scope.DataTransfer),
    ),
    "dataTransfer honoured in InputEvent init dict": probe(() => {
      const data = input.dataTransfer;
      return data ? "yes" : String(data);
    }),
    // targetRanges is in the spec's InputEventInit; see TARGET_RANGE_SUPPLY.
    "targetRanges honoured in InputEvent init dict": probe(() => {
      const node = doc.createElement("div");
      node.textContent = "abcdef";
      const sr = new scope.StaticRange({
        startContainer: node.firstChild,
        startOffset: 1,
        endContainer: node.firstChild,
        endOffset: 3,
      });
      const built = new scope.InputEvent("beforeinput", {
        inputType: "insertText",
        data: "x",
        targetRanges: [sr],
      });
      const got = built.getTargetRanges();
      if (got.length !== 1) return `no (${got.length} ranges)`;
      const kept = got[0].startOffset === 1 && got[0].endOffset === 3;
      return kept ? `yes${got[0] === sr ? "" : " (copied)"}` : "no (wrong offsets)";
    }),
    "queryCommandSupported('insertHTML')": probe(() =>
      String(doc.queryCommandSupported?.("insertHTML")),
    ),
    execCommand: probe(() => typeof doc.execCommand),
  };
}

export async function settleSelection(settle = SELECTION_SETTLE.NONE, scope = globalThis) {
  if (settle === SELECTION_SETTLE.NONE || settle === undefined || settle === null) {
    return 0;
  }
  const started = performance.now();
  if (settle === SELECTION_SETTLE.FRAME) {
    const raf = typeof scope?.requestAnimationFrame === "function"
      ? scope.requestAnimationFrame.bind(scope)
      : requestAnimationFrame;
    // One frame is the smallest yield that works in every engine; 250 ms is far past
    // the point where duration stops mattering (see finding 2), so a frame that has
    // not arrived by then was never going to arrive.
    await new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      raf(done);
      setTimeout(done, 250);
    });
  } else if (typeof settle === "number") {
    await new Promise((resolve) => setTimeout(resolve, settle));
  } else {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return performance.now() - started;
}

/**
 * Strategy 3, second variant — a synthetic `paste` dispatched *after* yielding
 * the thread, so an editor that observes `selectionchange` asynchronously has
 * actually seen the new selection before the paste arrives.
 *
 * Identical to `dispatchPaste` apart from the await in between. That one line is
 * the difference between the replacement landing on the target word and landing
 * on the caret, in the editors that sync their selection model on a task.
 *
 * @param {{target: HTMLElement, text: string, html?: string, range?: Range,
 *          selectFirst?: boolean, settle?: string|number, clipboard?: string}} options
 * @returns {Promise<{event: ClipboardEvent, prevented: boolean,
 *          selectionOk: boolean, settle: string|number, waitedMs: number,
 *          clipboardSupplied: boolean, clipboardIsReal: boolean}>}
 */
export async function dispatchPasteWithWait({
  target,
  text,
  html = "",
  range = null,
  selectFirst = true,
  settle = SELECTION_SETTLE.NONE,
  clipboard = CLIPBOARD_SUPPLY.INIT,
}) {
  const scope = target.ownerDocument.defaultView ?? globalThis;
  const selectionOk = selectFirst && range ? setDomSelection(target, range) : false;
  const waitedMs = await settleSelection(settle, scope);
  // The selection is already set above; do not set it a second time.
  const result = dispatchPaste({ target, text, html, selectFirst: false, clipboard });
  return { ...result, selectionOk, settle, waitedMs };
}

/**
 * Strategy 4 — `document.execCommand`, the last resort.
 *
 * Unlike the three synthetic events above, this one is not an event at all: the
 * browser really edits the DOM. That is why it is the only strategy that works
 * against editors which ignore untrusted input entirely, and also why it is the
 * only one that keeps native undo, spellcheck squiggles and dirty-state
 * bookkeeping working for free.
 *
 * `insertHTML` is preferred over `insertText` when there is formatting to
 * preserve; `insertHTML` is a command the spec has removed, so both are
 * feature-detected through `queryCommandSupported`.
 *
 * @param {{target: HTMLElement, text: string, html?: string,
 *          range?: Range, selectFirst?: boolean}} options
 * @returns {{used: string[]}} which command actually performed the edit
 */
export function execInsert({ target, text, html = "", range = null, selectFirst = true }) {
  const doc = target.ownerDocument;
  if (selectFirst && range) {
    setDomSelection(target, range);
  }
  const used = [];
  const run = (command, value) => {
    try {
      if (doc.execCommand(command, false, value)) {
        used.push(command);
        return true;
      }
    } catch {
      // Command unsupported or refused by this editor.
    }
    return false;
  };
  if (html && doc.queryCommandSupported?.("insertHTML")) {
    run("insertHTML", html);
  }
  if (used.length === 0) {
    run("insertText", text);
  }
  return { used };
}

/**
 * Success is "the text actually changed", never "the event was not prevented".
 * A synthetic event has no default action, so a `beforeinput` that nobody
 * consumed comes back un-prevented — which means failure, not success.
 *
 * `settleMs` exists because editors apply their change on their own schedule,
 * not synchronously inside the event handler: Wordgard defers its DOM write, so
 * reading the text in the same task as the dispatch reports "unchanged" for an
 * edit that did happen. Reading too early is a false negative, and it is what
 * made the WebKit measurements disagree with themselves.
 *
 * @param {() => string} readText
 * @param {() => (void|Promise<void>)} run
 * @param {number} [settleMs] time to let the editor flush before reading
 * @returns {Promise<{ok: boolean, before: string, after: string}>}
 */
export async function verifyEdit(readText, run, settleMs = 40) {
  const before = readText();
  await run();
  const settle = () => new Promise((resolve) => setTimeout(resolve, settleMs));
  await settle();
  let after = readText();
  if (after === before) {
    // Some editors flush on the next macrotask rather than on a timer.
    await settle();
    after = readText();
  }
  return { ok: after !== before, before, after };
}
