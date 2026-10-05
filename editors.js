/**
 * Four real rich-text editors, mounted **stock**.
 *
 * The point of this demo is to show how each editor reacts to a scripted event,
 * so nothing here is customised: no `handleDOMEvents`, no `handleKeyDown`, no
 * Quill listeners, no CKEditor plugins. Whatever an editor does with a synthetic
 * `beforeinput` or a faked keypress is what its shipped default code does.
 *
 * Every editor is exposed through the same small interface so page.js and
 * test/verify.mjs can drive all four identically:
 *
 *   { kind, name, version, note, el, text(), html(), rangeForWord(word), destroy() }
 *
 * `el` is the contenteditable root, which is all the strategy layer in
 * apply-edit.js needs — the whole point being that it is editor-agnostic.
 */

import { schema as basicSchema } from "prosemirror-schema-basic";
import { EditorState as PMState } from "prosemirror-state";
import { EditorView as PMView } from "prosemirror-view";
import Quill from "quill";
import { EditorState as CMState } from "@codemirror/state";
import { EditorView as CMView, keymap as cmKeymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { Wordgard } from "wordgard/editor";
import { fullSchema } from "wordgard/schema";

// @codemirror/view no longer ships a stylesheet (it dropped style/ in 6.43), so
// CodeMirror gets the handful of base rules it needs from index.html instead.
import "quill/dist/quill.core.css";

/** The pre-existing content every editor starts with. */
export const SENTENCE = "The quick brown fox jumps over the lazy dog.";
export const CONTENT_HTML = "The <strong>quick</strong> brown fox jumps over the <em>lazy</em> dog.";
/** The word every demo aims at. */
export const WORD = "quick";

/**
 * DOM Range covering the first occurrence of `word` in an editable root.
 *
 * A TreeWalker over SHOW_TEXT is the only portable way to map character offsets
 * onto DOM points: inline formatting splits one sentence across several text
 * nodes, so child indices are useless.
 *
 * @param {HTMLElement} el contenteditable root
 * @param {number} start
 * @param {number} end
 * @returns {Range}
 */
export function rangeForOffsets(el, start, end) {
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let startPoint = null;
  let endPoint = null;
  let offset = 0;
  let node;
  while ((node = walker.nextNode())) {
    const next = offset + node.data.length;
    if (startPoint === null && next > start) {
      startPoint = [node, start - offset];
    }
    if (next >= end) {
      endPoint = [node, end - offset];
      break;
    }
    offset = next;
  }
  if (!startPoint || !endPoint) {
    throw new Error(`cannot map offsets ${start}..${end} onto ${el.className || el.tagName}`);
  }
  const range = doc.createRange();
  range.setStart(startPoint[0], startPoint[1]);
  range.setEnd(endPoint[0], endPoint[1]);
  return range;
}

/** Shared tail: text, rangeForWord, and the uniform interface. */
function wrap(spec, el) {
  // A stable, behaviour-neutral handle on the editable root, so CSS and the
  // test suite can find every engine's root the same way. CKEditor in
  // particular does not keep the element it was given.
  el.dataset.demoEditor = spec.kind;
  return {
    ...spec,
    el,
    // Plain text straight from the rendered DOM. Reading it from each editor's
    // own API instead (getData()/getContent()) would return *HTML* for
    // CKEditor and TinyMCE, and then the offsets would not line up with the
    // TreeWalker walk above — which silently produces edits in the wrong place.
    text: () => el.textContent,
    html: () => el.innerHTML,
    rangeForWord(word) {
      const index = el.textContent.indexOf(word);
      if (index === -1) {
        throw new Error(`"${word}" is not in ${spec.name}`);
      }
      return rangeForOffsets(el, index, index + word.length);
    },
  };
}

// ---------------------------------------------------------------------
// ProseMirror
// ---------------------------------------------------------------------
function mountProseMirror(host) {
  const doc = basicSchema.node("doc", null, [
    basicSchema.node("paragraph", null, [
      basicSchema.text("The "),
      basicSchema.text(WORD, [basicSchema.marks.strong.create()]),
      basicSchema.text(" brown fox jumps over the "),
      basicSchema.text("lazy", [basicSchema.marks.em.create()]),
      basicSchema.text(" dog."),
    ]),
  ]);
  const view = new PMView(host, { state: PMState.create({ schema: basicSchema, doc }) });
  const spec = wrap(
    {
      kind: "prosemirror",
      name: "ProseMirror",
      version: "1.42.5",
      note:
        "No built-in beforeinput insertion handler: prosemirror-view's own is " +
        "if (android && event.inputType == \"deleteContentBackward\"). Backspace is " +
        "left to the browser and read back through its MutationObserver, so a " +
        "scripted keypress cannot work either.",
      destroy: () => view.destroy(),
    },
    view.dom,
  );
  return spec;
}

// ---------------------------------------------------------------------
// Quill 2
// ---------------------------------------------------------------------
function mountQuill(host) {
  const quill = new Quill(host, { theme: null, formats: ["bold", "italic"] });
  quill.clipboard.dangerouslyPasteHTML(`<p>${CONTENT_HTML}</p>`);
  const spec = wrap(
    {
      kind: "quill",
      name: "Quill 2",
      version: "2.0.3",
      note:
        "Does handle beforeinput natively, in core/input.ts: it allow-lists " +
        "[insertText, insertReplacementText], then reads getTargetRanges()[0] and " +
        "returns immediately if it is missing. Its keyboard bindings are " +
        "keydown-driven, so a faked Backspace works.",
    },
    quill.root,
  );
  spec.quill = quill;
  // Quill 2 exposes no destroy(); everything it listens on hangs off
  // `quill.root`, which page.js drops from the document.
  spec.destroy = () => quill.off();
  return spec;
}

// ---------------------------------------------------------------------
// CodeMirror 6
// ---------------------------------------------------------------------
function mountCodeMirror(host) {
  const view = new CMView({
    parent: host,
    state: CMState.create({
      doc: SENTENCE,
      // Stock defaultKeymap is what makes the faked Backspace work.
      extensions: [cmKeymap.of(defaultKeymap)],
    }),
  });
  return wrap(
    {
      kind: "codemirror",
      name: "CodeMirror 6",
      version: "6.43.13",
      note:
        "No beforeinput handler at all, but defaultKeymap handles Backspace in " +
        "its own keydown handler, so a faked Backspace is applied natively. " +
        "execCommand and synthetic paste both work.",
      destroy: () => view.destroy(),
    },
    view.contentDOM,
  );
}

// ---------------------------------------------------------------------
// CKEditor 5
// ---------------------------------------------------------------------
/**
 * CKEditor 5 is ~4 MB and loads its own assets at runtime, so it is not bundled
 * with the rest: build.mjs copies its stock build into vendor/ and it is fetched
 * on demand the first time you switch to it.
 *
 * The path is relative to the document, so the demo works from a subdirectory —
 * a GitHub Pages project site, for instance.
 */
function loadCkeditorScript() {
  const src = "./vendor/ckeditor.js";
  if (document.querySelector(`script[src="${src}"]`)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.append(script);
  });
}

