/**
 * The extension contexts page: the same seven buttons, with the influencing code running
 * as a content script instead of in the page.
 *
 * Everything except the wiring is shared with index.html and iframes.html. What is
 * specific here is that there is no direct call to make — the page cannot invoke a
 * content script, so it asks through the bridge in extension-bridge.js and waits for an
 * answer over a CustomEvent.
 */

(async function () {
  const {
    BROWSER_KEYS,
    CONTEXT_LABELS,
    CONTEXT_PROBES,
    EDITORS,
    EDITOR_KINDS,
    PROBES,
    createDemo,
    createExtensionBridge,
    editorInIframeContext,
    listenAsEditorRealm,
    matrixRows,
    runEnvironmentProbes,
    sameDocumentContext,
  } = window.LingoDemo;

  const ENGINE_LABELS = {
    chromium: "Chromium 153",
    firefox: "Firefox 155",
    webkit: "WebKit / Safari 26.6",
  };
  const ENGINE_KEYS = Object.keys(ENGINE_LABELS);

  const topBridge = createExtensionBridge();

  /**
   * A context whose strategy runs in an extension world instead of in this realm.
   *
   * The mount is the ordinary same-document one: the editor is stock, and stock means it
   * lives wherever the page puts it. Only the dispatch crosses worlds. The answer comes
   * back as JSON, so `details` and `lines` arrive as plain strings — exactly what the
   * shared report panel expects.
   */
  function extensionContext({ id, inner, bridge = topBridge, editorDocument = () => document }) {
    const world = id === "extension-main" ? "main" : "isolated";
    return {
      id,
      world,
      async mount(kind, hostEl) {
        const editor = await inner.mount(kind, hostEl);
        // Fresh listeners per mount, so a probe never sees the previous editor's report.
        listenAsEditorRealm(editorDocument(), editor.el);
        return editor;
      },
      async dispatch(button, args) {
        const answer = await bridge.run(world, button.id, args.ui);
        if (answer.error || answer.timeout) {
          return {
            label: button.label,
            details: { "content script": String(answer.error ?? "no answer") },
            lines: [`  ${world} world: ${answer.error ?? "timeout"}`],
          };
        }
        return {
          label: `${button.label} — dispatched in the ${answer.world} world`,
          details: answer.details ?? {},
          lines: answer.lines ?? [],
        };
      },
      async probe({ target, range }) {
        listenAsEditorRealm(editorDocument(), target);
        const answer = await bridge.probe(world);
        return answer.probe ?? { error: answer.error ?? "no answer" };
      },
    };
  }

  /**
   * The hardest combination, and the one Google Docs and Word for the web present: the
   * content script runs in the extension's world *and* the editor lives in a same-origin
   * iframe. Both halves move — the bridge is bound to the iframe's document, because that
   * is where its content script was injected.
   */
  const iframeInner = editorInIframeContext();
  const contexts = {
    "extension-isolated": extensionContext({ id: "extension-isolated", inner: sameDocumentContext() }),
    "extension-main": extensionContext({ id: "extension-main", inner: sameDocumentContext() }),
    "extension-isolated-in-iframe": extensionContext({
      id: "extension-isolated-in-iframe",
      inner: iframeInner,
      // The bridge is created per frame, once the frame exists — that is where the
      // frame's content script was injected, so that is the document it listens on.
      // Same signature as the top bridge, so the context cannot tell the difference.
      bridge: {
        run: (world, buttonId, ui) => iframeBridge().run(world, buttonId, ui),
        probe: (world) => iframeBridge().probe(world),
      },
      editorDocument: () => iframeInner.editorDoc() ?? document,
    }),
  };
  let frameBridge = null;
  const iframeBridge = () => {
    frameBridge ??= createExtensionBridge({ doc: iframeInner.editorDoc() });
    return frameBridge;
  };

  const contextEl = document.getElementById("context");
  const claimEl = document.getElementById("context-claim");
  const whereEl = document.getElementById("context-where");
  const probesEl = document.getElementById("probes");
  const statusEl = document.getElementById("bridge-status");
  const detailEl = document.getElementById("bridge-detail");
  const probeStatus = document.getElementById("probe-status");
  const probeOutput = document.getElementById("probe-output");

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const child of children) if (child) node.append(child);
    return node;
  }

  function renderClaim() {
    const spec = CONTEXT_LABELS[contextEl.value];
    claimEl.textContent = spec.claim;
    whereEl.textContent = `code → editor: ${spec.where}`;
  }

  /** Whether the extension is installed, and in which worlds. */
  async function renderStatus() {
    const worlds = await topBridge.ping();
    statusEl.replaceChildren(
      ...["isolated", "main"].map((world) =>
        el("span", {
          className: worlds.includes(world) ? "on" : "off",
          textContent: `${world === "isolated" ? "ISOLATED" : "MAIN"} world: ${
            worlds.includes(world) ? "listening" : "not installed"
          }`,
        }),
      ),
    );
    detailEl.textContent = worlds.length
      ? `Content scripts found: ${worlds.join(", ")}. The buttons dispatch from those worlds.`
      : "No content script is listening, so the buttons can only report that. Install it as described above.";
    return worlds;
  }

  /** The recorded probe values for the selected context. */
  function renderProbes() {
    const recorded = CONTEXT_PROBES?.[contextEl.value] ?? null;
    const rows = [
      el("tr", {}, [
        el("th", { textContent: "probe" }),
        ...ENGINE_KEYS.map((key) => el("th", { textContent: ENGINE_LABELS[key] })),
      ]),
    ];
    for (const probe of PROBES) {
      rows.push(
        el("tr", {}, [
          el("td", {}, [
            document.createTextNode(probe.label),
            el("span", { className: "where", textContent: probe.question }),
          ]),
          ...ENGINE_KEYS.map((engine) =>
            el("td", {
              className: "value",
              textContent:
                recorded?.[engine]?.[probe.id] === undefined
                  ? "not measured here"
                  : String(recorded[engine][probe.id]),
            }),
          ),
        ]),
      );
    }
    probesEl.replaceChildren(el("thead", {}, rows.slice(0, 1)), el("tbody", {}, rows.slice(1)));
  }

  document.getElementById("run-probes").addEventListener("click", async () => {
    const button = document.getElementById("run-probes");
    button.disabled = true;
    probeStatus.textContent = "running…";
    try {
      await renderStatus();
      const context = contexts[contextEl.value];
      // The probes aim at "quick", so any earlier edit has to be undone first.
      await demo.reset();
      const editor = demo.editor;
      const range = editor.rangeForWord("quick");
      const observed = await context.probe({ target: editor.el, range });
      const environment = await runEnvironmentProbes(document);
      probeOutput.hidden = false;
      probeOutput.textContent = JSON.stringify(
        {
          context: contextEl.value,
          world: context.world,
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

  const demo = createDemo({
    editors: EDITORS,
    editorKinds: EDITOR_KINDS,
    contexts,
    initialContext: "extension-isolated",
    engines: ENGINE_KEYS.map((key) => ({
      key,
      label: ENGINE_LABELS[key],
      test: BROWSER_KEYS.find((entry) => entry.key === key).test,
    })),
    matrixFor: (engine, contextId) => matrixRows(contextId, engine),
    noteFor: (contextId) => CONTEXT_LABELS[contextId]?.claim ?? "",
    before: {
      async start() {
        contextEl.addEventListener("change", () => {
          renderClaim();
          renderProbes();
        });
        renderClaim();
        renderProbes();
        await renderStatus();
      },
    },
  });

  await demo.start();
})();