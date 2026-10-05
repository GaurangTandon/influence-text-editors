/**
 * How each context actually wires the two sides together.
 *
 * `contexts.js` says what the contexts *are*; this says what the page has to do to
 * bring one about. Split that way because contexts.js is imported by test/harness.mjs
 * in node, where none of this exists.
 *
 * Every context is the same shape:
 *
 *   mount(kind, hostEl)              -> the editor handle, mounted wherever it belongs
 *   dispatch(button, {editor, range}) -> what happened, in the realm that ran it
 *   reset()                          -> drop any frame state between editor switches
 *
 * The two iframe contexts are the reason `apply-edit.js` derives its constructors from
 * `target.ownerDocument.defaultView`: with that in place, "run the code from the other
 * realm" is a matter of which copy of the function you call, and nothing else.
 */

import { TOP } from "./contexts.js";
import { mountEditor } from "./editors.js";
import { runStrategy } from "./strategy-runners.js";

/**
 * The baseline: editor and code both in this document.
 *
 * Also the fallback every other context starts from, so a failure to build a frame or
 * reach an extension is reported as "that context is unavailable" rather than as an
 * editor that stopped working.
 */
export function sameDocumentContext({ doc = document } = {}) {
  return {
    id: TOP,
    async mount(kind, hostEl) {
      return mountEditor(kind, hostEl);
    },
    async dispatch(button, args) {
      return runStrategy(button, {
        target: args.editor.el,
        range: args.range,
        ui: args.ui,
      });
    },
  };
}

/**
 * Editor in a same-origin iframe, code in the top document.
 *
 * The editor is mounted by the *frame's* copy of the bundle, because that is what an
 * editor inside an iframe really is: its own realm's classes, its own document, its own
 * event constructors. Mounting it from the parent's copy would measure a different
 * thing — a set of library objects from one realm operating on another realm's nodes —
 * which is not what any real page contains.
 */
export function editorInIframeContext({ frameUrl = "./frame.html" } = {}) {
  const state = { frame: null, api: null };
  return {
    id: "editor-in-iframe",
    frameUrl,
    /** Create (or recreate) the frame and take a reference to the editor's realm API. */
    async ensureFrame(doc = document) {
      if (state.frame?.isConnected) return state.api;
      state.frame = await mountFrame(doc, frameUrl, { visible: true });
      // The frame loads the same bundle, so its window has its own complete LingoDemo
      // — its own InputEvent, DataTransfer, StaticRange, and its own editors. Wait for
      // the namespace itself, not for one member of it.
      state.api = await waitFor(() => state.frame.contentWindow?.LingoDemo);
      if (!state.api) throw new Error("the iframe never finished loading the demo bundle");
      return state.api;
    },
    async mount(kind, hostEl) {
      const api = await this.ensureFrame();
      const frameDoc = state.frame.contentDocument;
      const host = frameDoc.getElementById("host");
      host.replaceChildren();
      return api.mountEditor(kind, host);
    },
    async dispatch(button, args) {
      return runStrategy(button, {
        target: args.editor.el,
        range: args.range,
        ui: args.ui,
      });
    },
    /** The editor's own document, once the frame exists — where its probes must run. */
    editorDoc() {
      return state.frame?.contentDocument ?? null;
    },
    reset() {
      state.frame?.remove();
      state.frame = null;
      state.api = null;
    },
  };
}

/**
 * Code in a same-origin iframe, editor in the top document.
 *
 * The mirror image, and the shape an extension's engine iframe has. The influencing
 * code is a function from the frame's realm, applied to an editor element that belongs
 * to this realm — so the DataTransfer it builds is the frame's DataTransfer, and the
 * editor's `instanceof` check runs in a realm that has never heard of it.
 */
export function codeInIframeContext({ frameUrl = "./frame.html" } = {}) {
  const state = { frame: null, api: null };
  return {
    id: "code-in-iframe",
    frameUrl,
    async ensureFrame(doc = document) {
      if (state.frame?.isConnected) return state.api;
      state.frame = await mountFrame(doc, frameUrl, { visible: false });
      state.api = await waitFor(() => state.frame.contentWindow?.LingoDemo);
      if (!state.api) throw new Error("the iframe never finished loading the demo bundle");
      return state.api;
    },
    async mount(kind, hostEl) {
      await this.ensureFrame();
      return mountEditor(kind, hostEl);
    },
    async dispatch(button, args) {
      const api = state.api;
      // Deliberately a *direct* call across the realm boundary, with this realm's DOM
      // node passed in: that is the strongest form of the question. The frame's copy of
      // runStrategy then builds its events with the frame's own constructors.
      return api.runStrategy(button, {
        target: args.editor.el,
        range: args.range,
        ui: args.ui,
      });
    },
    /**
     * The influencing half of the probes, run from this frame's realm, against an
     * editor element that belongs to the parent document.
     *
     * Dispatching it from here rather than from the parent is the whole point: the
     * parent's copy would build its events with the parent's constructors, and the
     * experiment is what happens when the *frame's* copy does it.
     */
    async probe({ target, range }) {
      return state.api.dispatchAsInfluenceRealm({ target, range });
    },
    reset() {
      state.frame?.remove();
      state.frame = null;
      state.api = null;
    },
  };
}

/** Create a same-origin iframe and wait for its document to be usable. */
function mountFrame(doc, url, { visible }) {
  return new Promise((resolve) => {
    const frame = doc.createElement("iframe");
    frame.className = "context-frame";
    frame.dataset.lingoContext = url;
    if (!visible) {
      frame.style.display = "none";
    } else {
      frame.style.width = "100%";
      frame.style.minHeight = "150px";
      frame.style.border = "1px solid #d7dce3";
      frame.style.borderRadius = "6px";
    }
    frame.src = url;
    frame.addEventListener("load", () => resolve(frame), { once: true });
    (doc.body ?? doc.documentElement).append(frame);
  });
}

/** Poll for a value to appear on the frame's window. */
function waitFor(get, { timeoutMs = 10000, everyMs = 25 } = {}) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const tick = () => {
      let value = null;
      try {
        value = get();
      } catch {
        // The frame may still be navigating; try again.
      }
      if (value) {
        resolve(value);
        return;
      }
      if (performance.now() - started > timeoutMs) {
        reject(new Error("timed out waiting for the iframe"));
        return;
      }
      setTimeout(tick, everyMs);
    };
    tick();
  });
}