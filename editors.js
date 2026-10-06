/**
 * Seven real rich-text editors, mounted **stock**.
 *
 * The point of this demo is to show how each editor reacts to a scripted event,
 * so nothing here is customised: no `handleDOMEvents`, no `handleKeyDown`, no
 * Quill listeners, no CKEditor plugins, no Lexical transforms, no EditContext
 * editor commands beyond its defaults. Whatever an editor does with a synthetic
 * `beforeinput` or a faked keypress is what its shipped default code does.
 *
 * Every editor is exposed through the same small interface so page.js and
 * test/verify.mjs can drive all of them identically:
 *
 *   { kind, name, version, note, el, text(), html(), rangeForWord(word), destroy() }
 *
 * `el` is the contenteditable root, which is all the strategy layer in
 * apply-edit.js needs — the whole point being that it is editor-agnostic.
 *
 * Every mounter works from the host element's *own* document, never from this
 * module's ambient `document`, so an editor can be mounted inside a same-origin
 * iframe and end up belonging to that iframe's realm. Which realm an editor
 * belongs to is the whole subject of the context measurements; see contexts.js.
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
import { $getRoot, createEditor } from "lexical";
import { $generateNodesFromDOM } from "@lexical/html";
import { registerRichText } from "@lexical/rich-text";
import { Editor as EditContextEditor, isEditContextSupported } from "editcontext-editor";

// @codemirror/view no longer ships a stylesheet (it dropped style/ in 6.43), so
// CodeMirror gets the handful of base rules it needs from demo-base.css instead.
import "quill/dist/quill.core.css";

import { CONTENT_HTML, SENTENCE, WORD, rangeForOffsets } from "./editable.js";

// Re-exported so main.js can keep exporting them from this module: the demo
// bundle's public surface predates editable.js and callers should not care.
export { CONTENT_HTML, SENTENCE, WORD, rangeForOffsets };

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
 * with the rest: build.mjs copies its stock build into vendor/ and editors.js
 * fetches it on demand the first time you switch to it.
 *
 * The path is resolved against *the host's own document*, not this module's
 * ambient one, so an editor mounted inside an iframe fetches the build from that
 * iframe's directory and the demo still works from a subdirectory — a GitHub
 * Pages project site, for instance.
 *
 * @param {Document} doc document the editor is being mounted into
 */
function loadCkeditorScript(doc) {
  const src = new URL("./vendor/ckeditor.js", doc.baseURI).href;
  if (doc.querySelector(`script[src="${src}"]`)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = doc.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`could not load ${src}`));
    (doc.head || doc.documentElement).append(script);
  });
}

