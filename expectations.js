// What each editor does with each strategy, in each browser.
//
// Classify *what the editor ended up with*, not "did anything change": deleting
// the target word is also a change, and it is the one change that loses the
// user's text.
//
// This file is generated in part — run `npm run record` to re-measure the three
// engines and rewrite everything between the GENERATED markers below. The prose,
// the classifier and the capability notes above them are hand-maintained, because
// they are the part that has to be *understood* rather than recorded.
//
// `test/verify.mjs` asserts a fresh measurement against these tables, so the
// tables cannot silently drift; and index.html renders its own table out of
// them, so the page cannot disagree with the tests either.

export const ORIGINAL = "The quick brown fox jumps over the lazy dog.";
export const REPLACED = "The sluggish brown fox jumps over the lazy dog.";
export const DELETED = "The  brown fox jumps over the lazy dog.";
export const AT_CARET = "sluggish" + ORIGINAL;

export const OUTCOMES = {
  unchanged: "unchanged",
  replaced: "replaced",
  deleted: "deleted",
  atCaret: "at-caret",
};

export function classifyOutcome(text) {
  // Chromium and Safari re-serialise a space next to an inline element inside
  // contenteditable as U+00A0 after execCommand.
  const flat = String(text).replace(/\u00a0/g, " ").trim();
  if (flat === ORIGINAL) return OUTCOMES.unchanged;
  if (flat === REPLACED) return OUTCOMES.replaced;
  if (flat === DELETED) return OUTCOMES.deleted;
  if (flat === AT_CARET) return OUTCOMES.atCaret;
  return `unexpected:${flat}`;
}

/**
 * Characters an editor can introduce into the document text that a reader never
 * asked for. Chromium and WebKit re-serialise a space next to an inline element
 * inside `contenteditable` as U+00A0, so an editor that does not normalise it
 * ends up with a *different text* than the one that was inserted.
 *
 * Reported by name rather than codepoint so the tables stay readable. Anything
 * outside printable ASCII (plus newline) is reported, so a new artifact shows up
 * without this list needing updating.
 */
export const ARTIFACT_NAMES = {
  "\u00a0": "nbsp",
  "\u00ad": "soft-hyphen",
  "\u200b": "zero-width",
  "\ufeff": "bom",
};

/**
 * @param {string} text the editor's text content
 * @returns {string[]} artifact names present, sorted, empty if none
 */
export function detectArtifacts(text) {
  const found = new Set();
  for (const character of String(text)) {
    const code = character.codePointAt(0);
    // Printable ASCII, space included, plus the whitespace we split on.
    if (code >= 0x20 && code <= 0x7e) {
      continue;
    }
    if (code === 0x0a || code === 0x0d || code === 0x09) {
      continue;
    }
    found.add(ARTIFACT_NAMES[character] ?? `u+${code.toString(16)}`);
  }
  return [...found].sort();
}

/**
 * Cells whose outcome depends on machine load rather than on the engine's
 * behaviour, so a repeated measurement disagrees with itself. Recorded as an
 * explicit set of everything observed, instead of pinned to whichever side
 * happened to win on the day.
 *
 * WebKit: a paste dispatched after `setTimeout(0)` races Wordgard's own
 * asynchronous selection sync. WebKit's zero-delay timer fires with no
 * intervening frame, so whether Wordgard has processed the `selectionchange` by
 * then comes down to what else the machine is doing. Measured `at-caret` when
 * recorded in isolation and `replace` when run after the other two engines in the
 * same process. Both are real; neither is more correct.
 *
 * `test/record.mjs` unions these into whatever it measures, and `test/verify.mjs`
 * accepts any of them.
 */
export const LOAD_SENSITIVE_CELLS = {
  webkit: {
    "synthetic paste, yield one task first": {
      wordgard: ["at-caret", "replaced"],
    },
  },
};

/**
 * The same idea, per context: cells whose outcome is not deterministic in that context,
 * so a fresh measurement may legitimately land on any of the listed values.
 *
 * In the isolated world inside a frame in Firefox, the paste path is broken outright and
 * *which way* it breaks is not stable — the editor may not even consume the selection
 * before giving up. The finding is that the paste fails; which shape the failure takes
 * is not the claim, so those shapes are recorded as a set.
 */
