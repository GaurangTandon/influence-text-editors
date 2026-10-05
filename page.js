/**
 * Wires the page. Nothing here knows anything about editors: it mounts whichever
 * one is selected, hands the strategy layer an editable root, and reports what
 * changed.
 */

(async function () {
  const {
    EDITORS,
    WORD,
    BROWSER_KEYS,
    EXPECTATIONS,
    ROW_LABELS,
    EDITOR_KINDS,
    TARGET_RANGE_SUPPLY,
    CLIPBOARD_SUPPLY,
    classifyOutcome,
    mountEditor,
    attachTargetRanges,
    dispatchBeforeinput,
    dispatchDeleteKey,
    dispatchPaste,
    dispatchPasteWithWait,
    execInsert,
    verifyEdit,
  } = window.LingoDemo;

  const REPLACEMENT = "sluggish";
  const REPLACEMENT_HTML = "<em>sluggish</em>";

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

  /**
   * Which of the measured engines this page is running in. The matrix below is
   * rendered out of expectations.js — the same table test/verify.mjs asserts
   * against a real measurement — so the page cannot report something the tests
   * disagree with.
   */
  const BROWSER =
    BROWSER_KEYS.find((candidate) => candidate.test.test(navigator.userAgent))?.key ?? "chromium";

  // Which engine's recorded results the table shows. Defaults to the engine this
  // browser actually is, but any of the three can be inspected from any browser,
  // so you can get the whole picture without switching engines.
  let shownEngine = BROWSER;
  const ENGINE_LABELS = {
    chromium: "Chromium 153",
    firefox: "Firefox 155",
    webkit: "WebKit / Safari 26.6",
  };

  const matrixFor = (engine) =>
    EXPECTATIONS[engine].map((row, index) => ({
    label: ROW_LABELS[index],
      by: EDITOR_KINDS.reduce((acc, kind) => Object.assign(acc, { [kind]: row[kind] }), {}),
      // Rows that are not the same in all three engines, so the note under the
      // table can point at them.
      varies:
        new Set(
          Object.keys(EXPECTATIONS).map((key) => JSON.stringify(EXPECTATIONS[key][index])),
        ).size > 1,
    }));

  const OUTCOME_TEXT = {
    unchanged: "no edit",
    replaced: "edit",
    deleted: "edit, word deleted",
    "at-caret": "edit, at caret",
  };
  const OUTCOME_CLASS = { unchanged: "no", replaced: "yes", deleted: "warn", "at-caret": "warn" };

  let editor = null;
  let selected = EDITORS[0].kind;

  function log(lines) {
    logEl.textContent = `${lines.join("\n")}\n\n${logEl.textContent}`.trimEnd();
    logEl.scrollTop = 0;
  }

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const child of children) {
      // Callers pass conditional children as null; append() would stringify
      // those into the element as the text "null".
      if (child !== null && child !== undefined) {
        node.append(child);
      }
    }
    return node;
  }

  // -------------------------------------------------------------------
  // Editor switcher
  // -------------------------------------------------------------------
  function buildSwitcher() {
    for (const spec of EDITORS) {
      const button = el("button", {
        type: "button",
        "aria-pressed": String(spec.kind === selected),
      }, [
        document.createTextNode(spec.label),
        el("small", { textContent: spec.version }),
      ]);
      button.addEventListener("click", () => { void selectEditor(spec.kind); });
      switcherEl.append(button);
    }
  }

  function markSwitcher() {
    for (const [index, spec] of EDITORS.entries()) {
      switcherEl.children[index].setAttribute(
        "aria-pressed",
        String(spec.kind === selected),
      );
    }
  }

  async function selectEditor(kind) {
    selected = kind;
    markSwitcher();
    renderMatrix();
    // Tear the previous editor down properly before clearing the host: CKEditor
    // 5 in particular keeps document-level listeners, so just dropping its DOM
    // leaves a live editor reacting to everything that follows. Its destroy()
    // is async and must finish before we dispatch anything at the document
    // again.
    try {
      await editor?.destroy?.();
    } catch {
      // A failed teardown must not stop the next editor from mounting.
    }
    editor = null;
    hostEl.replaceChildren();
    outcomeEl.replaceChildren();
    // Published so test/verify.mjs can wait for a mount instead of sleeping.
    // CKEditor's mount is async (its build is fetched on demand), so the
    // attribute is only set once there really is an editor in the host.
    delete hostEl.dataset.mounted;
    const placeholder = el("div", { className: "note", textContent: "loading…" });
    hostEl.append(placeholder);
    editor = await mountEditor(kind, hostEl);
    placeholder.remove();
    hostEl.dataset.mounted = kind;
    hostEl.dataset.mountCount = String(Number(hostEl.dataset.mountCount ?? 0) + 1);
    log([`── mounted ${editor.name} ${editor.version} (stock)`]);
  }

  // -------------------------------------------------------------------
  // The measured matrix
  // -------------------------------------------------------------------
  function renderMatrix() {
    const MATRIX = matrixFor(shownEngine);
    const rows = [];
    for (const row of MATRIX) {
      const dim =
        (row.dimWhenRangesOff && !rangesEl.checked) ||
        (row.dimWhenSelectionOff && !selectionEl.checked);
      const cells = EDITORS.map((spec) => {
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
            shownEngine === BROWSER
              ? el("span", { className: "varies", textContent: "measured in this browser" })
              : null,
          ]),
          ...EDITORS.map((spec) =>
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
    // replaceChildren takes varargs, not an array.
    variesEl.replaceChildren(
      ...(varying.length === 0
        ? [document.createTextNode("Every strategy behaved identically in all three engines.")]
        : [
            document.createTextNode(
              `${varying.length} of ${MATRIX.length} strategies differ between engines, marked above:`,
            ),
            el("ul", {}, varying.map((row) => el("li", { textContent: row.label }))),
            document.createTextNode(
              "See README.md for the full per-engine tables — the short version is that " +
                "Firefox ignores clipboardData on a constructed ClipboardEvent, and Safari " +
                "dispatches a beforeinput event for execCommand.",
            ),
          ]),
    );
  }

  // -------------------------------------------------------------------
  // Strategies
  // -------------------------------------------------------------------
  /** `getTargetRanges()` with and without the attachment, for the report. */
  function targetRangeProbe(range) {
    const make = () =>
      new InputEvent("beforeinput", {
        inputType: "insertReplacementText",
        data: REPLACEMENT,
      });
    const bare = make();
    const attached = make();
    attachTargetRanges(attached, range);
    return {
      before: JSON.stringify(bare.getTargetRanges()),
      after: JSON.stringify(
        attached.getTargetRanges().map((r) => ({
          container: r.startContainer.nodeName,
          startOffset: r.startOffset,
          endOffset: r.endOffset,
          collapsed: r.collapsed,
        })),
      ),
    };
  }

  function report(editorRef, result, details, extraLog) {
    const after = editorRef.text();
    const outcome = classifyOutcome(after);
    const VERDICT = {
      unchanged: ["bad", "NO EDIT — the editor ignored the event"],
      replaced: ["ok", "EDIT APPLIED — the editor acted on the event, at the target range"],
      deleted: [
        "bad",
        "CONTENT CHANGED, BUT DELETED — “" + WORD + "” is gone and nothing replaced it",
      ],
      "at-caret": [
        "bad",
        "CONTENT CHANGED, BUT MISPLACED — “" + WORD + "” survived; the replacement went to the caret",
      ],
    };
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
          // id'd because CKEditor 5 can replace its editable element on focus,
          // so a test cannot hold on to a DOM node and re-read it later.
          el("span", { className: "mono", id: "dom-after", textContent: editorRef.html() }),
        ]),
      ]),
    );
    const dl = el("dl");
    for (const [key, value] of Object.entries(details)) {
      dl.append(el("dt", { textContent: key }), el("dd", { textContent: value }));
    }
    outcomeEl.append(dl);
    log([
      `── ${editorRef.name} · ${extraLog.label}`,
      `  before: ${JSON.stringify(result.before)}`,
      `  after:  ${JSON.stringify(result.after)}`,
      ...extraLog.lines,
    ]);
  }

  document.getElementById("go-beforeinput").addEventListener("click", async () => {
    const target = editor;
    const range = target.rangeForWord(WORD);
    const probe = targetRangeProbe(range);
    const dispatched = [];
    const result = await verifyEdit(
      () => target.text(),
      () =>
        dispatched.push(
          dispatchBeforeinput({
            target: target.el,
            range,
            text: REPLACEMENT,
            html: REPLACEMENT_HTML,
            inputType: "insertReplacementText",
            selectFirst: selectionEl.checked,
            attachRanges: rangesEl.checked,
            supply: supplyEl.value,
          }),
        ),
    );
    const event = dispatched[0].event;
    report(target, result, {
      "getTargetRanges() without the attachment": probe.before,
      "getTargetRanges() after the attachment": probe.after,
      "supply mode": supplyEl.value,
      "getTargetRanges() before dispatch": String(dispatched[0].rangesBeforeDispatch),
      "method shadowed": String(dispatched[0].methodShadowed),
      "defaultPrevented (the editor consumed it)": String(event.defaultPrevented),
      "DOM selection set before dispatching": String(selectionEl.checked),
    }, { label: "beforeinput", lines: [`  prevented: ${event.defaultPrevented}`] });
  });

  document.getElementById("go-beforeinput-text").addEventListener("click", async () => {
    const target = editor;
    const range = target.rangeForWord(WORD);
    const dispatched = [];
    const result = await verifyEdit(
      () => target.text(),
      () =>
        dispatched.push(
          dispatchBeforeinput({
            target: target.el,
            range,
            text: REPLACEMENT,
            html: REPLACEMENT_HTML,
            // insertText, not insertReplacementText: editors disagree about which
            // of the two they implement. Wordgard only handles this one.
            inputType: "insertText",
            selectFirst: selectionEl.checked,
            attachRanges: rangesEl.checked,
            supply: supplyEl.value,
          }),
        ),
    );
    const event = dispatched[0].event;
    report(target, result, {
      inputType: event.inputType,
      "supply mode": supplyEl.value,
      "getTargetRanges() before dispatch": String(dispatched[0].rangesBeforeDispatch),
      "method shadowed": String(dispatched[0].methodShadowed),
      "defaultPrevented (the editor consumed it)": String(event.defaultPrevented),
      "DOM selection set before dispatching": String(selectionEl.checked),
    }, { label: "beforeinput insertText", lines: [`  prevented: ${event.defaultPrevented}`] });
  });

  document.getElementById("go-delete-input").addEventListener("click", async () => {
    const target = editor;
    const range = target.rangeForWord(WORD);
    const probe = targetRangeProbe(range);
    const dispatched = [];
    const result = await verifyEdit(
      () => target.text(),
      () =>
        dispatched.push(
          dispatchBeforeinput({
            target: target.el,
            range,
            text: "",
            inputType: "deleteContentBackward",
            selectFirst: selectionEl.checked,
            attachRanges: rangesEl.checked,
            supply: supplyEl.value,
          }),
        ),
    );
    const event = dispatched[0].event;
    report(target, result, {
      inputType: event.inputType,
      "supply mode": supplyEl.value,
      "getTargetRanges() without the attachment": probe.before,
      "getTargetRanges() after the attachment": probe.after,
      "defaultPrevented (the editor consumed it)": String(event.defaultPrevented),
      "DOM selection set before dispatching": String(selectionEl.checked),
    }, { label: "beforeinput deleteContentBackward", lines: [`  prevented: ${event.defaultPrevented}`] });
  });

  document.getElementById("go-keydown").addEventListener("click", async () => {
    const target = editor;
    const range = target.rangeForWord(WORD);
    const dispatched = [];
    const result = await verifyEdit(
      () => target.text(),
      () =>
        dispatched.push(
          dispatchDeleteKey({
            target: target.el,
            key: "Backspace",
            keyCode: 8,
            range,
            selectFirst: selectionEl.checked,
          }),
        ),
    );
    const event = dispatched[0].event;
    report(target, result, {
      selected: JSON.stringify(range.toString()),
      "keyCode on the scripted event": String(event.keyCode),
      "defaultPrevented (the editor consumed it)": String(event.defaultPrevented),
      "DOM selection set before dispatching": String(selectionEl.checked),
    }, { label: "faked Backspace", lines: [`  prevented: ${event.defaultPrevented}`] });
  });

  document.getElementById("go-paste").addEventListener("click", async () => {
    const target = editor;
    const range = target.rangeForWord(WORD);
    const dispatched = [];
    const result = await verifyEdit(
      () => target.text(),
      () =>
        dispatched.push(
          dispatchPaste({
            target: target.el,
            text: REPLACEMENT,
            html: REPLACEMENT_HTML,
            range,
            selectFirst: selectionEl.checked,
            clipboard: clipboardEl.value,
          }),
        ),
    );
    const event = dispatched[0].event;
    report(target, result, {
      "clipboard supply": clipboardEl.value,
      "clipboard is a real DataTransfer": String(dispatched[0].clipboardIsReal),
      "clipboardData text/plain": JSON.stringify(event.clipboardData?.getData("text/plain")),
      "clipboardData text/html": JSON.stringify(event.clipboardData?.getData("text/html")),
      "getTargetRanges on a ClipboardEvent": String(
        typeof event.getTargetRanges === "function",
      ),
      "defaultPrevented (the editor consumed it)": String(event.defaultPrevented),
      "DOM selection set before dispatching": String(selectionEl.checked),
    }, { label: "synthetic paste", lines: [`  prevented: ${event.defaultPrevented}`] });
  });

  document.getElementById("go-paste-wait").addEventListener("click", async () => {
    const target = editor;
    const range = target.rangeForWord(WORD);
    const settle = /^[0-9]+$/.test(settleEl.value) ? Number(settleEl.value) : settleEl.value;
    const dispatched = [];
    const result = await verifyEdit(
      () => target.text(),
      // Must be awaited: dispatchPasteWithWait yields before dispatching, so
      // without the await the paste would still be pending when verifyEdit reads.
      async () =>
        dispatched.push(
          await dispatchPasteWithWait({
            target: target.el,
            text: REPLACEMENT,
            html: REPLACEMENT_HTML,
            range,
            selectFirst: selectionEl.checked,
            settle,
            clipboard: clipboardEl.value,
          }),
        ),
    );
    const event = dispatched[0].event;
    report(target, result, {
      "yield mode": String(settle),
      "waited": `${dispatched[0].waitedMs.toFixed(1)} ms`,
      "clipboard supply": clipboardEl.value,
      "clipboard is a real DataTransfer": String(dispatched[0].clipboardIsReal),
      "clipboardData text/plain": JSON.stringify(event.clipboardData?.getData("text/plain")),
      "defaultPrevented (the editor consumed it)": String(event.defaultPrevented),
      "DOM selection set before dispatching": String(selectionEl.checked),
    }, {
      label: "synthetic paste after a yield",
      lines: [`  waited ${dispatched[0].waitedMs.toFixed(1)}ms (mode ${settle})`],
    });
  });

  document.getElementById("go-exec").addEventListener("click", async () => {
    const target = editor;
    const range = target.rangeForWord(WORD);
    const dispatched = [];
    const result = await verifyEdit(
      () => target.text(),
      () =>
        dispatched.push(
          execInsert({
            target: target.el,
            text: REPLACEMENT,
            html: REPLACEMENT_HTML,
            range,
            selectFirst: selectionEl.checked,
          }),
        ),
    );
    report(target, result, {
      "queryCommandSupported('insertHTML')": String(
        target.el.ownerDocument.queryCommandSupported?.("insertHTML"),
      ),
      "command returned": String(dispatched[0].used.join(", ") || "(none succeeded)"),
      "DOM selection set before dispatching": String(selectionEl.checked),
    }, { label: "execCommand", lines: [`  commands: ${JSON.stringify(dispatched[0].used)}`] });
  });

  document.getElementById("go-reset").addEventListener("click", async () => {
    await selectEditor(selected);
  });

  // -------------------------------------------------------------------
  if (EDITORS.map((spec) => spec.kind).join() !== EDITOR_KINDS.join()) {
    throw new Error(
      `switcher and recorded expectations disagree: ${EDITORS.map((s) => s.kind)} vs ${EDITOR_KINDS}`,
    );
  }

  buildSwitcher();
  await selectEditor(selected);
  renderMatrix();
  rangesEl.addEventListener("change", renderMatrix);
  selectionEl.addEventListener("change", renderMatrix);

  for (const key of Object.keys(EXPECTATIONS)) {
    engineEl.append(
      el("option", {
        value: key,
        selected: key === BROWSER,
        textContent: key === BROWSER
          ? `${ENGINE_LABELS[key]} — this browser`
          : ENGINE_LABELS[key],
      }),
    );
  }
  engineEl.addEventListener("change", () => {
    shownEngine = engineEl.value;
    renderMatrix();
    log([`── showing results measured in ${shownEngine}`]);
  });
  document.getElementById("versions").textContent =
    `Running in ${ENGINE_LABELS[BROWSER]}. ` + navigator.userAgent;
  log(["ready — pick an editor and press a button"]);
})();