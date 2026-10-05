/**
 * Bundle entry point. ProseMirror, Wordgard, Quill and CodeMirror go into
 * vendor/demo.js as a single IIFE exposing a `LingoDemo` global, so index.html
 * stays free of module plumbing. CKEditor 5 is ~4 MB and loads its own assets at
 * runtime, so it is copied into vendor/ and fetched on demand instead.
 */

export * from "./apply-edit.js";
export * from "./expectations.js";
export {
  CONTENT_HTML,
  EDITORS,
  MOUNTERS,
  SENTENCE,
  WORD,
  mountEditor,
  rangeForOffsets,
} from "./editors.js";