export const CONTEXT_LOAD_SENSITIVE_CELLS = {
  "editor-in-iframe": {
    firefox: {
      // Wordgard's beforeinput rows inside a frame in Firefox flap between "the
      // editor's re-sync left the selection empty and nothing happened" and "the edit
      // landed". Both are real runs; which one you get depends on timing that the
      // page does not control.
      "beforeinput + getTargetRanges()": { wordgard: ["replaced", "unchanged"] },
      "beforeinput + range, no DOM selection": { wordgard: ["replaced", "unchanged"] },
      "beforeinput (insertText) + getTargetRanges()": { wordgard: ["replaced", "unchanged"] },
      "beforeinput (insertText), no DOM selection (override)": {
        wordgard: ["replaced", "unchanged"],
      },
      "synthetic paste": { wordgard: ["at-caret", "unchanged"] },
      "synthetic paste, clipboardData shadowed as a proxy object": {
        wordgard: ["at-caret", "unchanged"],
      },
      "synthetic paste, clipboardData shadowed as the real DataTransfer": {
        wordgard: ["at-caret", "unchanged"],
      },
      "synthetic paste, yield one task first": { wordgard: ["replaced", "unchanged"] },
      "synthetic paste, yield one frame first": { wordgard: ["replaced", "unchanged"] },
      "synthetic paste, real DataTransfer + yield one frame": {
        wordgard: ["replaced", "unchanged"],
      },
      // The delete* and init-dict beforeinput rows race the same way: the shadowed
      // and init-dict ranges both cross into a same-origin frame, so the edit can
      // land or the re-sync can swallow it.
      "beforeinput (deleteContentBackward) + getTargetRanges()": {
        wordgard: ["deleted", "unchanged"],
      },
      "beforeinput (insertText) + targetRanges in init dict": {
        wordgard: ["replaced", "unchanged"],
      },
      "beforeinput (deleteContentBackward) + targetRanges in init dict": {
        wordgard: ["deleted", "unchanged"],
      },
      "beforeinput (insertText), no DOM selection (init dict)": {
        wordgard: ["replaced", "unchanged"],
      },
      "paste via beforeinput (insertFromPaste), paste as backup": {
        wordgard: ["replaced", "unchanged"],
      },
    },
    webkit: {
      // The same Wordgard frame race, seen in WebKit's editor-in-iframe runs —
      // the README calls WebKit "the same shape as Firefox", and the sets agree.
      "beforeinput + getTargetRanges()": { wordgard: ["replaced", "unchanged"] },
      "beforeinput + range, no DOM selection": { wordgard: ["replaced", "unchanged"] },
      "beforeinput (insertText) + getTargetRanges()": { wordgard: ["replaced", "unchanged"] },
      "beforeinput (deleteContentBackward) + getTargetRanges()": {
        wordgard: ["deleted", "unchanged"],
      },
      "beforeinput (insertText) + targetRanges in init dict": {
        wordgard: ["replaced", "unchanged"],
      },
      "beforeinput (deleteContentBackward) + targetRanges in init dict": {
        wordgard: ["deleted", "unchanged"],
      },
      "beforeinput (insertText), no DOM selection (override)": {
        wordgard: ["replaced", "unchanged"],
      },
      "beforeinput (insertText), no DOM selection (init dict)": {
        wordgard: ["replaced", "unchanged"],
      },
      "synthetic paste": { wordgard: ["at-caret", "unchanged"] },
      "synthetic paste, clipboardData shadowed as a proxy object": {
        wordgard: ["at-caret", "unchanged"],
      },
      "synthetic paste, clipboardData shadowed as the real DataTransfer": {
        wordgard: ["at-caret", "unchanged"],
      },
      "synthetic paste, yield one task first": { wordgard: ["replaced", "unchanged"] },
      "synthetic paste, yield one frame first": { wordgard: ["replaced", "unchanged"] },
      "synthetic paste, real DataTransfer + yield one frame": {
        wordgard: ["replaced", "unchanged"],
      },
      "paste via beforeinput (insertFromPaste), paste as backup": {
        wordgard: ["replaced", "unchanged"],
      },
    },
  },
  "extension-isolated": {
    chromium: {
      // The two-step paste from the isolated world: the backup paste event crosses
      // with its contents most runs, but the full-matrix runs have also observed
      // the clipboard arrive empty — Quill and CodeMirror then wipe the selection
      // and insert nothing, the others see nothing to do. Which shape a run takes
      // depends on timing the page does not control.
      "paste via beforeinput (insertFromPaste), paste as backup": {
        prosemirror: ["replaced", "unchanged"],
        wordgard: ["replaced", "unchanged"],
        quill: ["replaced", "deleted"],
        codemirror: ["replaced", "deleted"],
        ckeditor: ["replaced", "unchanged"],
        lexical: ["replaced", "unchanged"],
      },
    },
  },
  "extension-isolated-in-iframe": {
    chromium: {
      // Same isolated-world backup-paste race as above, with the editor in a frame.
      "paste via beforeinput (insertFromPaste), paste as backup": {
        prosemirror: ["replaced", "unchanged"],
        wordgard: ["replaced", "unchanged"],
        quill: ["replaced", "deleted"],
        codemirror: ["replaced", "deleted"],
        ckeditor: ["replaced", "unchanged"],
        lexical: ["replaced", "unchanged"],
      },
    },
    firefox: {
      // Wordgard's init-dict beforeinput rows combine the isolated world with the
      // frame: the init-dict range crosses the world (the shadowed one would not),
      // so the edit *can* land — but Wordgard's asynchronous selection re-sync
      // inside the frame races the dispatch, exactly as in editor-in-iframe above.
      // Whether it lands depends on machine load, so both shapes are recorded.
      "beforeinput (insertText) + targetRanges in init dict": {
        wordgard: ["replaced", "unchanged"],
      },
      "beforeinput (deleteContentBackward) + targetRanges in init dict": {
        wordgard: ["deleted", "unchanged"],
      },
      "beforeinput (insertText), no DOM selection (init dict)": {
        wordgard: ["replaced", "unchanged"],
      },
      "synthetic paste, yield one frame first": {
        quill: ["deleted", "unchanged"],
        codemirror: ["deleted", "unchanged"],
      },
      "synthetic paste, real DataTransfer + yield one frame": {
        prosemirror: ["replaced", "unchanged"],
        wordgard: ["replaced", "unchanged"],
        quill: ["replaced", "deleted", "unchanged"],
        codemirror: ["replaced", "deleted", "unchanged"],
        ckeditor: ["replaced", "unchanged"],
      },
    },
  },
};

/**
 * How to tell the engines apart at runtime, for the page's own table.
 *
 * Order matters: every Blink build advertises "AppleWebKit/537.36" as well as
 * "Chrome/…", so Chromium has to be tested before WebKit. WebKit's user agent —
 * real Safari, and the one Playwright's Linux build spoofs — has no "Chrome".
 */
