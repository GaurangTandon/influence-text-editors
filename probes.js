/**
 * The isolation probes: which parts of the recipe survive being in another realm.
 *
 * The matrix answers "did the editor act". The probes answer "why", by separating
 * the steps of the recipe and testing each one directly:
 *
 *   1. build a Range over the text          — realm-free; the DOM is shared
 *   2. set the DOM selection and announce it — a selection is document state, so it
 *                                            crosses realms; the *announcement* is an
 *                                            event, and which realm hears it is not
 *   3. construct the event with the right realm's constructors — available everywhere,
 *                                            but the object is then foreign to the
 *                                            editor's realm
 *   4. supply the target range / clipboard  — the expando route writes an **own
 *                                            property**, and own properties belong to
 *                                            the realm that wrote them; the init-dict
 *                                            route needs nothing written, so it may
 *                                            cross where the expando does not
 *   5. dispatch and verify by re-reading    — DOM is shared, so this always works,
 *                                            which is why "it changed" and "it worked"
 *                                            are not the same claim
 *
 * Each probe has two halves, and which realm runs which is the point:
 *
 *   `listenAsEditorRealm()`     runs in the *editor's* realm, and is the only code that
 *                               gets to ask questions in the editor's own terms
 *                               (`event.clipboardData instanceof DataTransfer` means
 *                               something only there).
 *   `dispatchAsInfluenceRealm()` runs in the *influencing* realm and produces the events
 *                               those listeners observe.
 *
 * They hand results over through a data attribute on the document element, which is the
 * one thing the two realms definitely share.
 *
 * Each route is probed on its *own* event. An event carrying both the expando and the
 * init-dict range cannot tell you which one the editor used, and that distinction is
 * the whole question: the expando is the recipe's workaround, the init dict is the spec.
 */

/** Dispatched by the influencing realm; the editor's realm listens and records. */
export const PROBE_EVENT = "lingo-probe";
/** Where the editor's realm writes what it saw. Shared DOM, so readable anywhere. */
const RECORD_ATTR = "lingoProbeEditor";

const safe = (fn, fallback = "threw") => {
  try {
    return fn();
  } catch (error) {
    return `${fallback}: ${String(error?.message ?? error).split("\n")[0]}`;
  }
};

/**
 * Install the editor's side of the probes. Call this from the realm the editor runs in.
 *
 * Listens at the document, the editor element and the window, because those are the
 * three places editors actually listen from, and the question "which of them heard
 * about it" has a different answer per realm.
 *
 * @param {Document} doc the editor's document
 * @param {HTMLElement} [element] the editor's editable root, when known
 * @returns {() => void} removes the listeners
 */
