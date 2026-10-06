/**
 * The shared demo UI: editor switcher, strategy buttons, outcome report, event log
 * and the measured matrix.
 *
 * Three pages use this — the original same-document demo, the iframe contexts page
 * and the extension contexts page — and none of them may report something the test
 * suite disagrees with. The reason they cannot drift is structural rather than
 * editorial:
 *
 *   - the buttons are built from `BUTTONS` in cases.js, which is also what the
 *     harness clicks and what expectations.js has a row for;
 *   - the matrix is rendered out of expectations.js, which the tests assert against;
 *   - the "did it work" verdict comes from `classifyOutcome`, the same function the
 *     tests use to classify a measurement.
 *
 * Everything else is per-context and arrives through the config: where the editor is
 * mounted, which realm dispatches the strategy, and which recorded table to render.
 */

import { BUTTONS } from "./cases.js";
import { CONTEXT_LABELS } from "./contexts.js";
import { classifyOutcome } from "./expectations.js";
import { verifyEdit } from "./apply-edit.js";
import { WORD } from "./editable.js";

const OUTCOME_TEXT = {
  unchanged: "no edit",
  replaced: "edit",
  deleted: "edit, word deleted",
  "at-caret": "edit, at caret",
  // A context that was never measured in this browser. Never rendered as an empty cell:
  // a blank would read as "nothing worked", which is a different and wrong claim.
  "not-measured": "not measured here",
  // An editor this engine cannot run at all (the EditContext editor outside Chromium).
  "not-supported": "not supported here",
};
const OUTCOME_CLASS = {
  unchanged: "no",
  replaced: "yes",
  deleted: "warn",
  "at-caret": "warn",
  "not-measured": "unknown",
  "not-supported": "unknown",
};

/** The verdict text for each outcome. "Not prevented" is never a success. */
const VERDICT = {
  unchanged: ["bad", "NO EDIT — the editor ignored the event"],
  replaced: ["ok", "EDIT APPLIED — the editor acted on the event, at the target range"],
  deleted: ["bad", `CONTENT CHANGED, BUT DELETED — “${WORD}” is gone and nothing replaced it`],
  "at-caret": ["bad", `CONTENT CHANGED, BUT MISPLACED — “${WORD}” survived; the replacement went to the caret`],
};

