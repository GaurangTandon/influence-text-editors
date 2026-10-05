/**
 * The page's half of the extension bridge.
 *
 * There is no shared function to call and no shared object to pass: a content script in
 * an isolated world cannot be reached from the page by any means except the DOM, and the
 * DOM only carries strings. So the two halves talk over CustomEvents with a JSON string
 * detail, keyed by a request id, and the page waits for the answer.
 *
 * Kept in the bundle (rather than in extension-page.js) for two reasons: the page needs
 * it, and test/harness.mjs needs to drive exactly the same exchange the buttons drive,
 * so a test cannot pass by a route the page does not have.
 *
 * The bridge is bound to a *document*, not to the window. That is what lets the same
 * code reach a content script injected into a same-origin iframe, by being handed that
 * iframe's document.
 */

export const REQUEST_EVENT = "lingo-demo:run";
export const PROBE_REQUEST_EVENT = "lingo-demo:probe";
export const PING_EVENT = "lingo-demo:ping";
export const RESULT_EVENT = "lingo-demo:result";
export const READY_ATTR = "lingoExtension";

const parse = (value) => {
  try {
    return JSON.parse(typeof value === "string" ? value : "{}");
  } catch {
    return {};
  }
};

/**
 * Talk to whichever content scripts are listening in `doc`'s realm.
 *
 * @param {{doc?: Document, timeoutMs?: number}} options
 */
export function createExtensionBridge({ doc = document, timeoutMs = 4000 } = {}) {
  const pending = new Map();
  let seq = 0;

  const onResult = (event) => {
    const detail = parse(event?.detail);
    const entry = pending.get(detail.id);
    if (!entry) return;
    pending.delete(detail.id);
    clearTimeout(entry.timer);
    entry.resolve(detail);
  };
  doc.addEventListener(RESULT_EVENT, onResult);

  const send = (type, payload) =>
    new Promise((resolve) => {
      // Unique per page instance, because both worlds answer the same request.
      const id = `r${++seq}-${Math.random().toString(36).slice(2, 8)}`;
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ id, timeout: true, error: `no content script answered ${type}` });
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      doc.dispatchEvent(
        new CustomEvent(type, { detail: JSON.stringify({ ...payload, id }) }),
      );
    });

  return {
    /** Which worlds have announced themselves in this document. */
    worlds() {
      return (doc.documentElement.dataset[READY_ATTR] ?? "").split(/\s+/).filter(Boolean);
    },
    /**
     * Ask one world to run a strategy. `world` is "isolated" or "main"; the other world
     * ignores the request, so this is not a race.
     */
    run(world, buttonId, ui) {
      return send(REQUEST_EVENT, { world, button: buttonId, ui });
    },
    /** Ask one world to run the isolation probes from its own realm. */
    probe(world) {
      return send(PROBE_REQUEST_EVENT, { world });
    },
    /**
     * Re-announce, in case the page loaded before the content scripts did.
     *
     * Nothing answers a ping, so this polls the shared attribute rather than waiting on
     * a reply — a data attribute the isolated world wrote is readable here, and that is
     * the whole announcement mechanism.
     */
    async ping({ withinMs = 2000 } = {}) {
      const started = Date.now();
      do {
        doc.dispatchEvent(new CustomEvent(PING_EVENT, { detail: JSON.stringify({ id: `p${++seq}` }) }));
        if (this.worlds().length) return this.worlds();
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (Date.now() - started < withinMs);
      return this.worlds();
    },
    stop() {
      doc.removeEventListener(RESULT_EVENT, onResult);
    },
  };
}