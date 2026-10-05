/**
 * Wires the page. Nothing here knows anything about editors: it picks the context, hands
 * the shared UI the recorded results to render, and gets out of the way.
 *
 * The strategy code, the report, the matrix and the buttons are all shared with
 * iframes.html and extension.html, so the three pages cannot describe the same
 * measurement differently — see demo-ui.js.
 */

(async function () {
  const {
    BROWSER_KEYS,
    EDITORS,
    EDITOR_KINDS,
    createDemo,
    matrixRows,
    sameDocumentContext,
    TOP,
  } = window.LingoDemo;

  const ENGINE_LABELS = {
    chromium: "Chromium 153",
    firefox: "Firefox 155",
    webkit: "WebKit / Safari 26.6",
  };

  await createDemo({
    editors: EDITORS,
    editorKinds: EDITOR_KINDS,
    contexts: { [TOP]: sameDocumentContext() },
    initialContext: TOP,
    engines: BROWSER_KEYS.map(({ key }) => ({
      key,
      label: ENGINE_LABELS[key],
      test: BROWSER_KEYS.find((entry) => entry.key === key).test,
    })),
    matrixFor: (engine, contextId) => matrixRows(contextId, engine),
    noteFor: () =>
      "See README.md for the full per-engine tables — the short version is that Firefox " +
      "ignores clipboardData on a constructed ClipboardEvent, and Safari dispatches a " +
      "beforeinput event for execCommand.",
  }).start();
})();