export function listenAsEditorRealm(doc = document, element = null) {
  const view = doc.defaultView ?? globalThis;
  let selectionChanges = 0;
  let selectionAtSet;
  const changedOn = { document: false, element: false, window: false };

  const write = (patch) => {
    const current = safe(() => JSON.parse(doc.documentElement.dataset[RECORD_ATTR] ?? "{}"), "{}");
    doc.documentElement.dataset[RECORD_ATTR] = JSON.stringify({ ...current, ...patch });
  };

  // Capture phase at the element: this runs before the editor's own bubble-phase
  // handlers, so it sees the selection as the influencing realm left it, before any
  // editor has re-synced its own model over the top of it.
  const onSelectionAtSet = () => {
    if (selectionAtSet === undefined) {
      selectionAtSet = safe(() => JSON.stringify(String(view.getSelection() ?? doc.getSelection())));
    }
  };
  const onSelectionChange = (event) => {
    selectionChanges += 1;
    const at = event.currentTarget;
    // The engine also fires its own asynchronous selectionchange after a selection
    // change, so the document entry can light up twice. That is fine: the question is
    // which *places* heard about it, not how many times.
    if (at === doc) changedOn.document = true;
    else if (at === view) changedOn.window = true;
    else changedOn.element = true;
  };
  // Every beforeinput this realm sees, in the order it was dispatched, with what this
  // realm can read off it. The influencing realm dispatched its events in a known order,
  // so pairing by position says which route supplied what — and when an event's own
  // property is invisible here, that is recorded rather than averaged away.
  const beforeinputSeen = [];
  const onBeforeinput = (event) => {
    beforeinputSeen.push({
      isTrusted: String(event.isTrusted),
      ownProperty: Object.prototype.hasOwnProperty.call(event, "getTargetRanges")
        ? "visible"
        : "hidden",
      ranges: safe(() => `${event.getTargetRanges().length} range(s)`),
    });
    const viaExpando = Object.prototype.hasOwnProperty.call(event, "getTargetRanges");
    const key = viaExpando ? "expando" : "initDict";
    write({
      isTrusted: String(event.isTrusted),
      [`${key}OwnProperty`]: viaExpando ? "visible" : "hidden",
      [`${key}Ranges`]: safe(() => `${event.getTargetRanges().length} range(s)`),
    });
  };
  // Two pastes for the same reason: one where the engine's own clipboardData carries the
  // data, one where the only thing on the event is an own property holding a DataTransfer
  // this realm knows nothing about.
  const pasteSeen = [];
  const onPaste = (event) => {
    pasteSeen.push({
      ownProperty: Object.prototype.hasOwnProperty.call(event, "clipboardData")
        ? "visible"
        : "hidden",
      isDataTransfer: safe(() => String(event.clipboardData instanceof view.DataTransfer)),
      hasHtml: safe(() => String((event.clipboardData?.getData("text/html") ?? "").length > 0)),
      plain: safe(() => JSON.stringify(event.clipboardData?.getData("text/plain"))),
    });
    const shadowed = Object.prototype.hasOwnProperty.call(event, "clipboardData");
    const key = shadowed ? "clipboardShadow" : "clipboardInit";
    write({
      [`${key}Visible`]: shadowed ? "visible" : "hidden",
      [`${key}IsDataTransfer`]: safe(() => String(event.clipboardData instanceof view.DataTransfer)),
      [`${key}HasHtml`]: safe(() =>
        String((event.clipboardData?.getData("text/html") ?? "").length > 0),
      ),
      [`${key}Plain`]: safe(() => JSON.stringify(event.clipboardData?.getData("text/plain"))),
    });
  };
  const onReport = () => {
    write({
      // What the editor's realm sees once the editors have had their turn, next to what
      // was there the instant the influencing realm set it.
      beforeinputSeen: [...beforeinputSeen],
      pasteSeen: [...pasteSeen],
      selection: safe(() => JSON.stringify(String(view.getSelection() ?? doc.getSelection()))),
      selectionAtSet: selectionAtSet ?? "never observed",
      selectionChanges,
      selectionchangeTargets:
        [
          changedOn.document && "document",
          changedOn.element && "element",
          changedOn.window && "window",
        ]
          .filter(Boolean)
          .join("+") || "none",
    });
  };

  doc.addEventListener("selectionchange", onSelectionChange);
  view.addEventListener("selectionchange", onSelectionChange);
  element?.addEventListener("selectionchange", onSelectionChange);
  element?.addEventListener("selectionchange", onSelectionAtSet, true);
  doc.addEventListener("beforeinput", onBeforeinput, true);
  doc.addEventListener("paste", onPaste, true);
  doc.addEventListener(PROBE_EVENT, onReport);
  delete doc.documentElement.dataset[RECORD_ATTR];

  return () => {
    doc.removeEventListener("selectionchange", onSelectionChange);
    view.removeEventListener("selectionchange", onSelectionChange);
    element?.removeEventListener("selectionchange", onSelectionChange);
    element?.removeEventListener("selectionchange", onSelectionAtSet, true);
    doc.removeEventListener("beforeinput", onBeforeinput, true);
    doc.removeEventListener("paste", onPaste, true);
    doc.removeEventListener(PROBE_EVENT, onReport);
  };
}

/**
 * Run the influencing realm's side of the probes, against an editable root.
 *
 * Every object here is built with *this* realm's constructors, which is the experiment:
 * `target.ownerDocument.defaultView` is this realm's window when the code and the editor
 * are in different worlds.
 *
 * @param {{target: HTMLElement, range: Range}} args
 * @returns {object} what the editor's realm reported, plus this realm's own readings
 */
