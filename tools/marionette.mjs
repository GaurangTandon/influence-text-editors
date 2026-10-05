/**
 * Marionette, just enough of it to install a Firefox extension into Playwright's build.
 *
 * Playwright cannot load a Firefox extension the way it loads a Chromium one:
 *
 *   - a persistent profile is rebuilt at launch, so an XPI dropped into
 *     `<profile>/extensions/` beforehand is deleted before Firefox scans for it;
 *   - `about:debugging`, where a temporary add-on would be loaded by hand, cannot be
 *     navigated to for automation at all (it never reaches `load` or even `commit`).
 *
 * What remains is Firefox's own automation protocol, which `Addon:Install` accepts an
 * archive path for. Firefox is launched with `-marionette` and the exchange below is
 * its wire format: packets are `<byteLength>:<json>`, where the JSON is
 * `[type, id, name, params]` and errors arrive as a third element.
 *
 * Only two commands are needed, so only two are implemented.
 */

import net from "node:net";

/**
 * Connect to a running Firefox's marionette port and install an extension.
 *
 * @param {{port: number, xpiPath: string, timeoutMs?: number}} options
 * @returns {Promise<{addonId: string}>}
 */
export async function installTemporaryAddon({ port, xpiPath, timeoutMs = 30000 }) {
  // Firefox needs a moment after launch before marionette accepts connections.
  let lastError = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const client = await connect(port, timeoutMs);
      try {
        await client.send("WebDriver:NewSession", { capabilities: {} });
        const addonId = await client.send("Addon:Install", { path: xpiPath, temporary: true });
        return { addonId };
      } finally {
        client.close();
      }
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError ?? new Error(`could not reach marionette on port ${port}`);
}

/**
 * Open the protocol connection and read the server's greeting.
 *
 * @returns {Promise<{send: (name: string, params?: object) => Promise<any>, close: () => void}>}
 */
function connect(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.setEncoding("utf8");
    let buffer = "";
    const waiters = new Map();
    let nextId = 0;
    let greetingSeen = false;

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`no marionette greeting on port ${port} within ${timeoutMs}ms`));
    }, timeoutMs);

    socket.on("data", (chunk) => {
      buffer += chunk;
      for (;;) {
        const colon = buffer.indexOf(":");
        if (colon === -1) return;
        const length = Number(buffer.slice(0, colon));
        if (!Number.isFinite(length)) return;
        if (buffer.length < colon + 1 + length) return;
        const body = buffer.slice(colon + 1, colon + 1 + length);
        buffer = buffer.slice(colon + 1 + length);
        let packet;
        try {
          packet = JSON.parse(body);
        } catch {
          continue;
        }
        if (!greetingSeen) {
          // [1, 1, "WebDriver:NewSession", {}] — the server announces itself first.
          greetingSeen = true;
          clearTimeout(timer);
          resolve({
            send: (name, params = {}) =>
              new Promise((res, rej) => {
                const id = ++nextId;
                const payload = JSON.stringify([0, id, name, params]);
                waiters.set(id, (reply) =>
                  reply[2] ? rej(new Error(`${name}: ${JSON.stringify(reply[2])}`)) : res(reply[3]),
                );
                socket.write(`${payload.length}:${payload}`);
              }),
            close: () => socket.end(),
          });
          continue;
        }
        const waiter = waiters.get(packet[1]);
        if (waiter) {
          waiters.delete(packet[1]);
          waiter(packet);
        }
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}