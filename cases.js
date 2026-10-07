/**
 * The measured cases: what each row of the matrix is, and which button presses it.
 *
 * This is the join between the demo and the test suite. `test/harness.mjs` imports
 * `CASES` and clicks the button each case names; the pages build their buttons from
 * `BUTTONS`; and `expectations.js` records one row per case. So a row cannot appear
 * on the page without being measured, and a case cannot be measured without a
 * button to press.
 *
 * `ui` is the state of the page's controls that the case needs: the harness sets
 * each checkbox and select before pressing the button, so the same `ui` drives a
 * human at the page and a machine in the test.
 */

/**
 * The eight buttons, in the order the page shows them.
 *
 * `id` doubles as the DOM id, which is what `CASES[].button` and the harness's
 * locators refer to. `strategy` is which dispatch function the case runs, and
 * `inputType` is passed straight through to `beforeinput` — which is not a detail:
 * editors implement different `inputType`s, so choosing the wrong one makes a
 * working editor look broken.
 */
export const BUTTONS = [
  {
    id: "go-beforeinput",
    label: "Replace via beforeinput (insertReplacementText)",
    strategy: "beforeinput",
    inputType: "insertReplacementText",
  },
  {
    id: "go-beforeinput-text",
    label: "Replace via beforeinput (insertText)",
    strategy: "beforeinput",
    inputType: "insertText",
  },
  {
    id: "go-paste",
    label: "Replace via synthetic paste",
    strategy: "paste",
  },
  {
    id: "go-paste-wait",
    label: "Replace via synthetic paste, after the yield above",
    strategy: "paste-wait",
  },
  {
    id: "go-paste-both",
    label: "Replace via beforeinput (insertFromPaste), paste as backup",
    strategy: "paste-both",
  },
  {
    id: "go-delete-input",
    label: "Delete via beforeinput (deleteContentBackward)",
    strategy: "beforeinput",
    inputType: "deleteContentBackward",
  },
  {
    id: "go-keydown",
    label: "Delete via faked Backspace",
    strategy: "keydown",
  },
  {
    id: "go-exec",
    label: "Replace via execCommand",
    strategy: "exec",
  },
];

export const BUTTON_BY_ID = new Map(BUTTONS.map((button) => [button.id, button]));

/**
 * One row of the matrix per entry, in the order the tables are printed.
 *
 * `ui.ranges` attaches `getTargetRanges()` to the `beforeinput` event; `ui.selection`
 * puts the live DOM selection on the target range first. The rows that read
 * `ui.supply: "init"` measure the spec'd `targetRanges` init-dict route on its own,
 * and the "no DOM selection" rows isolate *which* mechanism delivered the edit.
 */
export const CASES = [
  { label: "beforeinput + getTargetRanges()", button: "go-beforeinput", ui: { ranges: true, selection: true } },
  { label: "beforeinput, no getTargetRanges()", button: "go-beforeinput", ui: { ranges: false, selection: true } },
  { label: "beforeinput + range, no DOM selection", button: "go-beforeinput", ui: { ranges: true, selection: false } },
  { label: "beforeinput (insertText) + getTargetRanges()", button: "go-beforeinput-text", ui: { ranges: true, selection: true } },
  { label: "beforeinput (insertText), no getTargetRanges()", button: "go-beforeinput-text", ui: { ranges: false, selection: true } },
  { label: "beforeinput (deleteContentBackward) + getTargetRanges()", button: "go-delete-input", ui: { ranges: true, selection: true } },
  { label: "beforeinput (deleteContentBackward), no getTargetRanges()", button: "go-delete-input", ui: { ranges: false, selection: true } },
  { label: "beforeinput (insertText) + targetRanges in init dict", button: "go-beforeinput-text", ui: { ranges: true, selection: true, supply: "init" } },
  { label: "beforeinput (deleteContentBackward) + targetRanges in init dict", button: "go-delete-input", ui: { ranges: true, selection: true, supply: "init" } },
  // Isolates *which* mechanism delivered the edit: the target range, or the DOM
  // selection that was set alongside it.
  { label: "beforeinput (insertText), no DOM selection (override)", button: "go-beforeinput-text", ui: { ranges: true, selection: false, supply: "override" } },
  { label: "beforeinput (insertText), no DOM selection (init dict)", button: "go-beforeinput-text", ui: { ranges: true, selection: false, supply: "init" } },
  { label: "faked keydown Backspace", button: "go-keydown", ui: { ranges: true, selection: true } },
  { label: "faked keydown, no DOM selection", button: "go-keydown", ui: { ranges: true, selection: false } },
  { label: 'execCommand("paste")', button: "go-exec", ui: { ranges: true, selection: true } },
  { label: "synthetic paste", button: "go-paste", ui: { ranges: true, selection: true } },
  { label: "synthetic paste, no DOM selection", button: "go-paste", ui: { ranges: true, selection: false } },
  { label: "synthetic paste, clipboardData shadowed as a proxy object", button: "go-paste", ui: { ranges: true, selection: true, settle: "task", clipboard: "proxy" } },
  { label: "synthetic paste, clipboardData shadowed as the real DataTransfer", button: "go-paste", ui: { ranges: true, selection: true, settle: "task", clipboard: "instance" } },
  { label: "synthetic paste, yield one task first", button: "go-paste-wait", ui: { ranges: true, selection: true, settle: "task" } },
  { label: "synthetic paste, yield one frame first", button: "go-paste-wait", ui: { ranges: true, selection: true, settle: "frame" } },
  // Both fixes at once: real-DataTransfer shadowing plus a frame yield. This is
  // the only paste row that works everywhere in the same-document case — see
  // finding 3 in the README, and the context tables for whether that survives.
  { label: "synthetic paste, real DataTransfer + yield one frame", button: "go-paste-wait", ui: { ranges: true, selection: true, settle: "frame", clipboard: "instance" } },
  // The paste route EditContext hosts answer: paste-shaped beforeinput with the
  // payload in dataTransfer — with a paste event as backup for the editors that
  // only listen for the ClipboardEvent shape. Both events carry the real
  // DataTransfer, and the strategy dispatches the backup only when the first
  // event changed nothing.
  { label: "paste via beforeinput (insertFromPaste), paste as backup", button: "go-paste-both", ui: { ranges: true, selection: true, settle: "frame", clipboard: "instance" } },
];