export function dispatchAsInfluenceRealm({ target, range }) {
  const doc = target.ownerDocument;
  const view = doc.defaultView ?? globalThis;
  const out = { sameRealm: view === globalThis };
  const EventCtor = typeof view.Event === "function" ? view.Event : Event;

  // Step 2: the selection, and the announcement of it. The selection is document state,
  // so it is expected to be visible everywhere; the announcement is three events, and
  // which of them the editor's realm hears is a different answer.
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
  const selection = doc.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  for (const node of [doc, target, view]) {
    node.dispatchEvent(new EventCtor("selectionchange"));
  }
  // This realm's own reading of the same document, for comparison with what the
  // editor's realm reported seeing.
  out.selectionFromInfluenceRealm = safe(() => JSON.stringify(String(doc.getSelection())));

  // Report now, before the strategy-shaped events below: the editors react to those
  // (Wordgard inserts at the caret), and the question here is whether the selection as
  // just set is visible to the editor's realm — not what it was after the editors had
  // their turn.
  target.dispatchEvent(new EventCtor(PROBE_EVENT, { bubbles: true }));

  let staticRange = null;
  try {
    staticRange = new view.StaticRange({
      startContainer: range.startContainer,
      startOffset: range.startOffset,
      endContainer: range.endContainer,
      endOffset: range.endOffset,
    });
  } catch (error) {
    out.staticRange = `threw: ${String(error?.message ?? error).split("\n")[0]}`;
  }
  out.staticRangeIsOwnRealm = safe(() => String(staticRange instanceof view.StaticRange));

  const dispatched = [];
  const makeInput = (init) =>
    new view.InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      composed: true,
      inputType: "insertText",
      data: "probe",
      ...init,
    });

  // (a) The expando route alone.
  if (staticRange) {
    const event = makeInput({});
    try {
      Object.defineProperty(event, "getTargetRanges", {
        value: () => [staticRange],
        configurable: true,
      });
    } catch {
      out.shadow = "defineProperty threw";
    }
    out.shadowToSelf = safe(() => String(event.getTargetRanges().length));
    dispatched.push("beforeinput: target range as an own property");
    target.dispatchEvent(event);
  }
  // (b) The init-dict route alone.
  if (staticRange) {
    dispatched.push("beforeinput: targetRanges in the init dict");
    target.dispatchEvent(makeInput({ targetRanges: [staticRange] }));
  }

  const dataTransfer = new view.DataTransfer();
  dataTransfer.setData("text/plain", "probe");
  dataTransfer.setData("text/html", "<em>probe</em>");
  out.dataTransferIsOwnRealm = safe(() => String(dataTransfer instanceof view.DataTransfer));

  // (c) The engine's own clipboardData route.
  dispatched.push("paste: clipboardData in the init dict");
  target.dispatchEvent(
    new view.ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clipboardData: dataTransfer,
    }),
  );
  // (d) The shadowed route alone: clipboardData explicitly empty in the init dict, so
  // anything the editor's realm can read came from the own property.
  const shadowed = new view.ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    composed: true,
    clipboardData: null,
  });
  try {
    Object.defineProperty(shadowed, "clipboardData", {
      configurable: true,
      value: dataTransfer,
    });
  } catch {
    out.clipboardShadow = "defineProperty threw";
  }
  dispatched.push("paste: clipboardData shadowed as an own property");
  target.dispatchEvent(shadowed);
  out.dispatched = dispatched;

  // Ask the editor's realm to report what it has, and read the shared attribute. The
  // event bubbles, because the editor's realm listens at its document and this dispatch
  // happens on the editor's element.
  target.dispatchEvent(new EventCtor(PROBE_EVENT, { bubbles: true }));
  let reported = {};
  try {
    reported = JSON.parse(doc.documentElement.dataset[RECORD_ATTR] ?? "{}");
  } catch (error) {
    out.editorRecord = `unreadable: ${String(error?.message ?? error).split("\n")[0]}`;
  }
  // execCommand last: it edits, so it would clobber the selection the probes above just
  // read, and — in WebKit — it fires its own trusted beforeinput while doing it. On a
  // scratch element rather than the editor, so it cannot leave a mark on the matrix.
  out.execCommand = probeExecCommand(doc);
  return { ...reported, ...out };
}

