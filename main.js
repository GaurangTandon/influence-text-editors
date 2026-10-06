/**
 * Bundle entry point. ProseMirror, Wordgard, Quill, CodeMirror, Lexical and the
 * EditContext editor go into
 * vendor/demo.js as a single IIFE exposing a `LingoDemo` global, so the pages stay
 * free of module plumbing. CKEditor 5 is ~4 MB and loads its own assets at runtime,
 * so it is copied into vendor/ and fetched on demand instead.
 *
 * The same bundle is loaded three ways: by the top document, by frame.html inside a
 * same-origin iframe (so it can host an editor or host the influencing code), and —
 * separately bundled, sharing only editable.js and strategy-runners.js — by the
 * example extension's content scripts.
 */

export * from "./apply-edit.js";
export * from "./expectations.js";
export * from "./cases.js";
export * from "./contexts.js";
export * from "./context-impls.js";
export * from "./demo-ui.js";
export * from "./editable.js";
export * from "./extension-bridge.js";
export * from "./probes.js";
export * from "./strategy-runners.js";
export {
  CONTENT_HTML,
  EDITORS,
  MOUNTERS,
  SENTENCE,
  WORD,
  mountEditor,
} from "./editors.js";