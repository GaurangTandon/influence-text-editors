#!/usr/bin/env node
// A WebKit window plus a JavaScript console for the page inside it.
//
// There is no WebKit browser on Linux that ships a DevTools UI, and this
// machine's Playwright WebKit build exposes an inspector socket that does not
// speak the DevTools protocol in a way a browser can attach to (see the note
// printed below). So the console is terminal-hosted: type an expression, it is
// evaluated in the live page, and anything the page logs is mirrored here.
//
//   npm run webkit:console                 # the demo
//   npm run webkit:console http://…        # some other URL
//
// Commands:
//   <expression>   evaluate in the page and print the result
//   .text          print the editor's current text content
//   .html         print the editor's current innerHTML
//   .switch NAME  switch editor: prosemirror | wordgard | quill | codemirror | ckeditor
//   .settle NAME  set the yield control: none | task | frame | 16 | 150
//   .press ID     click a button by id, e.g. .press go-beforeinput-text
//   .reload       reload the page
//   .help         this list
//   .exit         close the window and quit

import { createInterface } from "node:readline";
import { webkit } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:8090/";

const browser = await webkit.launch({
  headless: false,
  env: {
    ...process.env,
    GDK_BACKEND: "x11",
    WEBKIT_DISABLE_DMABUF_RENDERER: "1",
    WEBKIT_DISABLE_COMPOSITING_MODE: "1",
  },
});

const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const send = (line) => process.stdout.write(`${line}\n`);

page.on("console", (message) => {
  const text = message.text();
  // Console noise from the page's own helpers is not interesting here.
  if (text.includes("[probe]")) return;
  send(`  [page:${message.type()}] ${text}`);
});
page.on("pageerror", (error) => send(`  [page:error] ${error.message}`));

await page.goto(url, { waitUntil: "domcontentloaded" });

send(`\nWebKit is open on ${url}`);
send("Note: WebKitGTK's inspector socket (WEBKIT_INSPECTOR_SERVER) does not accept");
send("a DevTools-protocol connection on this build, so Chrome's chrome://inspect");
send("cannot attach. This prompt is the console instead. Type .help for commands.\n");

const rl = createInterface({ input: process.stdin, prompt: "page> " });
rl.prompt();

// Lines are handled strictly one at a time. The handlers await the browser, and
// piping several commands in would otherwise let readline deliver them all — and
// then close the browser — before the first one had finished.
let pending = Promise.resolve();
let finished = false;

function enqueue(work) {
  pending = pending.then(work).catch((error) => {
    send(`  error: ${error.message.split("\n")[0]}`);
  });
}

rl.on("line", (line) => {
  enqueue(() => handle(line.trim()));
});

async function handle(input) {
  const fail = (message) => send(`  ${message}`);

  try {
    if (!input) {
      /* just re-prompt */
    } else if (input === ".exit") {
      finished = true;
      rl.close();
      await browser.close();
      return;
    } else if (input === ".help") {
      send(
        [
          "  <expression>   evaluate in the page and print the result",
          "  .text          print the editor's current text content",
          "  .html          print the editor's current innerHTML",
          "  .switch NAME   prosemirror | wordgard | quill | codemirror | ckeditor",
          "  .settle NAME   none | task | frame | 16 | 150",
          "  .press ID      click a button, e.g. .press go-beforeinput-text",
          "  .reload        reload the page",
          "  .help / .exit",
        ].join("\n"),
      );
    } else if (input === ".reload") {
      await page.reload({ waitUntil: "domcontentloaded" });
      send("  reloaded");
    } else if (input === ".text") {
      send(
        `  ${await page.evaluate(() => window.LingoDemo.mountEditor && document.querySelector("[data-demo-editor]")?.textContent)}`,
      );
    } else if (input === ".html") {
      send(
        `  ${await page.evaluate(() => document.querySelector("[data-demo-editor]")?.innerHTML)}`,
      );
    } else if (input.startsWith(".switch")) {
      const name = input.split(/\s+/)[1];
      const index = await page.evaluate((wanted) => {
        const kinds = [...document.querySelectorAll("#switcher button")];
        const at = kinds.findIndex((button) =>
          button.textContent.toLowerCase().includes(wanted.toLowerCase()),
        );
        if (at === -1) return null;
        kinds[at].click();
        return at;
      }, name ?? "");
      if (index === null) {
        fail(`unknown editor "${name}"`);
      } else {
        await page.waitForFunction(
          () => Boolean(document.querySelector("#host")?.dataset.mounted),
          null,
          { timeout: 20000 },
        );
        send(`  switched to ${await page.evaluate(() => document.querySelector("#host").dataset.mounted)}`);
      }
    } else if (input.startsWith(".settle")) {
      const value = input.split(/\s+/)[1] ?? "none";
      await page.selectOption("#settle", value);
      send(`  settle = ${await page.evaluate(() => document.querySelector("#settle").value)}`);
    } else if (input.startsWith(".press")) {
      const id = input.split(/\s+/)[1];
      if (!id) fail("usage: .press <button-id>");
      else {
        await page.click(`#${id}`);
        await page
          .waitForSelector("#outcome .verdict", { timeout: 20000 })
          .catch(() => {});
        send(`  ${await page.evaluate(() => document.querySelector("#outcome .verdict")?.textContent ?? "(no verdict)")}`);
      }
    } else {
      // Anything else is evaluated in the page.
      const result = await page.evaluate((expression) => {
        // eslint-disable-next-line no-eval
        const value = eval(expression);
        if (value && typeof value.then === "function") return `Promise { ${String(value)} }`;
        return typeof value === "string" ? value : JSON.stringify(value, null, 2);
      }, input);
      send(`  ${result}`);
    }
  } catch (error) {
    fail(`error: ${error.message.split("\n")[0]}`);
  }
  if (!finished) {
    rl.prompt();
  }
}

rl.on("close", async () => {
  finished = true;
  await pending.catch(() => {});
  await browser.close().catch(() => {});
  process.exit(0);
});