/**
 * Does `document.execCommand` work when called from a realm other than the editor's?
 *
 * On a scratch contenteditable, because execCommand *edits*: a probe that mutates the
 * editor would make the next case's measurement wrong.
 */
function probeExecCommand(doc) {
  const scratch = doc.createElement("div");
  scratch.contentEditable = "true";
  scratch.textContent = "probe";
  scratch.style.cssText = "position:fixed;left:-9999px;top:0";
  (doc.body ?? doc.documentElement).append(scratch);
  try {
    scratch.focus({ preventScroll: true });
    const range = doc.createRange();
    range.selectNodeContents(scratch);
    const selection = doc.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const returned = scratch.ownerDocument.execCommand("insertHTML", false, "<b>probe</b>");
    return `${returned} (${scratch.innerHTML})`;
  } catch (error) {
    return `threw: ${String(error?.message ?? error).split("\n")[0]}`;
  } finally {
    scratch.remove();
  }
}

/**
 * Probes that need a frame or a scratch element rather than the editor.
 *
 * @param {Document} doc
 * @returns {Promise<object>} probe id -> what was observed
 */
export async function runEnvironmentProbes(doc = document) {
  return {
    "raf-hidden": await probeRafInHiddenFrame(doc),
    "cross-origin": await probeInaccessibleFrame(doc, "cross-origin", [
      // A data: frame is cross-origin by definition, but some engines refuse to load
      // one at all — which is a different answer, so fall back to a second host name
      // served from the same server.
      "data:text/html,<p>x",
      `http://localhost:${globalThis.location?.port ?? ""}/frame.html`,
    ]),
    sandboxed: await probeInaccessibleFrame(doc, "sandboxed", ["frame.html"]),
  };
}

/**
 * Does one animation frame ever arrive in a hidden iframe?
 *
 * The paste path's yield is a frame. A frame callback is not delivered to a hidden frame
 * in every engine, so the interesting question is not "late" but "never" — and a yield
 * that never arrives is a dispatch that never happens.
 */
async function probeRafInHiddenFrame(doc) {
  const frame = doc.createElement("iframe");
  frame.style.display = "none";
  frame.src = "about:blank";
  (doc.body ?? doc.documentElement).append(frame);
  try {
    await new Promise((resolve) => {
      frame.addEventListener("load", resolve, { once: true });
      setTimeout(resolve, 2000);
    });
    const view = frame.contentWindow;
    if (!view) return "no frame realm";
    return await new Promise((resolve) => {
      let settled = false;
      const done = (value) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };
      const timer = setTimeout(() => done("never fires in a hidden frame"), 500);
      try {
        view.requestAnimationFrame(() => {
          clearTimeout(timer);
          done("fires");
        });
      } catch (error) {
        clearTimeout(timer);
        done(`threw: ${String(error.message).split("\n")[0]}`);
      }
    });
  } finally {
    frame.remove();
  }
}

/**
 * What is reachable inside a frame the document is not allowed into.
 *
 * A `data:` frame is cross-origin by definition, and a `sandbox`ed frame is same-origin
 * by URL but opaque by policy. Both are the situation an extension is in for a frame it
 * has not been given access to. There is nothing to dispatch here — the measurement is
 * that there is nothing to reach.
 *
 * @param {Document} doc
 * @param {string} id "cross-origin" or "sandboxed"
 * @param {string[]} sources URLs to try in order, until one loads
 */
async function probeInaccessibleFrame(doc, id, sources) {
  for (const src of sources) {
    const observed = await probeOneFrame(doc, id, src);
    // A frame that never loaded tells us nothing about access, so try the next source.
    if (!observed.startsWith("did not load")) return observed;
  }
  return "did not load: every candidate frame source was refused";
}

