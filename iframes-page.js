/**
 * The iframe contexts page: the same seven buttons, with one side of the edit moved
 * into a same-origin iframe.
 *
 * The measured matrices, the report panel and the buttons all come from the shared UI,
 * so this page cannot describe a result differently from index.html. What is specific
 * here is the wiring: which realm hosts the editor, which realm installs the probe
 * listeners, and which realm runs the strategy.
 */

(async function () {
  const {
    BROWSER_KEYS,
    CONTEXT_EXPECTATIONS,
    CONTEXT_LABELS,
    CONTEXT_PROBES,
    EDITORS,
    EDITOR_KINDS,
    PROBES,
    codeInIframeContext,
    createDemo,
    dispatchAsInfluenceRealm,
    editorInIframeContext,
    listenAsEditorRealm,
    matrixRows,
    runEnvironmentProbes,
    sameDocumentContext,
    TOP,
  } = window.LingoDemo;

  const ENGINE_LABELS = {
    chromium: "Chromium 153",
    firefox: "Firefox 155",
    webkit: "WebKit / Safari 26.6",
  };
  const ENGINE_KEYS = Object.keys(ENGINE_LABELS);

  const contexts = {
    [TOP]: withProbes(sameDocumentContext(), () => document),
    // The editor is mounted *by the frame*, so the listeners that get to ask questions
    // in the editor's own terms have to be installed in the frame too.
    "editor-in-iframe": withProbes(editorInIframeContext(), (context) => context.editorDoc()),
    // The editor's realm is this document, but the *influencing* realm is the frame's, so
    // the probe dispatch has to happen over there. Same code, other side.
    "code-in-iframe": withProbes(codeInIframeContext(), () => document),
  };

  /**
   * Give a context a probe hook: the influencing half always runs in this realm, and the
   * editor's half is whatever realm the editor is mounted in.
   */
  function withProbes(context, editorDoc) {
    return {
      ...context,
      async installEditorRealmProbes(editor) {
        const doc = editorDoc(context);
        if (!doc) return null;
        return listenAsEditorRealm(doc, editor?.el ?? null);
      },
      async probe({ target, range }) {
        return context.probe
          ? context.probe({ target, range })
          : dispatchAsInfluenceRealm({ target, range });
      },
    };
  }

  const demo = createDemo({
    editors: EDITORS,
    editorKinds: EDITOR_KINDS,
    contexts,
    initialContext: "editor-in-iframe",
    engines: ENGINE_KEYS.map((key) => ({ key, label: ENGINE_LABELS[key], test: BROWSER_KEYS.find((e) => e.key === key).test })),
    matrixFor: (engine, contextId) => matrixRows(contextId, engine),
    noteFor: (contextId) =>
      `The short version for ${CONTEXT_LABELS[contextId].short}: the DOM selection and the ` +
      "dispatch itself cross realms, because both are document state; an own property " +
      "defined on the event does not, because it belongs to the realm that defined it.",
    before: {
      async start() {
        contextEl.addEventListener("change", () => {
          renderClaim();
          renderProbes();
        });
        renderClaim();
      },
    },
  });

  const contextEl = document.getElementById("context");
  const claimEl = document.getElementById("context-claim");
  const whereEl = document.getElementById("context-where");
  const probesEl = document.getElementById("probes");
  const probeStatus = document.getElementById("probe-status");
  const probeOutput = document.getElementById("probe-output");

  function renderClaim() {
    const spec = CONTEXT_LABELS[contextEl.value];
    claimEl.textContent = spec.claim;
    whereEl.textContent = `code → editor: ${spec.where}`;
  }

  /**
   * The recorded probe table for the selected context.
   *
   * Renders the *recorded* values, because they are the assertion; the button below
   * then shows what this browser does right now, which is how a reader checks the
   * documentation instead of trusting it.
   */
  function renderProbes() {
    const contextId = contextEl.value;
    const recorded = CONTEXT_PROBES?.[contextId] ?? null;
    const rows = [];
    rows.push(el("tr", {}, [el("th", { textContent: "probe" }), ...ENGINE_KEYS.map((key) => el("th", { textContent: ENGINE_LABELS[key] }))]));
    for (const probe of PROBES) {
      const cells = ENGINE_KEYS.map((engine) => {
        const value = recorded?.[engine]?.[probe.id];
        const text = value === undefined ? "not measured here" : String(value);
        return el("td", { className: "value", textContent: text });
      });
      rows.push(
        el("tr", { className: contextId === TOP ? "dim" : "" }, [
          el("td", {}, [
            document.createTextNode(probe.label),
            el("span", { className: "where", textContent: probe.question }),
          ]),
          ...cells,
        ]),
      );
    }
    probesEl.replaceChildren(el("thead", {}, rows.slice(0, 1)), el("tbody", {}, rows.slice(1)));
  }

  document.getElementById("run-probes").addEventListener("click", async () => {
    const button = document.getElementById("run-probes");
    button.disabled = true;
    probeStatus.textContent = "running…";
    const context = contexts[contextEl.value];
    try {
      // The probes aim at "quick", so a previous button press has to be undone first.
      await demo.reset();
      const editor = demo.editor;
      const range = editor.rangeForWord("quick");
      await context.installEditorRealmProbes(editor);
      const observed = await context.probe({ target: editor.el, range });
      const environment = await runEnvironmentProbes(document);
      probeOutput.hidden = false;
      probeOutput.textContent = JSON.stringify(
        {
          context: contextEl.value,
          browser: ENGINE_LABELS[ENGINE_KEYS.find((key) => BROWSER_KEYS.find((b) => b.key === key).test.test(navigator.userAgent))?.key ?? "chromium"],
          influenceRealm: observed,
          environment,
        },
        null,
        2,
      );
      probeStatus.textContent = "done — the JSON above is what each realm could see";
    } catch (error) {
      probeStatus.textContent = `failed: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  });

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const child of children) if (child) node.append(child);
    return node;
  }

  await demo.start();
  renderProbes();
})();