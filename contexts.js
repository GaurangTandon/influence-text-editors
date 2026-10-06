/**
 * The contexts: where each side of the edit lives.
 *
 * Every measurement in this repo so far has both sides in the same realm — the code
 * that dispatches the event and the editor it edits are both in the top document.
 * That is the easy case. Two others are not, and they are the ones this file exists
 * to describe:
 *
 *   - the editor is in an iframe, so it belongs to that iframe's realm while the
 *     influencing code belongs to the parent's;
 *   - the influencing code is an extension's content script, which in the default
 *     configuration runs in an isolated world that is neither the page's world nor
 *     anything else the page can reach into.
 *
 * `CONTEXT_ENGINES` is the honest coverage statement. WebKit on Linux cannot load an
 * extension at all, so the extension contexts have no WebKit column rather than a
 * guessed one; `NOT_MEASURED` carries the reason so the tables, the page and
 * test/verify.mjs all say the same thing instead of quietly implying a measurement.
 *
 * Pure data and pure functions: imported by the pages *and* by test/harness.mjs, so
 * nothing in here may touch the DOM.
 */

import { CASES } from "./cases.js";
import {
  CONTEXT_EXPECTATIONS,
  EDITOR_ENGINES,
  EDITOR_KINDS,
  EXPECTATIONS,
  ROW_LABELS,
} from "./expectations.js";

export const TOP = "top";

export const CONTEXT_IDS = [
  TOP,
  "editor-in-iframe",
  "code-in-iframe",
  "extension-isolated",
  "extension-main",
  "extension-isolated-in-iframe",
];

/**
 * Short label, long label, and the one-line claim each context makes.
 *
 * `where` is phrased as "code → editor" because that is the axis: the left side is
 * where the strategy runs, the right side is where the editor lives.
 */
export const CONTEXT_LABELS = {
  [TOP]: {
    short: "same document",
    label: "same document — code and editor in the top document",
    where: "top document → top document",
    claim:
      "The measured baseline. Everything else in expectations.js is compared against this, " +
      "so a difference in another context is a difference the context caused.",
  },
  "editor-in-iframe": {
    short: "editor in an iframe",
    label: "editor in a same-origin iframe",
    where: "top document → same-origin iframe",
    claim:
      "The common case: a page with an embedded editor. Same origin, so every object is " +
      "reachable — the question is only whether the editor cares that it lives in another realm.",
  },
  "code-in-iframe": {
    short: "code in an iframe",
    label: "influencing code in a same-origin iframe",
    where: "same-origin iframe → top document",
    claim:
      "The reverse direction, and the shape an extension's engine iframe has. The editor is " +
      "ordinary, but the code doing the editing is a function from another realm.",
  },
  "extension-isolated": {
    short: "extension, isolated world",
    label: "extension content script — ISOLATED world (the default)",
    where: "extension ISOLATED world → top document",
    claim:
      "What an extension does by default. Same DOM, different world: it can dispatch events " +
      "on the page's elements, but own properties it defines on them are its own.",
  },
  "extension-main": {
    short: "extension, MAIN world",
    label: "extension content script — MAIN world (injected into the page)",
    where: "page's own world → top document",
    claim:
      "The control. Identical code, injected into the page's world instead. Anything that " +
      "differs from the isolated world is the world, not the extension.",
  },
  "extension-isolated-in-iframe": {
    short: "extension + iframe",
    label: "extension content script, editor in a same-origin iframe",
    where: "extension ISOLATED world → same-origin iframe",
    claim:
      "The hardest combination, and the one Google Docs and Word for the web actually present: " +
      "a content script in its own world editing an editor in another document.",
  },
};

const ALL = ["chromium", "firefox", "webkit"];

/**
 * Which engines each context can be *measured* in, as opposed to predicted.
 *
 * Chromium and Firefox both get a real extension: Chromium through
 * `--load-extension`, Firefox through marionette's `Addon:Install`. WebKit gets
 * nothing, because Playwright's WebKit build cannot load an extension on Linux.
 */
export const CONTEXT_ENGINES = {
  [TOP]: ALL,
  "editor-in-iframe": ALL,
  "code-in-iframe": ALL,
  "extension-isolated": ["chromium", "firefox"],
  "extension-main": ["chromium", "firefox"],
  "extension-isolated-in-iframe": ["chromium", "firefox"],
};

/** Why a context has no column for an engine. Never leave a gap unexplained. */
export const NOT_MEASURED = {
  "extension-isolated": { webkit: "Playwright's WebKit build cannot load an extension on Linux" },
  "extension-main": { webkit: "Playwright's WebKit build cannot load an extension on Linux" },
  "extension-isolated-in-iframe": {
    webkit: "Playwright's WebKit build cannot load an extension on Linux",
  },
};

/** Engines whose results are documented expectations rather than measurements. */
// WebKit has no extension contexts at all here, so nothing is predicted-but-unmeasured
// in the tables: the README states the expectation in prose instead of printing a
// column that would look like a measurement.