async function mountCkeditor(host) {
  const doc = host.ownerDocument;
  const scope = doc.defaultView;
  await loadCkeditorScript(doc);
  const ClassicEditor = scope.ClassicEditor;
  // CKEditor 5 does not build inside the element it is handed — it inserts its
  // own container as a sibling and leaves the original empty — so it gets a
  // throwaway child to claim, and the editable is taken from the instance.
  const slot = doc.createElement("div");
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
// Lexical
// ---------------------------------------------------------------------
/**
 * Lexical is a framework rather than an out-of-the-box editor: `createEditor()`
 * alone gives you an empty, handler-less shell, and the equivalent of the React
 * `RichTextPlugin` for a plain-DOM mount is `registerRichText()` — the default
 * command handlers (backspace, controlled insertion, paste) that plugin registers
 * under the hood. That is the stock rich-text configuration, so that is what is
 * mounted here: no custom commands, no transforms, no plugins beyond it.
 */
function mountLexical(host) {
  const doc = host.ownerDocument;
  // Lexical takes a root element it manages in place (and flips to
  // contenteditable itself), so it gets its own child, like every other mounter.
  const root = doc.createElement("div");
  host.append(root);
  const editor = createEditor({
    namespace: "demo",
    theme: {},
    onError(error) {
      throw error;
    },
  });
  registerRichText(editor);
  editor.setRootElement(root);
  // The content arrives through the same DOM parse the other HTML-ingesting
  // editors use; `discrete` commits the DOM in the same task, so text() reads
  // real content the moment mounting returns.
  editor.update(
    () => {
      const dom = new doc.defaultView.DOMParser().parseFromString(
        `<p>${CONTENT_HTML}</p>`,
        "text/html",
      );
      // The parse yields the paragraph itself; wrapping it again would nest <p> in <p>.
      $getRoot().clear().append(...$generateNodesFromDOM(editor, dom));
    },
    { discrete: true },
  );
  const spec = wrap(
    {
      kind: "lexical",
      name: "Lexical",
      version: "0.52.0",
      note:
        "Handles beforeinput in core, but the range is only a guard: for beforeinput it " +
        "re-derives its selection from the DOM selection, so insertReplacementText works " +
        "with or without getTargetRanges() and needs the selection set. The replacement " +
        "itself comes from event.dataTransfer when the engine kept the init dict's " +
        "(Chromium and Firefox — the text/html flavour, so the edit is formatting-aware) " +
        "and falls back to event.data with the replaced range's marks where it did not " +
        "(WebKit). insertText is stricter — without a non-collapsed target range it falls " +
        "into 'let the browser handle it', and a synthetic event has no default action. " +
        "Paste and Backspace work; execCommand is reconciled away; the {getData, setData} " +
        "clipboard proxy throws.",
      // Lexical exposes no destroy(); setRootElement(null) is the teardown —
      // it unregisters the root, removes the listeners and detaches the
      // MutationObserver that setRootElement attached.
      destroy: () => editor.setRootElement(null),
    },
    root,
  );
  spec.lexical = editor;
  return spec;
}

// ---------------------------------------------------------------------
// EditContext editor
// ---------------------------------------------------------------------
/**
 * The EditContext editor is the odd one out twice over. It is not built on
 * `contenteditable`: the editable surface is a plain focusable div with an
 * `EditContext` attached, the document lives in the editor's own JSON model,
 * and raw text input flows through the EditContext buffer rather than through
 * DOM editing. And it is the one editor here that not every engine can run:
 * the EditContext API has shipped in Chromium only, so the mounter refuses —
 * with a reason — everywhere else, and the measurements cover just that engine.
 */
function mountEditContext(host) {
  const doc = host.ownerDocument;
  if (!isEditContextSupported()) {
    throw new Error("the EditContext API has not shipped in this engine");
  }
  // Like every mounter, it gets its own child to manage; the library turns it
  // into the editable surface (tabindex, role, its own caret) in place.
  const root = doc.createElement("div");
  host.append(root);
  const editor = new EditContextEditor({ element: root });
  // The constructor does not sniff HTML strings — setContent is the entry that
  // parses HTML into the JSON model.
  editor.setContent(`<p>${CONTENT_HTML}</p>`);
  const spec = wrap(
    {
      kind: "editcontext",
      name: "EditContext editor",
      version: "0.1.0",
      note:
        "Not contenteditable: a plain div with an EditContext attached, a JSON document " +
        "model, and its own rendered caret. Raw text input is applied to the EditContext " +
        "buffer by the browser and reported as textupdate, so synthetic insertText, " +
        "deleteContentBackward and a faked Backspace have nothing to act on. It handles " +
        "beforeinput insertReplacementText from event.data directly, at whatever the model " +
        "selection is — aim it with the DOM selection. Paste is handled from " +
        "beforeinput(insertFromPaste), not from a paste event, so a synthetic paste does " +
        "nothing, and execCommand finds no editable region to act on.",
      destroy: () => editor.destroy(),
    },
    root,
  );
  spec.editContext = editor;
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
  { kind: "lexical", label: "Lexical", version: "0.52.0" },
  { kind: "editcontext", label: "EditContext editor", version: "0.1.0" },
];

export const MOUNTERS = {
  prosemirror: mountProseMirror,
  wordgard: mountWordgard,
  quill: mountQuill,
  codemirror: mountCodeMirror,
  ckeditor: mountCkeditor,
  lexical: mountLexical,
  editcontext: mountEditContext,
};

export function mountEditor(kind, host) {
  const mounter = MOUNTERS[kind];
  if (!mounter) {
    throw new Error(`unknown editor "${kind}"`);
  }
  return mounter(host);
}