export const BROWSER_KEYS = [
  { key: "firefox", test: /Firefox\// },
  { key: "chromium", test: /Chrome\/|Chromium\/|HeadlessChrome\// },
  { key: "webkit", test: /AppleWebKit\// },
];

/**
 * Engine capability probes that explain the differences in the tables below.
 * Asserted by test/verify.mjs, because they are the mechanism: if Firefox starts
 * honouring `clipboardData`, its paste rows have to change with it.
 */
export const CAPABILITIES = {
  // clipboardData in the ClipboardEvent init dict, and dataTransfer in the
  // InputEvent init dict.
  // clipboardData: whether the engine keeps the *contents* of the clipboardData
  // passed in the ClipboardEventInit dict.
  // clipboardIsReal: whether that clipboardData is a real DataTransfer instance.
  //   Always true, which is exactly why shadowing a hand-rolled {getData,setData}
  //   object instead is a regression — see CLIPBOARD_SUPPLY in apply-edit.js.
  // dataTransfer: whether the engine keeps the dataTransfer passed in the
  //   InputEventInit dict, contents included. Chromium and Firefox do; WebKit
  //   drops it (event.dataTransfer comes back null), which is why Wordgard's
  //   insertReplacementText throws there and Lexical falls back to event.data.
  // targetRanges: whether the engine keeps sequence<StaticRange> targetRanges
  // from the InputEventInit dict.
  chromium: { clipboardData: true, clipboardIsReal: true, dataTransfer: true, targetRanges: true },
  firefox: { clipboardData: false, clipboardIsReal: true, dataTransfer: true, targetRanges: true },
  webkit: { clipboardData: true, clipboardIsReal: true, dataTransfer: false, targetRanges: false },
};

/**
 * Which engines each editor can *run* in — a property of the editor, not of any
 * strategy. The EditContext editor is not contenteditable: it needs the
 * EditContext API, which has shipped in Chromium only, so Firefox and WebKit
 * cannot mount it at all. Their recorded tables therefore have no `editcontext`
 * cells — an absent column is the honest entry, the same rule the WebKit
 * extension contexts follow — and the pages and README mark those cells
 * `not supported here` / `n/a` instead of implying a measurement.
 */
export const EDITOR_ENGINES = {
  prosemirror: ["chromium", "firefox", "webkit"],
  wordgard: ["chromium", "firefox", "webkit"],
  quill: ["chromium", "firefox", "webkit"],
  codemirror: ["chromium", "firefox", "webkit"],
  ckeditor: ["chromium", "firefox", "webkit"],
  lexical: ["chromium", "firefox", "webkit"],
  editcontext: ["chromium"],
};

/** Why an engine has no column for an editor. Never leave a gap unexplained. */
export const EDITOR_UNMEASURED = {
  editcontext: "the EditContext API has not shipped in this engine (Chromium only)",
};

// --- BEGIN GENERATED by test/record.mjs — do not edit by hand ---

export const EDITOR_KINDS = [
  "prosemirror",
  "wordgard",
  "quill",
  "codemirror",
  "ckeditor",
  "lexical",
  "editcontext"
];

export const ROW_LABELS = [
  "beforeinput + getTargetRanges()",
  "beforeinput, no getTargetRanges()",
  "beforeinput + range, no DOM selection",
  "beforeinput (insertText) + getTargetRanges()",
  "beforeinput (insertText), no getTargetRanges()",
  "beforeinput (deleteContentBackward) + getTargetRanges()",
  "beforeinput (deleteContentBackward), no getTargetRanges()",
  "beforeinput (insertText) + targetRanges in init dict",
  "beforeinput (deleteContentBackward) + targetRanges in init dict",
  "beforeinput (insertText), no DOM selection (override)",
  "beforeinput (insertText), no DOM selection (init dict)",
  "faked keydown Backspace",
  "faked keydown, no DOM selection",
  "execCommand(\"paste\")",
  "synthetic paste",
  "synthetic paste, no DOM selection",
  "synthetic paste, clipboardData shadowed as a proxy object",
  "synthetic paste, clipboardData shadowed as the real DataTransfer",
  "synthetic paste, yield one task first",
  "synthetic paste, yield one frame first",
  "synthetic paste, real DataTransfer + yield one frame",
  "paste via beforeinput (insertFromPaste), paste as backup"
];

export const EXPECTATIONS = {
  "chromium": [
    {
      "prosemirror": "unchanged",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "unchanged",
      "ckeditor": "replaced",
      "lexical": "replaced",
      "editcontext": "replaced"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "unchanged",
      "lexical": "replaced",
      "editcontext": "replaced"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "unchanged",
      "ckeditor": "replaced",
      "lexical": "unchanged",
      "editcontext": "at-caret"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "unchanged",
      "ckeditor": "replaced",
      "lexical": "replaced",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "unchanged",
      "lexical": "unchanged",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "deleted",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "deleted",
      "lexical": "deleted",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "deleted",
      "lexical": "deleted",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "unchanged",
      "ckeditor": "replaced",
      "lexical": "replaced",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "deleted",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "deleted",
      "lexical": "deleted",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "unchanged",
      "ckeditor": "replaced",
      "lexical": "unchanged",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "unchanged",
      "ckeditor": "replaced",
      "lexical": "unchanged",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "deleted",
      "codemirror": "deleted",
      "ckeditor": "unchanged",
      "lexical": "deleted",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "unchanged",
      "lexical": "unchanged",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "unchanged",
      "lexical": "unchanged",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "at-caret",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "replaced",
      "lexical": "replaced",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "at-caret",
      "wordgard": "at-caret",
      "quill": "at-caret",
      "codemirror": "at-caret",
      "ckeditor": "at-caret",
      "lexical": "unchanged",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "at-caret",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "unchanged",
      "lexical": "unchanged",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "at-caret",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "replaced",
      "lexical": "replaced",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "replaced",
      "lexical": "replaced",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "replaced",
      "lexical": "replaced",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "replaced",
      "lexical": "replaced",
      "editcontext": "unchanged"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "replaced",
      "lexical": "replaced",
      "editcontext": "replaced"
    }
  ],
  "firefox": [
    {
      "prosemirror": "unchanged",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "unchanged",
      "ckeditor": "replaced",
      "lexical": "replaced"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "unchanged",
      "lexical": "replaced"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "unchanged",
      "ckeditor": "replaced",
      "lexical": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "unchanged",
      "ckeditor": "replaced",
      "lexical": "replaced"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "unchanged",
      "lexical": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "deleted",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "deleted",
      "lexical": "deleted"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "deleted",
      "lexical": "deleted"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "unchanged",
      "ckeditor": "replaced",
      "lexical": "replaced"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "deleted",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "deleted",
      "lexical": "deleted"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "unchanged",
      "ckeditor": "replaced",
      "lexical": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "unchanged",
      "ckeditor": "replaced",
      "lexical": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "deleted",
      "codemirror": "deleted",
      "ckeditor": "unchanged",
      "lexical": "deleted"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "unchanged",
      "lexical": "unchanged"
    },
    {},
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "deleted",
      "codemirror": "deleted",
      "ckeditor": "unchanged",
      "lexical": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "unchanged",
      "lexical": "unchanged"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "at-caret",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "unchanged",
      "lexical": "unchanged"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "at-caret",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "replaced",
      "lexical": "replaced"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "deleted",
      "codemirror": "deleted",
      "ckeditor": "unchanged",
      "lexical": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "deleted",
      "codemirror": "deleted",
      "ckeditor": "unchanged",
      "lexical": "unchanged"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "replaced",
      "lexical": "replaced"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "replaced",
      "lexical": "replaced"
    }
  ],
  "webkit": [
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "replaced",
      "codemirror": "unchanged",
      "ckeditor": "replaced",
      "lexical": "replaced"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "unchanged",
      "lexical": "replaced"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "replaced",
      "codemirror": "unchanged",
      "ckeditor": "replaced",
      "lexical": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "unchanged",
      "ckeditor": "replaced",
      "lexical": "replaced"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "unchanged",
      "lexical": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "deleted",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "deleted",
      "lexical": "deleted"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "deleted",
      "lexical": "deleted"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "unchanged",
      "lexical": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "deleted",
      "lexical": "deleted"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "unchanged",
      "ckeditor": "replaced",
      "lexical": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "unchanged",
      "lexical": "unchanged"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "deleted",
      "codemirror": "deleted",
      "ckeditor": "unchanged",
      "lexical": "deleted"
    },
    {
      "prosemirror": "unchanged",
      "wordgard": "unchanged",
      "quill": "unchanged",
      "codemirror": "unchanged",
      "ckeditor": "unchanged",
      "lexical": "unchanged"
    },
    {},
    {
      "prosemirror": "replaced",
      "wordgard": "at-caret",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "replaced",
      "lexical": "replaced"
    },
    {
      "prosemirror": "at-caret",
      "wordgard": "at-caret",
      "quill": "at-caret",
      "codemirror": "at-caret",
      "ckeditor": "at-caret",
      "lexical": "unchanged"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "at-caret",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "unchanged",
      "lexical": "unchanged"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "at-caret",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "replaced",
      "lexical": "replaced"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "at-caret|replaced",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "replaced",
      "lexical": "replaced"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "replaced",
      "lexical": "replaced"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "replaced",
      "lexical": "replaced"
    },
    {
      "prosemirror": "replaced",
      "wordgard": "replaced",
      "quill": "replaced",
      "codemirror": "replaced",
      "ckeditor": "replaced",
      "lexical": "replaced"
    }
  ]
};

export const ARTIFACTS = {
  "chromium": [
    {},
    {},
    {},
    {},
    {},
    {
      "ckeditor": [
        "nbsp"
      ]
    },
    {
      "ckeditor": [
        "nbsp"
      ]
    },
    {},
    {
      "ckeditor": [
        "nbsp"
      ]
    },
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {}
  ],
  "firefox": [
    {},
    {},
    {},
    {},
    {},
    {
      "ckeditor": [
        "nbsp"
      ]
    },
    {
      "ckeditor": [
        "nbsp"
      ]
    },
    {},
    {
      "ckeditor": [
        "nbsp"
      ]
    },
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {}
  ],
  "webkit": [
    {},
    {},
    {},
    {},
    {},
    {
      "ckeditor": [
        "nbsp"
      ]
    },
    {
      "ckeditor": [
        "nbsp"
      ]
    },
    {},
    {
      "ckeditor": [
        "nbsp"
      ]
    },
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {}
  ]
};

export const PAGE_ERRORS = {
  "chromium": [
    "run ckeditor / beforeinput (insertText), no getTargetRanges()",
    "run ckeditor / beforeinput, no getTargetRanges()",
    "run ckeditor / synthetic paste, clipboardData shadowed as a proxy object",
    "run lexical / synthetic paste, clipboardData shadowed as a proxy object",
    "run wordgard / beforeinput (insertText), no getTargetRanges()",
    "run wordgard / beforeinput, no getTargetRanges()"
  ],
  "firefox": [
    "run ckeditor / beforeinput (insertText), no getTargetRanges()",
    "run ckeditor / beforeinput, no getTargetRanges()",
    "run ckeditor / synthetic paste, clipboardData shadowed as a proxy object",
    "run lexical / synthetic paste, clipboardData shadowed as a proxy object",
    "run wordgard / beforeinput (insertText), no getTargetRanges()",
    "run wordgard / beforeinput, no getTargetRanges()"
  ],
  "webkit": [
    "run ckeditor / beforeinput (insertText) + targetRanges in init dict",
    "run ckeditor / beforeinput (insertText), no DOM selection (init dict)",
    "run ckeditor / beforeinput (insertText), no getTargetRanges()",
    "run ckeditor / beforeinput, no getTargetRanges()",
    "run ckeditor / synthetic paste, clipboardData shadowed as a proxy object",
    "run lexical / synthetic paste, clipboardData shadowed as a proxy object",
    "run wordgard / beforeinput (insertText) + targetRanges in init dict",
    "run wordgard / beforeinput (insertText), no DOM selection (init dict)",
    "run wordgard / beforeinput (insertText), no getTargetRanges()",
    "run wordgard / beforeinput + getTargetRanges()",
    "run wordgard / beforeinput + range, no DOM selection"
  ]
};

export const CONTEXT_EXPECTATIONS = {
  "editor-in-iframe": {
    "chromium": [
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "replaced",
        "editcontext": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged",
        "editcontext": "at-caret"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "at-caret",
        "wordgard": "at-caret",
        "quill": "at-caret",
        "codemirror": "at-caret",
        "ckeditor": "at-caret",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "replaced"
      }
    ],
    "firefox": [
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted|unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted|unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {},
      {
        "prosemirror": "unchanged",
        "wordgard": "at-caret|unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret|unchanged",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret|unchanged",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      }
    ],
    "webkit": [
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted|unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted|unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {},
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret|unchanged",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "at-caret",
        "wordgard": "unchanged",
        "quill": "at-caret",
        "codemirror": "at-caret",
        "ckeditor": "at-caret",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret|unchanged",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret|unchanged",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret|replaced|unchanged",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      }
    ]
  },
  "code-in-iframe": {
    "chromium": [
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "replaced",
        "editcontext": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged",
        "editcontext": "at-caret"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "at-caret",
        "wordgard": "at-caret",
        "quill": "at-caret",
        "codemirror": "at-caret",
        "ckeditor": "at-caret",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "replaced"
      }
    ],
    "firefox": [
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {},
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      }
    ],
    "webkit": [
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {},
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "at-caret",
        "wordgard": "at-caret",
        "quill": "at-caret",
        "codemirror": "at-caret",
        "ckeditor": "at-caret",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret|replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      }
    ]
  },
  "extension-isolated": {
    "chromium": [
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "replaced",
        "editcontext": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "replaced",
        "editcontext": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "at-caret"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "at-caret",
        "wordgard": "at-caret",
        "quill": "at-caret",
        "codemirror": "at-caret",
        "ckeditor": "at-caret",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "replaced"
      }
    ],
    "firefox": [
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {},
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      }
    ]
  },
  "extension-main": {
    "chromium": [
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "replaced",
        "editcontext": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged",
        "editcontext": "at-caret"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "at-caret",
        "wordgard": "at-caret",
        "quill": "at-caret",
        "codemirror": "at-caret",
        "ckeditor": "at-caret",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "replaced"
      }
    ],
    "firefox": [
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {},
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced"
      }
    ]
  },
  "extension-isolated-in-iframe": {
    "chromium": [
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "replaced",
        "editcontext": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "replaced",
        "editcontext": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "at-caret"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "deleted",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "at-caret",
        "wordgard": "at-caret",
        "quill": "at-caret",
        "codemirror": "at-caret",
        "ckeditor": "at-caret",
        "lexical": "unchanged",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "at-caret",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "unchanged"
      },
      {
        "prosemirror": "replaced",
        "wordgard": "replaced",
        "quill": "replaced",
        "codemirror": "replaced",
        "ckeditor": "replaced",
        "lexical": "replaced",
        "editcontext": "replaced"
      }
    ],
    "firefox": [
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "replaced"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "deleted|unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "deleted",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "replaced",
        "codemirror": "unchanged",
        "ckeditor": "replaced",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "deleted"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {},
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "unchanged",
        "codemirror": "unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted|unchanged",
        "codemirror": "deleted|unchanged",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "replaced|unchanged",
        "wordgard": "replaced|unchanged",
        "quill": "deleted|replaced|unchanged",
        "codemirror": "deleted|replaced|unchanged",
        "ckeditor": "replaced|unchanged",
        "lexical": "unchanged"
      },
      {
        "prosemirror": "unchanged",
        "wordgard": "unchanged",
        "quill": "deleted",
        "codemirror": "deleted",
        "ckeditor": "unchanged",
        "lexical": "unchanged"
      }
    ]
  }
};