/**
 * The isolation probes, and what each one decides.
 *
 * These are the mechanism, separated from the matrix: the matrix says which editors
 * acted, the probes say *why*. A cell that stops working is only interesting if the
 * probe that governs it moved.
 */
export const PROBES = [
  {
    id: "isTrusted",
    label: "`isTrusted` on a dispatched event",
    question: "Can any realm make a synthetic event look like a real one?",
  },
  {
    id: "expando",
    label: "own property on the event, read by the editor's realm",
    question:
      "Can the code defining `getTargetRanges`/`clipboardData` with Object.defineProperty " +
      "have that property read by the editor?",
  },
  {
    id: "clipboard",
    label: "`event.clipboardData instanceof DataTransfer`, in the editor's realm",
    question:
      "Does a DataTransfer built by the influencing realm satisfy the editor's own " +
      "`instanceof` check?",
  },
  {
    id: "selection",
    label: "DOM selection set by the influencing realm, seen by the editor's realm",
    question: "Does a selection changed in one realm show up in another?",
  },
  {
    id: "selectionchange",
    label: "`selectionchange` delivered to the editor's realm",
    question: "Which of document / element / window in the editor's realm hear about it?",
  },
  {
    id: "targetRanges-init-dict",
    label: "`targetRanges` in the init dict, honoured cross-realm",
    question:
      "The spec'd route needs no shadowing — does the editor's realm get the range when the " +
      "influencing realm passes it in the constructor?",
  },
  {
    id: "execCommand",
    label: "`document.execCommand` called from the influencing realm",
    question: "The one strategy that is not an event at all — does it survive the crossing?",
  },
  {
    id: "raf-hidden",
    label: "one `requestAnimationFrame` in a `display: none` iframe",
    question:
      "The yield the paste path depends on: is it late, or does it never arrive at all?",
  },
  {
    id: "cross-origin",
    label: "a cross-origin iframe, from the parent document",
    question: "What is reachable when the origin does not match?",
  },
  {
    id: "sandboxed",
    label: "a `sandbox=\"allow-scripts\"` iframe, from the parent document",
    question: "What is reachable when the frame is same-origin by URL but not by origin?",
  },
];

export const PROBE_IDS = PROBES.map((probe) => probe.id);

/**
 * Rows of the matrix for one context in one engine, shaped for the page's table.
 *
 * A context that was never measured for this engine renders as `not-measured` rather
 * than as a row of blanks that could be mistaken for "nothing worked"; an editor
 * this engine cannot run at all renders as `not-supported`.
 */
export function matrixRows(contextId, engineKey) {
  const table = tableFor(contextId, engineKey);
  return ROW_LABELS.map((label, index) => {
    const by = {};
    for (const kind of EDITOR_KINDS) {
      by[kind] = engineRuns(kind, engineKey)
        ? (table?.[index]?.[kind] ?? "not-measured")
        : "not-supported";
    }
    return {
      label,
      by,
      varies: varies(contextId, index),
      ...rowDims(label),
    };
  });
}

/** Whether this engine can run this editor at all (see EDITOR_ENGINES). */
export function engineRuns(kind, engineKey) {
  return (EDITOR_ENGINES[kind] ?? ALL).includes(engineKey);
}

/** The editors every engine of a set can run — the only kinds a cross-engine comparison may look at. */
function kindsInCommon(engines) {
  return EDITOR_KINDS.filter((kind) => engines.every((engine) => engineRuns(kind, engine)));
}

/** The recorded outcomes for one context in one engine, or null if not recorded. */
export function tableFor(contextId, engineKey) {
  if (contextId === TOP) return EXPECTATIONS[engineKey] ?? null;
  return CONTEXT_EXPECTATIONS?.[contextId]?.[engineKey] ?? null;
}

/** True when this context's outcome for this row is not the same in every engine.
 *
 * Compared over the editors every measured engine can run: an engine lacking an
 * editor is not a difference in behaviour, and marking every row as varying
 * because one engine has no `editcontext` column would drown the real signals.
 */
function varies(contextId, index) {
  const engines = CONTEXT_ENGINES[contextId] ?? ALL;
  const kinds = kindsInCommon(engines);
  const seen = new Set(
    engines.map((engine) => JSON.stringify(tableFor(contextId, engine)?.[index], kinds)),
  );
  return seen.size > 1;
}

/**
 * Which toggle a row depends on, so the page can dim it while that toggle is off.
 *
 * Derived from the case that produced the row rather than maintained by hand, so a
 * new case dims itself correctly.
 */
function rowDims(label) {
  const found = CASES.find((entry) => entry.label === label);
  if (!found) return {};
  return {
    ...(found.ui.ranges === false ? { dimWhenRangesOff: true } : {}),
    ...(found.ui.selection === false ? { dimWhenSelectionOff: true } : {}),
  };
}