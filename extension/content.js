/**
 * The extension's half of the demo, bundled twice: once into the isolated world (the
 * default, and the interesting case) and once into the page's own world (`world:
 * "MAIN"`), which is the control.
 *
 * Both copies are byte-for-byte the same code except for `WORLD`. That is the whole
 * design of the measurement: if the MAIN copy reproduces the same-document results and
 * the isolated copy does not, then the world is the variable — not the extension, not
 * the strategy, not the editor.
 *
 * The code imported here is the *same* strategy code the page runs
 * (strategy-runners.js → apply-edit.js), which is what makes that comparison fair. The
 * only thing that differs at run time is which realm's constructors
 * `target.ownerDocument.defaultView` hands it.
 *
 * Talking to the page is by CustomEvent with a JSON *string* detail, deliberately:
 * Firefox will not hand a page an isolated-world object through `event.detail` without
 * `cloneInto`, but a string crosses any boundary in either direction.
 */

import { BUTTON_BY_ID } from "../cases.js";
import { SENTENCE, WORD, rangeForOffsets } from "../editable.js";
import { dispatchAsInfluenceRealm } from "../probes.js";
import { runStrategy } from "../strategy-runners.js";

/** Which world this copy was bundled into. Replaced at build time. */
const WORLD = __LINGO_WORLD__;

const REQUEST_EVENT = "lingo-demo:run";
const PROBE_REQUEST_EVENT = "lingo-demo:probe";
const PING_EVENT = "lingo-demo:ping";
const RESULT_EVENT = "lingo-demo:result";
const READY_ATTR = "lingoExtension";

const START = SENTENCE.indexOf(WORD);

/**
 * The editor in *this* frame.
 *
 * Queried per request rather than cached, because the page remounts the editor between
 * cases and CKEditor 5 replaces its own editable element on focus — a cached node would
 * quietly aim the strategy at a detached one.
 */
function editorElement() {
  return document.querySelector("[data-demo-editor]");
}

/** The range over the target word, computed with this realm's own constructors. */
function targetRange(el) {
  return rangeForOffsets(el, START, START + WORD.length, window);
}

const parse = (value) => {
  try {
    return JSON.parse(typeof value === "string" ? value : "{}");
  } catch {
    return {};
  }
};

const reply = (payload) => {
  document.dispatchEvent(new CustomEvent(RESULT_EVENT, { detail: JSON.stringify(payload) }));
};

document.addEventListener(REQUEST_EVENT, async (event) => {
  const request = parse(event.detail);
  // Both worlds listen; only the one asked answers.
  if (request.world && request.world !== WORLD) return;
  const button = BUTTON_BY_ID.get(request.button);
  const el = editorElement();
  if (!button) {
    reply({ world: WORLD, id: request.id, error: `unknown button ${request.button}` });
    return;
  }
  if (!el) {
    reply({ world: WORLD, id: request.id, error: "no editor in this frame" });
    return;
  }
  try {
    // Awaited: runStrategy is async (the paste rows yield), and the reply has to
    // carry the *result* — spreading the promise would answer immediately with
    // nothing, and the page would read the editor before the strategy finished.
    const result = await runStrategy(button, { target: el, range: targetRange(el), ui: request.ui ?? {} });
    reply({ world: WORLD, id: request.id, ...result });
  } catch (error) {
    reply({ world: WORLD, id: request.id, error: String(error?.message ?? error).split("\n")[0] });
  }
});

document.addEventListener(PROBE_REQUEST_EVENT, (event) => {
  const request = parse(event.detail);
  if (request.world && request.world !== WORLD) return;
  const el = editorElement();
  if (!el) {
    reply({ world: WORLD, id: request.id, probe: { error: "no editor in this frame" } });
    return;
  }
  try {
    reply({ world: WORLD, id: request.id, probe: dispatchAsInfluenceRealm({ target: el, range: targetRange(el) }) });
  } catch (error) {
    reply({ world: WORLD, id: request.id, probe: { error: String(error?.message ?? error).split("\n")[0] } });
  }
});

/**
 * Announce that this world is listening.
 *
 * A data attribute is shared DOM, so this one line is how the page — and the test suite —
 * knows an extension is present and in which worlds. The isolated copy sets it from
 * outside the page's realm, and the page still reads it.
 */
const announce = () => {
  const present = new Set((document.documentElement.dataset[READY_ATTR] ?? "").split(/\s+/).filter(Boolean));
  present.add(WORLD);
  document.documentElement.dataset[READY_ATTR] = [...present].sort().join(" ");
};
announce();
document.addEventListener("DOMContentLoaded", announce);
// A page can finish loading after this script, so re-announce on request rather than
// leaving the page to guess.
document.addEventListener(PING_EVENT, announce);