export function createDemo(config) {
  const {
    editors,
    contexts,
    initialContext,
    engines,
    matrixFor,
    noteFor = () => "",
  } = config;

  const logEl = document.getElementById("log");
  const hostEl = document.getElementById("host");
  const outcomeEl = document.getElementById("outcome");
  const switcherEl = document.getElementById("switcher");
  const matrixEl = document.getElementById("matrix");
  const variesEl = document.getElementById("varies");
  const rangesEl = document.getElementById("ranges");
  const supplyEl = document.getElementById("supply");
  const settleEl = document.getElementById("settle");
  const clipboardEl = document.getElementById("clipboard");
  const engineEl = document.getElementById("engine");
  const selectionEl = document.getElementById("selection");
  const contextEl = document.getElementById("context");
  const buttonsEl = document.getElementById("buttons");

  const thisEngine =
    engines.find((candidate) => candidate.test.test(navigator.userAgent))?.key ?? engines[0].key;
  let shownEngine = thisEngine;
  let contextId = initialContext;
  let editor = null;
  let selected = editors[0].kind;

  function log(lines) {
    logEl.textContent = `${lines.join("\n")}\n\n${logEl.textContent}`.trimEnd();
    logEl.scrollTop = 0;
  }

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const child of children) {
      // Callers pass conditional children as null; append() would stringify those
      // into the element as the text "null".
      if (child !== null && child !== undefined) node.append(child);
    }
    return node;
  }

  const context = () => contexts[contextId];
  const contextLabel = () => CONTEXT_LABELS[contextId]?.label ?? contextId;

  // -------------------------------------------------------------------
  // Editor switcher
  // -------------------------------------------------------------------
  function buildSwitcher() {
    for (const spec of editors) {
      const button = el("button", {
        type: "button",
        "aria-pressed": String(spec.kind === selected),
      }, [document.createTextNode(spec.label), el("small", { textContent: spec.version })]);
      button.addEventListener("click", () => { void selectEditor(spec.kind); });
      switcherEl.append(button);
    }
  }

  function markSwitcher() {
    for (const [index, spec] of editors.entries()) {
      switcherEl.children[index].setAttribute("aria-pressed", String(spec.kind === selected));
    }
  }

  async function selectEditor(kind) {
    selected = kind;
    markSwitcher();
    renderMatrix();
    // Tear the previous editor down properly before clearing the host: CKEditor 5
    // in particular keeps document-level listeners, so just dropping its DOM leaves a
    // live editor reacting to everything that follows. Its destroy() is async and
    // must finish before we dispatch anything at the document again.
    try {
      await editor?.destroy?.();
    } catch {
      // A failed teardown must not stop the next editor from mounting.
    }
    editor = null;
    hostEl.replaceChildren();
    outcomeEl.replaceChildren();
    // Published so test/verify.mjs can wait for a mount instead of sleeping.
    delete hostEl.dataset.mounted;
    const placeholder = el("div", { className: "note", textContent: "loading…" });
    hostEl.append(placeholder);
    // A mounter may refuse: the EditContext editor does in engines without the API.
    // That is a result about the engine, not a crash — say so and leave the page usable.
    try {
      editor = await context().mount(kind, hostEl);
    } catch (error) {
      placeholder.textContent = `not available here — ${error.message}`;
      log([`── could not mount ${kind}: ${error.message}`]);
      return;
    }
    placeholder.remove();
    hostEl.dataset.mounted = kind;
    hostEl.dataset.mountCount = String(Number(hostEl.dataset.mountCount ?? 0) + 1);
    log([`── mounted ${editor.name} ${editor.version} (stock) — ${contextLabel()}`]);
  }

  // -------------------------------------------------------------------
  // The measured matrix
  // -------------------------------------------------------------------
  function renderMatrix() {
    const MATRIX = matrixFor(shownEngine, contextId);
    const rows = [];
    for (const row of MATRIX) {
      const dim =
        (row.dimWhenRangesOff && !rangesEl.checked) ||
        (row.dimWhenSelectionOff && !selectionEl.checked);
      const cells = editors.map((spec) => {
        const value = row.by[spec.kind];
        return el("td", {
          className: `${spec.kind === selected ? "active " : ""}${OUTCOME_CLASS[value] ?? "no"}`,
          textContent: OUTCOME_TEXT[value] ?? value,
        });
      });
      const label = el("td", {}, [
        document.createTextNode(row.label),
        row.varies ? el("span", { className: "varies", textContent: " varies by engine" }) : null,
      ]);
      rows.push(el("tr", { className: dim ? "dim" : "" }, [label, ...cells]));
    }
    matrixEl.replaceChildren(
      el("thead", {}, [
        el("tr", {}, [
          el("th", {}, [
            document.createTextNode("strategy"),
            shownEngine === thisEngine
              ? el("span", { className: "varies", textContent: "measured in this browser" })
              : null,
          ]),
          ...editors.map((spec) =>
            el("th", {
              className: spec.kind === selected ? "active" : "",
              textContent: `${spec.label} ${spec.version}`,
            }),
          ),
        ]),
      ]),
      el("tbody", {}, rows),
    );

    const varying = MATRIX.filter((row) => row.varies);
    variesEl.replaceChildren(
      ...(varying.length === 0
        ? [document.createTextNode("Every strategy behaved identically in all measured engines.")]
        : [
            document.createTextNode(
              `${varying.length} of ${MATRIX.length} strategies differ between engines, marked above:`,
            ),
            el("ul", {}, varying.map((row) => el("li", { textContent: row.label }))),
            document.createTextNode(noteFor(contextId)),
          ]),
    );
  }

  // -------------------------------------------------------------------
  // Strategies
  // -------------------------------------------------------------------
  function report(editorRef, result, info) {
    const after = editorRef.text();
    const outcome = classifyOutcome(after);
    const [verdictClass, verdictText] = VERDICT[outcome] ?? [
      "bad",
      "UNEXPECTED RESULT — " + JSON.stringify(after),
    ];
    outcomeEl.replaceChildren(
      el("div", { className: `verdict ${verdictClass}` }, [
        el("span", { textContent: verdictText }),
      ]),
      el("div", { className: "beforeafter" }, [
        el("div", {}, [
          el("span", { className: "lbl", textContent: "before" }),
          document.createTextNode(result.before),
        ]),
        el("div", {}, [
          el("span", { className: "lbl", textContent: "after" }),
          el("span", { id: "text-after", textContent: result.after }),
        ]),
        el("div", {}, [
          el("span", { className: "lbl", textContent: "DOM" }),
          // id'd because CKEditor 5 can replace its editable element on focus, so a
          // test cannot hold on to a DOM node and re-read it later.
          el("span", { className: "mono", id: "dom-after", textContent: editorRef.html() }),
        ]),
      ]),
    );
    const dl = el("dl");
    for (const [key, value] of Object.entries(info.details)) {
      dl.append(el("dt", { textContent: key }), el("dd", { textContent: value }));
    }
    outcomeEl.append(dl);
    log([
      `── ${editorRef.name} · ${info.label}`,
      `  before: ${JSON.stringify(result.before)}`,
      `  after:  ${JSON.stringify(result.after)}`,
      ...info.lines,
    ]);
  }

  /** The page's controls, as the shape `runStrategy` takes. */
  function readUi() {
    return {
      ranges: rangesEl.checked,
      selection: selectionEl.checked,
      supply: supplyEl.value,
      settle: settleEl.value,
      clipboard: clipboardEl.value,
    };
  }

  async function press(button) {
    const target = context();
    const editorRef = editor;
    if (!editorRef) {
      log([`── nothing to press against: ${selected} is not mounted in this engine`]);
      return;
    }
    const range = editorRef.rangeForWord(WORD);
    let info = null;
    const result = await verifyEdit(
      () => editorRef.text(),
      // Awaited: a strategy that yields before dispatching (the paste-after-a-yield
      // button) would still be pending when verifyEdit read the text.
      async () => { info = await target.dispatch(button, { editor: editorRef, range, ui: readUi() }); },
    );
    report(editorRef, result, info ?? { label: button.label, details: {}, lines: [] });
  }

  function buildButtons() {
    for (const button of BUTTONS) {
      const node = el("button", { className: "action", id: button.id, type: "button", textContent: button.label });
      node.addEventListener("click", () => { void press(button); });
      buttonsEl.append(node);
    }
    const reset = el("button", { className: "action ghost", id: "go-reset", type: "button", textContent: "Reset editor" });
    reset.addEventListener("click", () => { void selectEditor(selected); });
    buttonsEl.append(reset);
  }

  // -------------------------------------------------------------------
  async function start() {
    if (editors.map((spec) => spec.kind).join() !== config.editorKinds.join()) {
      throw new Error(
        `switcher and recorded expectations disagree: ${editors.map((s) => s.kind)} vs ${config.editorKinds}`,
      );
    }

    buildSwitcher();
    buildButtons();

    if (contextEl) {
      for (const id of Object.keys(contexts)) {
        const label = CONTEXT_LABELS[id]?.label ?? id;
        contextEl.append(
          el("option", {
            value: id,
            selected: id === contextId,
            textContent: id === contextId ? `${label} — measuring this` : label,
          }),
        );
      }
      contextEl.addEventListener("change", async () => {
        const previous = editor;
        contextId = contextEl.value;
        try {
          await previous?.destroy?.();
        } catch {
          // same as a failed teardown during a switch
        }
        editor = null;
        await selectEditor(selected);
        renderMatrix();
        log([`── context: ${contextLabel()}`]);
      });
    }

    for (const key of engines.map((entry) => entry.key)) {
      engineEl.append(
        el("option", {
          value: key,
          selected: key === thisEngine,
          textContent: key === thisEngine
            ? `${engines.find((entry) => entry.key === key).label} — this browser`
            : engines.find((entry) => entry.key === key).label,
        }),
      );
    }
    engineEl.addEventListener("change", () => {
      shownEngine = engineEl.value;
      renderMatrix();
      log([`── showing results measured in ${shownEngine}`]);
    });

    rangesEl.addEventListener("change", renderMatrix);
    selectionEl.addEventListener("change", renderMatrix);
    await config.before?.start?.();
    await selectEditor(selected);
    renderMatrix();

    const versionsEl = document.getElementById("versions");
    if (versionsEl) {
      const here = engines.find((entry) => entry.key === thisEngine);
      versionsEl.textContent = `Running in ${here.label}. ${navigator.userAgent}`;
    }
    log(["ready — pick an editor and press a button"]);
  }

  return {
    start,
    /** Remount the current editor: the documented way back to a known text. */
    reset: () => selectEditor(selected),
    get editor() { return editor; },
    get contextId() { return contextId; },
  };
}