async function probeOneFrame(doc, id, src) {
  const frame = doc.createElement("iframe");
  if (id === "sandboxed") frame.setAttribute("sandbox", "allow-scripts");
  frame.src = src;
  frame.style.display = "none";
  (doc.body ?? doc.documentElement).append(frame);
  try {
    const loaded = await new Promise((resolve) => {
      frame.addEventListener("load", () => resolve(true), { once: true });
      setTimeout(() => resolve(false), 2000);
    });
    if (!loaded) return "did not load within 2s";
    // A data: frame that this document can reach is not cross-origin, so the source
    // was refused and the caller should try the next one.
    const reachable = safe(() => (frame.contentDocument ? "reachable" : "null"));
    if (id === "cross-origin" && reachable === "reachable") {
      return "did not load as cross-origin";
    }
    const parts = [
      `contentDocument: ${reachable}`,
      `querySelector: ${safe(() => (frame.contentDocument?.querySelector("#host") ? "reachable" : "blocked"))}`,
      `getSelection: ${safe(() => (frame.contentWindow.getSelection() ? "reachable" : "null"))}`,
    ];
    return parts.join("; ");
  } finally {
    frame.remove();
  }
}

/**
 * Fold a raw probe record into one line per probe.
 *
 * Shared by the pages and the test suite, so the recorded table and the live run are
 * described in the same words.
 *
 * @param {object} raw what dispatchAsInfluenceRealm returned
 * @param {object} environment what runEnvironmentProbes returned
 * @returns {Record<string, string>} probe id -> one line
 */
export function summariseProbes(raw, environment = {}) {
  const merged = { ...environment, ...raw };
  // The engine's own error message for a blocked frame names the origin, and the
  // measurement server's port changes every run. The wording is the finding; the port
  // is noise, and keeping it would make the value unassertable.
  const withoutOrigin = (value) =>
    typeof value === "string" ? value.replace(/https?:\/\/[^"\s]+/g, "<origin>") : value;
  const dispatched = merged.dispatched ?? [];
  const inputs = merged.beforeinputSeen ?? [];
  const pastes = merged.pasteSeen ?? [];

  // Pair by dispatch position: the influencing realm sent the expando event first and
  // the init-dict event second. When the first entry reports its own property as
  // hidden, that is the finding — the own property never became visible at all.
  const [expandoSeen, initSeen] = inputs;
  const [pasteInit, pasteShadow] = pastes;
  const expandoLine = expandoSeen
    ? `own property ${expandoSeen.ownProperty} → ${expandoSeen.ranges}; init dict ${initSeen?.ownProperty ?? "?"} → ${initSeen?.ranges ?? "?"}`
    : "no beforeinput carrying a target range reached the editor's realm";
  const pasteLine = pasteShadow
    ? `init dict: own property ${pasteInit?.ownProperty ?? "?"}, instanceof DataTransfer ${pasteInit?.isDataTransfer ?? "?"}, html ${pasteInit?.hasHtml ?? "?"}; shadowed: own property ${pasteShadow.ownProperty}, instanceof ${pasteShadow.isDataTransfer}, html ${pasteShadow.hasHtml}`
    : pasteInit
      ? `init dict: own property ${pasteInit.ownProperty}, instanceof DataTransfer ${pasteInit.isDataTransfer}, html ${pasteInit.hasHtml}; the shadowed paste never reached the editor's realm`
      : "no paste reached the editor's realm";

  return {
    isTrusted: inputs[0]?.isTrusted ?? merged.isTrusted ?? "not measured",
    expando: expandoLine,
    clipboard: pasteLine,
    "targetRanges-init-dict": initSeen?.ranges ?? merged.initDictRanges ?? "not measured",
    selection: `${merged.selectionAtSet ?? "?"} when set → ${merged.selection ?? "?"} once the editors had re-synced`,
    selectionchange: `${merged.selectionchangeTargets ?? "?"} (${merged.selectionChanges ?? 0})`,
    execCommand: merged.execCommand ?? "not measured",
    "raf-hidden": merged["raf-hidden"] ?? "not measured",
    "cross-origin": withoutOrigin(merged["cross-origin"]),
    sandboxed: withoutOrigin(merged.sandboxed),
  };
}