async function mountCkeditor(host) {
  await loadCkeditorScript();
  const ClassicEditor = window.ClassicEditor;
  // CKEditor 5 does not build inside the element it is handed — it inserts its
  // own container as a sibling and leaves the original empty — so it gets a
  // throwaway child to claim, and the editable is taken from the instance.
  const slot = document.createElement("div");
  host.append(slot);
  const editor = await ClassicEditor.create(slot, {
    licenseKey: "GPL",
    initialData: `<p>${CONTENT_HTML}</p>`,
    toolbar: ["bold", "italic", "|", "undo", "redo"],
  });
  const spec = wrap(
    {
      kind: "ckeditor",
      name: "CKEditor 5",
      version: "5.41.4",
      note:
        "Handles beforeinput, and also reads getTargetRanges()[0] — it applies the " +
        "edit only when a range is attached. Ignores execCommand entirely, but " +
        "returns true for it, so 'the command did not throw' is not a usable " +
        "success signal.",
      // Important: CKEditor 5 keeps document-level listeners, so simply
      // dropping its DOM out of the page leaves a live editor reacting to
      // everything afterwards. It must be destroyed properly — and
      // `destroy()` is asynchronous, so callers have to await it before
      // touching the document again, or a half-torn-down editor trips over its
      // own selection observer.
      destroy: () => editor.destroy(),
    },
    editor.editing.view.getDomRoot(),
  );
  spec.ckeditor = editor;
  return spec;
}

// ---------------------------------------------------------------------
// Wordgard
// ---------------------------------------------------------------------
/**
 * Wordgard is the successor to ProseMirror by the same author, and it is the
 * interesting one here: its beforeinput handler actually reads
 * `getTargetRanges()` and maps the range into document positions, which is the
 * code path ProseMirror does not have.
 */
function mountWordgard(host) {
  const editor = Wordgard.create({
    parent: host,
    doc: `<p>${CONTENT_HTML}</p>`,
    config: [fullSchema()],
  });
  const spec = wrap(
    {
      kind: "wordgard",
      name: "Wordgard",
      version: "0.5.2",
      note:
        "Implements beforeinput and reads getTargetRanges()[0], mapping it into " +
        "document positions. insertText and the delete* types act on that range; " +
        "insertReplacementText reads event.dataTransfer, which no engine fills in " +
        "from the init dict, so it silently does nothing.",
      // No destroy() in 0.5.2; everything it listens on hangs off the editable.
    },
    // Not editor.dom: that is the outer <wordgard-editor> wrapper, and events
    // dispatched on it never reach the nested contenteditable.
    editor.contentDOM,
  );
  spec.wordgard = editor;
  return spec;
}

export const EDITORS = [
  { kind: "prosemirror", label: "ProseMirror", version: "1.42.5" },
  { kind: "wordgard", label: "Wordgard", version: "0.5.2" },
  { kind: "quill", label: "Quill 2", version: "2.0.3" },
  { kind: "codemirror", label: "CodeMirror 6", version: "6.43.13" },
  { kind: "ckeditor", label: "CKEditor 5", version: "5.41.4" },
];

export const MOUNTERS = {
  prosemirror: mountProseMirror,
  wordgard: mountWordgard,
  quill: mountQuill,
  codemirror: mountCodeMirror,
  ckeditor: mountCkeditor,
};

export function mountEditor(kind, host) {
  const mounter = MOUNTERS[kind];
  if (!mounter) {
    throw new Error(`unknown editor "${kind}"`);
  }
  return mounter(host);
}