export const CONTEXT_PROBES = {
  "code-in-iframe": {
    "chromium": {
      "isTrusted": "false",
      "expando": "own property visible → 1 range(s); init dict hidden → 1 range(s)",
      "clipboard": "init dict: own property hidden, instanceof DataTransfer true, html true; shadowed: own property visible, instanceof true, html true",
      "targetRanges-init-dict": "1 range(s)",
      "selection": "\"quick\" when set → \"quick\" once the editors had re-synced",
      "selectionchange": "document+element+window (3)",
      "execCommand": "true (<b>probe</b>)",
      "raf-hidden": "fires",
      "cross-origin": "contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin \"<origin>\" from accessing a cross-origin frame.",
      "sandboxed": "contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin \"<origin>\" from accessing a cross-origin frame."
    },
    "firefox": {
      "isTrusted": "false",
      "expando": "own property visible → 1 range(s); init dict hidden → 1 range(s)",
      "clipboard": "init dict: own property hidden, instanceof DataTransfer true, html false; shadowed: own property visible, instanceof true, html true",
      "targetRanges-init-dict": "1 range(s)",
      "selection": "\"quick\" when set → \"quick\" once the editors had re-synced",
      "selectionchange": "document+element+window (3)",
      "execCommand": "true (<b>probe</b>)",
      "raf-hidden": "never fires in a hidden frame",
      "cross-origin": "contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property \"getSelection\" on cross-origin object",
      "sandboxed": "contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property \"getSelection\" on cross-origin object"
    },
    "webkit": {
      "isTrusted": "false",
      "expando": "own property visible → 1 range(s); init dict hidden → 0 range(s)",
      "clipboard": "init dict: own property hidden, instanceof DataTransfer true, html true; shadowed: own property visible, instanceof true, html true",
      "targetRanges-init-dict": "0 range(s)",
      "selection": "\"quick\" when set → \"quick\" once the editors had re-synced",
      "selectionchange": "document+element+window (3)",
      "execCommand": "true (<b>probe</b><br>)",
      "raf-hidden": "fires",
      "cross-origin": "contentDocument: null; querySelector: blocked; getSelection: threw: Blocked a frame with origin \"<origin>\" from accessing a cross-origin frame. Protocols, domains, and ports must match.",
      "sandboxed": "contentDocument: null; querySelector: blocked; getSelection: threw: Sandbox access violation: Blocked a frame at \"<origin>\" from accessing a cross-origin frame.  The frame being accessed is sandboxed and lacks the \"allow-same-origin\" flag."
    }
  },
  "editor-in-iframe": {
    "chromium": {
      "isTrusted": "false",
      "expando": "own property visible → 1 range(s); init dict hidden → 1 range(s)",
      "clipboard": "init dict: own property hidden, instanceof DataTransfer true, html true; shadowed: own property visible, instanceof true, html true",
      "targetRanges-init-dict": "1 range(s)",
      "selection": "\"quick\" when set → \"quick\" once the editors had re-synced",
      "selectionchange": "document+element+window (3)",
      "execCommand": "true (<b>probe</b>)",
      "raf-hidden": "fires",
      "cross-origin": "contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin \"<origin>\" from accessing a cross-origin frame.",
      "sandboxed": "contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin \"<origin>\" from accessing a cross-origin frame."
    },
    "firefox": {
      "isTrusted": "false",
      "expando": "own property visible → 1 range(s); init dict hidden → 1 range(s)",
      "clipboard": "init dict: own property hidden, instanceof DataTransfer true, html false; shadowed: own property visible, instanceof true, html true",
      "targetRanges-init-dict": "1 range(s)",
      "selection": "\"quick\" when set → \"quick\" once the editors had re-synced",
      "selectionchange": "document+element+window (3)",
      "execCommand": "true (<b>probe</b>)",
      "raf-hidden": "never fires in a hidden frame",
      "cross-origin": "contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property \"getSelection\" on cross-origin object",
      "sandboxed": "contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property \"getSelection\" on cross-origin object"
    },
    "webkit": {
      "isTrusted": "false",
      "expando": "own property visible → 1 range(s); init dict hidden → 0 range(s)",
      "clipboard": "init dict: own property hidden, instanceof DataTransfer true, html true; shadowed: own property visible, instanceof true, html true",
      "targetRanges-init-dict": "0 range(s)",
      "selection": "\"quick\" when set → \"quick\" once the editors had re-synced",
      "selectionchange": "document+element+window (3)",
      "execCommand": "true (<b>probe</b><br>)",
      "raf-hidden": "fires",
      "cross-origin": "contentDocument: null; querySelector: blocked; getSelection: threw: Blocked a frame with origin \"<origin>\" from accessing a cross-origin frame. Protocols, domains, and ports must match.",
      "sandboxed": "contentDocument: null; querySelector: blocked; getSelection: threw: Sandbox access violation: Blocked a frame at \"<origin>\" from accessing a cross-origin frame.  The frame being accessed is sandboxed and lacks the \"allow-same-origin\" flag."
    }
  },
  "extension-isolated": {
    "chromium": {
      "isTrusted": "false",
      "expando": "own property hidden → 0 range(s); init dict hidden → 1 range(s)",
      "clipboard": "init dict: own property hidden, instanceof DataTransfer true, html true; shadowed: own property hidden, instanceof false, html false",
      "targetRanges-init-dict": "1 range(s)",
      "selection": "\"quick\" when set → \"quick\" once the editors had re-synced",
      "selectionchange": "document+element+window (3)",
      "execCommand": "true (<b>probe</b>)",
      "raf-hidden": "fires",
      "cross-origin": "contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin \"<origin>\" from accessing a cross-origin frame.",
      "sandboxed": "contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin \"<origin>\" from accessing a cross-origin frame."
    },
    "firefox": {
      "isTrusted": "false",
      "expando": "own property hidden → 0 range(s); init dict hidden → 1 range(s)",
      "clipboard": "init dict: own property hidden, instanceof DataTransfer true, html false; shadowed: own property hidden, instanceof true, html false",
      "targetRanges-init-dict": "1 range(s)",
      "selection": "\"quick\" when set → \"quick\" once the editors had re-synced",
      "selectionchange": "document+element+window (3)",
      "execCommand": "true (<b>probe</b>)",
      "raf-hidden": "never fires in a hidden frame",
      "cross-origin": "contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property \"getSelection\" on cross-origin object",
      "sandboxed": "contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property \"getSelection\" on cross-origin object"
    }
  },
  "extension-main": {
    "chromium": {
      "isTrusted": "false",
      "expando": "own property visible → 1 range(s); init dict hidden → 1 range(s)",
      "clipboard": "init dict: own property hidden, instanceof DataTransfer true, html true; shadowed: own property visible, instanceof true, html true",
      "targetRanges-init-dict": "1 range(s)",
      "selection": "\"quick\" when set → \"quick\" once the editors had re-synced",
      "selectionchange": "document+element+window (3)",
      "execCommand": "true (<b>probe</b>)",
      "raf-hidden": "fires",
      "cross-origin": "contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin \"<origin>\" from accessing a cross-origin frame.",
      "sandboxed": "contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin \"<origin>\" from accessing a cross-origin frame."
    },
    "firefox": {
      "isTrusted": "false",
      "expando": "own property visible → 1 range(s); init dict hidden → 1 range(s)",
      "clipboard": "init dict: own property hidden, instanceof DataTransfer true, html false; shadowed: own property visible, instanceof true, html true",
      "targetRanges-init-dict": "1 range(s)",
      "selection": "\"quick\" when set → \"quick\" once the editors had re-synced",
      "selectionchange": "document+element+window (3)",
      "execCommand": "true (<b>probe</b>)",
      "raf-hidden": "never fires in a hidden frame",
      "cross-origin": "contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property \"getSelection\" on cross-origin object",
      "sandboxed": "contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property \"getSelection\" on cross-origin object"
    }
  },
  "extension-isolated-in-iframe": {
    "chromium": {
      "isTrusted": "false",
      "expando": "own property hidden → 0 range(s); init dict hidden → 1 range(s)",
      "clipboard": "init dict: own property hidden, instanceof DataTransfer true, html true; shadowed: own property hidden, instanceof false, html false",
      "targetRanges-init-dict": "1 range(s)",
      "selection": "\"quick\" when set → \"quick\" once the editors had re-synced",
      "selectionchange": "document+element+window (3)",
      "execCommand": "true (<b>probe</b>)",
      "raf-hidden": "fires",
      "cross-origin": "contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin \"<origin>\" from accessing a cross-origin frame.",
      "sandboxed": "contentDocument: null; querySelector: blocked; getSelection: threw: Failed to read a named property 'getSelection' from 'Window': Blocked a frame with origin \"<origin>\" from accessing a cross-origin frame."
    },
    "firefox": {
      "isTrusted": "false",
      "expando": "own property hidden → 0 range(s); init dict hidden → 1 range(s)",
      "clipboard": "init dict: own property hidden, instanceof DataTransfer true, html false; shadowed: own property hidden, instanceof true, html false",
      "targetRanges-init-dict": "1 range(s)",
      "selection": "\"quick\" when set → \"quick\" once the editors had re-synced",
      "selectionchange": "document+element+window (3)",
      "execCommand": "true (<b>probe</b>)",
      "raf-hidden": "never fires in a hidden frame",
      "cross-origin": "contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property \"getSelection\" on cross-origin object",
      "sandboxed": "contentDocument: null; querySelector: blocked; getSelection: threw: Permission denied to access property \"getSelection\" on cross-origin object"
    }
  }
};

export const CONTEXT_ARTIFACTS = {
  "code-in-iframe": {
    "chromium": [
      {},
      {},
      {},
      {},
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {}
    ],
    "firefox": [
      {},
      {},
      {},
      {},
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {}
    ],
    "webkit": [
      {},
      {},
      {},
      {},
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {}
    ]
  },
  "editor-in-iframe": {
    "chromium": [
      {},
      {},
      {},
      {},
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {}
    ],
    "firefox": [
      {},
      {},
      {},
      {},
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {}
    ],
    "webkit": [
      {},
      {},
      {},
      {},
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {}
    ]
  },
  "extension-isolated": {
    "chromium": [
      {},
      {},
      {},
      {},
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {}
    ],
    "firefox": [
      {},
      {},
      {},
      {},
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {}
    ]
  },
  "extension-main": {
    "chromium": [
      {},
      {},
      {},
      {},
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {}
    ],
    "firefox": [
      {},
      {},
      {},
      {},
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {}
    ]
  },
  "extension-isolated-in-iframe": {
    "chromium": [
      {},
      {},
      {},
      {},
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {}
    ],
    "firefox": [
      {},
      {},
      {},
      {},
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {
        "ckeditor": [
          "nbsp"
        ]
      },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {}
    ]
  }
};

export const CONTEXT_PAGE_ERRORS = {
  "code-in-iframe": {
    "chromium": [
      "run ckeditor / beforeinput (insertText), no getTargetRanges()",
      "run ckeditor / beforeinput, no getTargetRanges()",
      "run ckeditor / synthetic paste, clipboardData shadowed as a proxy object",
      "run lexical / synthetic paste, clipboardData shadowed as a proxy object",
      "run wordgard / beforeinput (insertText), no getTargetRanges()",
      "run wordgard / beforeinput, no getTargetRanges()"
    ],
    "firefox": [
      "run ckeditor / beforeinput (insertText), no getTargetRanges()",
      "run ckeditor / beforeinput, no getTargetRanges()",
      "run ckeditor / synthetic paste, clipboardData shadowed as a proxy object",
      "run lexical / synthetic paste, clipboardData shadowed as a proxy object",
      "run wordgard / beforeinput (insertText), no getTargetRanges()",
      "run wordgard / beforeinput, no getTargetRanges()"
    ],
    "webkit": [
      "code-in-iframe / probes",
      "run ckeditor / beforeinput (insertText) + targetRanges in init dict",
      "run ckeditor / beforeinput (insertText), no DOM selection (init dict)",
      "run ckeditor / beforeinput (insertText), no getTargetRanges()",
      "run ckeditor / beforeinput, no getTargetRanges()",
      "run ckeditor / synthetic paste, clipboardData shadowed as a proxy object",
      "run lexical / synthetic paste, clipboardData shadowed as a proxy object",
      "run wordgard / beforeinput (insertText) + targetRanges in init dict",
      "run wordgard / beforeinput (insertText), no DOM selection (init dict)",
      "run wordgard / beforeinput (insertText), no getTargetRanges()",
      "run wordgard / beforeinput + getTargetRanges()",
      "run wordgard / beforeinput + range, no DOM selection"
    ]
  },
  "editor-in-iframe": {
    "chromium": [
      "run ckeditor / beforeinput (insertText), no getTargetRanges()",
      "run ckeditor / beforeinput, no getTargetRanges()",
      "run ckeditor / synthetic paste, clipboardData shadowed as a proxy object",
      "run lexical / synthetic paste, clipboardData shadowed as a proxy object",
      "run wordgard / beforeinput (insertText), no getTargetRanges()",
      "run wordgard / beforeinput, no getTargetRanges()"
    ],
    "firefox": [
      "run ckeditor / beforeinput (insertText), no getTargetRanges()",
      "run ckeditor / beforeinput, no getTargetRanges()",
      "run ckeditor / synthetic paste, clipboardData shadowed as a proxy object",
      "run lexical / synthetic paste, clipboardData shadowed as a proxy object",
      "run wordgard / beforeinput (insertText), no getTargetRanges()",
      "run wordgard / beforeinput, no getTargetRanges()"
    ],
    "webkit": [
      "editor-in-iframe / probes",
      "run ckeditor / beforeinput (insertText) + targetRanges in init dict",
      "run ckeditor / beforeinput (insertText), no DOM selection (init dict)",
      "run ckeditor / beforeinput (insertText), no getTargetRanges()",
      "run ckeditor / beforeinput, no getTargetRanges()",
      "run ckeditor / synthetic paste, clipboardData shadowed as a proxy object",
      "run lexical / synthetic paste, clipboardData shadowed as a proxy object",
      "run wordgard / beforeinput (insertText) + targetRanges in init dict",
      "run wordgard / beforeinput (insertText), no DOM selection (init dict)",
      "run wordgard / beforeinput (insertText), no getTargetRanges()",
      "run wordgard / beforeinput + getTargetRanges()",
      "run wordgard / beforeinput + range, no DOM selection"
    ]
  },
  "extension-isolated": {
    "chromium": [
      "run ckeditor / beforeinput (insertText) + getTargetRanges()",
      "run ckeditor / beforeinput (insertText), no DOM selection (override)",
      "run ckeditor / beforeinput (insertText), no getTargetRanges()",
      "run ckeditor / beforeinput + getTargetRanges()",
      "run ckeditor / beforeinput + range, no DOM selection",
      "run ckeditor / beforeinput, no getTargetRanges()",
      "run wordgard / beforeinput (insertText) + getTargetRanges()",
      "run wordgard / beforeinput (insertText), no DOM selection (override)",
      "run wordgard / beforeinput (insertText), no getTargetRanges()",
      "run wordgard / beforeinput + getTargetRanges()",
      "run wordgard / beforeinput + range, no DOM selection",
      "run wordgard / beforeinput, no getTargetRanges()"
    ],
    "firefox": [
      "run ckeditor / beforeinput (insertText) + getTargetRanges()",
      "run ckeditor / beforeinput (insertText), no DOM selection (override)",
      "run ckeditor / beforeinput (insertText), no getTargetRanges()",
      "run ckeditor / beforeinput + getTargetRanges()",
      "run ckeditor / beforeinput + range, no DOM selection",
      "run ckeditor / beforeinput, no getTargetRanges()",
      "run wordgard / beforeinput (insertText) + getTargetRanges()",
      "run wordgard / beforeinput (insertText), no DOM selection (override)",
      "run wordgard / beforeinput (insertText), no getTargetRanges()",
      "run wordgard / beforeinput + getTargetRanges()",
      "run wordgard / beforeinput + range, no DOM selection",
      "run wordgard / beforeinput, no getTargetRanges()"
    ]
  },
  "extension-main": {
    "chromium": [
      "run ckeditor / beforeinput (insertText), no getTargetRanges()",
      "run ckeditor / beforeinput, no getTargetRanges()",
      "run ckeditor / synthetic paste, clipboardData shadowed as a proxy object",
      "run lexical / synthetic paste, clipboardData shadowed as a proxy object",
      "run wordgard / beforeinput (insertText), no getTargetRanges()",
      "run wordgard / beforeinput, no getTargetRanges()"
    ],
    "firefox": [
      "run ckeditor / beforeinput (insertText), no getTargetRanges()",
      "run ckeditor / beforeinput, no getTargetRanges()",
      "run ckeditor / synthetic paste, clipboardData shadowed as a proxy object",
      "run lexical / synthetic paste, clipboardData shadowed as a proxy object",
      "run wordgard / beforeinput (insertText), no getTargetRanges()",
      "run wordgard / beforeinput, no getTargetRanges()"
    ]
  },
  "extension-isolated-in-iframe": {
    "chromium": [
      "run ckeditor / beforeinput (insertText) + getTargetRanges()",
      "run ckeditor / beforeinput (insertText), no DOM selection (override)",
      "run ckeditor / beforeinput (insertText), no getTargetRanges()",
      "run ckeditor / beforeinput + getTargetRanges()",
      "run ckeditor / beforeinput + range, no DOM selection",
      "run ckeditor / beforeinput, no getTargetRanges()",
      "run wordgard / beforeinput (insertText) + getTargetRanges()",
      "run wordgard / beforeinput (insertText), no DOM selection (override)",
      "run wordgard / beforeinput (insertText), no getTargetRanges()",
      "run wordgard / beforeinput + getTargetRanges()",
      "run wordgard / beforeinput + range, no DOM selection",
      "run wordgard / beforeinput, no getTargetRanges()"
    ],
    "firefox": [
      "run ckeditor / beforeinput (insertText) + getTargetRanges()",
      "run ckeditor / beforeinput (insertText), no DOM selection (override)",
      "run ckeditor / beforeinput (insertText), no getTargetRanges()",
      "run ckeditor / beforeinput + getTargetRanges()",
      "run ckeditor / beforeinput + range, no DOM selection",
      "run ckeditor / beforeinput, no getTargetRanges()",
      "run wordgard / beforeinput (insertText) + getTargetRanges()",
      "run wordgard / beforeinput (insertText), no DOM selection (override)",
      "run wordgard / beforeinput (insertText), no getTargetRanges()",
      "run wordgard / beforeinput + getTargetRanges()",
      "run wordgard / beforeinput + range, no DOM selection",
      "run wordgard / beforeinput, no getTargetRanges()"
    ]
  }
};

// --- END GENERATED ---