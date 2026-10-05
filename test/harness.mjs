#!/usr/bin/env node
// Shared harness: drives index.html in a given browser and *measures* what each
// editor does with each strategy. It asserts nothing, so it can also be used to
// discover behaviour in a browser that is not yet in EXPECTATIONS.
//
//   node test/harness.mjs firefox
//
// Prints one row per case per editor plus the browser's capability probe.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, firefox, webkit } from "playwright-core";

import { detectArtifacts } from "../expectations.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

export const EDITORS = ["prosemirror", "wordgard", "quill", "codemirror", "ckeditor"];

export const BROWSERS = { chromium, firefox, webkit };

/** What a paste with no DOM selection produces: inserted at the caret. */
const REPLACEMENT_AT_CARET = "sluggish" + "The quick brown fox jumps over the lazy dog.";

/** What each case presses, and the UI state it needs. */
export const CASES = [
  { label: "beforeinput + getTargetRanges()", button: "#go-beforeinput", ui: { ranges: true, selection: true } },
  { label: "beforeinput, no getTargetRanges()", button: "#go-beforeinput", ui: { ranges: false, selection: true } },
  { label: "beforeinput + range, no DOM selection", button: "#go-beforeinput", ui: { ranges: true, selection: false } },
  { label: "beforeinput (insertText) + getTargetRanges()", button: "#go-beforeinput-text", ui: { ranges: true, selection: true } },
  { label: "beforeinput (insertText), no getTargetRanges()", button: "#go-beforeinput-text", ui: { ranges: false, selection: true } },
  { label: "beforeinput (deleteContentBackward) + getTargetRanges()", button: "#go-delete-input", ui: { ranges: true, selection: true } },
  { label: "beforeinput (deleteContentBackward), no getTargetRanges()", button: "#go-delete-input", ui: { ranges: false, selection: true } },
  { label: "beforeinput (insertText) + targetRanges in init dict", button: "#go-beforeinput-text", ui: { ranges: true, selection: true, supply: "init" } },
  { label: "beforeinput (deleteContentBackward) + targetRanges in init dict", button: "#go-delete-input", ui: { ranges: true, selection: true, supply: "init" } },
  // Isolates *which* mechanism delivered the edit: the target range, or the DOM
  // selection that was set alongside it.
  { label: "beforeinput (insertText), no DOM selection (override)", button: "#go-beforeinput-text", ui: { ranges: true, selection: false, supply: "override" } },
  { label: "beforeinput (insertText), no DOM selection (init dict)", button: "#go-beforeinput-text", ui: { ranges: true, selection: false, supply: "init" } },
  { label: "faked keydown Backspace", button: "#go-keydown", ui: { ranges: true, selection: true } },
  { label: "faked keydown, no DOM selection", button: "#go-keydown", ui: { ranges: true, selection: false } },
  { label: 'execCommand("insertHTML")', button: "#go-exec", ui: { ranges: true, selection: true } },
  { label: "synthetic paste", button: "#go-paste", ui: { ranges: true, selection: true } },
  { label: "synthetic paste, no DOM selection", button: "#go-paste", ui: { ranges: true, selection: false } },
  { label: "synthetic paste, clipboardData shadowed as a proxy object", button: "#go-paste", ui: { ranges: true, selection: true, settle: "task", clipboard: "proxy" } },
  { label: "synthetic paste, clipboardData shadowed as the real DataTransfer", button: "#go-paste", ui: { ranges: true, selection: true, settle: "task", clipboard: "instance" } },
  { label: "synthetic paste, yield one task first", button: "#go-paste-wait", ui: { ranges: true, selection: true, settle: "task" } },
  { label: "synthetic paste, yield one frame first", button: "#go-paste-wait", ui: { ranges: true, selection: true, settle: "frame" } },
  // Both fixes at once: real-DataTransfer shadowing plus a frame yield. This is
  // the only paste row that works everywhere — see finding 3.
  { label: "synthetic paste, real DataTransfer + yield one frame", button: "#go-paste-wait", ui: { ranges: true, selection: true, settle: "frame", clipboard: "instance" } },
];

export function startServer() {
  const server = createServer(async (request, response) => {
    const requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = resolve(ROOT, `.${normalize(requested)}`);
    if (target !== ROOT && !target.startsWith(ROOT + sep)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    // "/" resolves to ROOT itself, which is a directory: serve index.html.
    const path = target === ROOT ? join(ROOT, "index.html") : target;
    try {
      const body = await readFile(path);
      response.writeHead(200, {
        "content-type": MIME[extname(path)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((r) => {
    server.listen(0, "127.0.0.1", () => r(server));
  });
}

/**
 * Run every case against every editor and report what happened.
 *
 * With `repeats` above 1 every case is dispatched several times and the *set* of
 * distinct outcomes is kept. Some cells are genuinely non-deterministic — a paste
 * dispatched after `setTimeout(0)` races the editor's own asynchronous selection
 * sync, and which side wins depends on machine load — and pinning one side of
 * that would make the suite flaky while claiming more than was measured.
 *
 * @returns {{capabilities: object, rows: object[], pageErrors: string[]}}
 */
export async function measure(browserName, { repeats = 1 } = {}) {
  const browserType = BROWSERS[browserName];
  if (!browserType) {
    throw new Error(`unknown browser "${browserName}" (have: ${Object.keys(BROWSERS)})`);
  }
  const server = await startServer();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  let where = "startup";
  page.on("pageerror", (error) => pageErrors.push(`${where}: ${error.message.split("\n")[0]}`));

  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.LingoDemo));

  // What this engine can even build. Firefox, for one, does not accept
  // clipboardData in the ClipboardEvent init dict, which is what makes the
  // synthetic paste below inert there.
  const capabilities = await page.evaluate(() => {
    const probe = (fn) => {
      try {
        return fn();
      } catch (error) {
        return `threw: ${error.message}`;
      }
    };
    const withData = new DataTransfer();
    withData.setData("text/plain", "x");
    withData.setData("text/html", "<em>x</em>");
    const event = new ClipboardEvent("paste", { clipboardData: withData, cancelable: true });
    const input = new InputEvent("beforeinput", { inputType: "insertText", data: "x", cancelable: true });
    return {
      userAgent: navigator.userAgent,
      StaticRange: typeof StaticRange,
      InputEvent: typeof InputEvent,
      DataTransfer: probe(() => typeof new DataTransfer()),
      clipboardEventConstructor: probe(() => typeof new ClipboardEvent),
      "clipboardData honoured in init dict": probe(() => {
        const data = event.clipboardData;
        return data ? `text/html=${JSON.stringify(data.getData("text/html"))}` : String(data);
      }),
      "clipboardData is a real DataTransfer": probe(() =>
        String(event.clipboardData instanceof DataTransfer),
      ),
      "dataTransfer honoured in InputEvent init dict": probe(() => {
        const data = input.dataTransfer;
        return data ? "yes" : String(data);
      }),
      // targetRanges is in the spec's InputEventInit; see TARGET_RANGE_SUPPLY.
      "targetRanges honoured in InputEvent init dict": probe(() => {
        const node = document.createElement("div");
        node.textContent = "abcdef";
        const sr = new StaticRange({
          startContainer: node.firstChild, startOffset: 1,
          endContainer: node.firstChild, endOffset: 3,
        });
        const built = new InputEvent("beforeinput", {
          inputType: "insertText", data: "x", targetRanges: [sr],
        });
        const got = built.getTargetRanges();
        if (got.length !== 1) return `no (${got.length} ranges)`;
        const kept = got[0].startOffset === 1 && got[0].endOffset === 3;
        return kept ? `yes${got[0] === sr ? "" : " (copied)"}` : "no (wrong offsets)";
      }),
      "queryCommandSupported('insertHTML')": probe(() =>
        String(document.queryCommandSupported?.("insertHTML")),
      ),
      execCommand: probe(() => typeof document.execCommand),
    };
  });

  async function run(kind, testCase) {
    where = `run ${kind} / ${testCase.label}`;
    await page.locator("#switcher button").nth(EDITORS.indexOf(kind)).click();
    await page.waitForFunction(
      (k) => document.querySelector("#host")?.dataset.mounted === k,
      kind,
      { timeout: 30000 },
    );
    await page.locator("#ranges").setChecked(testCase.ui.ranges);
    await page.locator("#selection").setChecked(testCase.ui.selection);
    await page.locator("#supply").selectOption(testCase.ui.supply ?? "override");
    await page.locator("#settle").selectOption(String(testCase.ui.settle ?? "none"));
    await page.locator("#clipboard").selectOption(testCase.ui.clipboard ?? "init");
    await page.locator(testCase.button).click();
    await page.locator("#outcome .verdict").waitFor({ timeout: 20000 });
    const text = (await page.locator("#text-after").textContent()).trim();
    return {
      edited: (await page.locator("#outcome .verdict").getAttribute("class")).includes("ok"),
      text,
      // Raw text, before the classifier normalises whitespace, so artifacts can
      // still be seen: NBSP is a real change to the document.
      artifacts: detectArtifacts(text),
      dom: (await page.locator("#dom-after").textContent()),
    };
  }

  const rows = [];
  for (const testCase of CASES) {
    const row = { label: testCase.label, by: {} };
    for (const kind of EDITORS) {
      try {
        const runs = [];
        for (let attempt = 0; attempt < Math.max(1, repeats); attempt++) {
          runs.push(await run(kind, testCase));
        }
        // First run carries the detail used in assertion messages.
        row.by[kind] = { ...runs[0], outcomes: [...new Set(runs.map((r) => r.text))] };
      } catch (error) {
        row.by[kind] = { error: error.message.split("\n")[0] };
      }
    }
    rows.push(row);
  }

  await browser.close();
  server.close();
  return { browser: browserName, capabilities, rows, pageErrors };
}

// ---------------------------------------------------------------------
// CLI: measure one browser and print the matrix
// ---------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const name = process.argv[2] ?? "chromium";
  const result = await measure(name);
  console.log(`\n=== ${name}`);
  for (const [key, value] of Object.entries(result.capabilities)) {
    if (key === "userAgent") continue;
    console.log(`  ${key}: ${value}`);
  }
  console.log(`  userAgent: ${result.capabilities.userAgent}\n`);
  // Classify the resulting text so a bare "edit" cannot hide a wrong outcome:
  // deleting the target word also counts as a change.
  const ORIGINAL = "The quick brown fox jumps over the lazy dog.";
  const REPLACED = "The sluggish brown fox jumps over the lazy dog.";
  const DELETED = "The  brown fox jumps over the lazy dog.";
  const classify = (text) => {
    const flat = text.replace(/\u00a0/g, " ");
    if (flat === ORIGINAL) return "none ";
    if (flat === REPLACED) return "EDIT  ";
    if (flat === DELETED) return "DEL  ";
    if (flat === REPLACEMENT_AT_CARET) return "caret";
    if (flat.includes("sluggish") && flat.includes("quick")) return "OTHER";
    return "EDIT? ";
  };
  const labelWidth = Math.max(...result.rows.map((r) => r.label.length));
  console.log(`  ${"".padEnd(labelWidth)}  ${EDITORS.join("  ")}`);
  for (const row of result.rows) {
    console.log(
      `  ${row.label.padEnd(labelWidth)}  ` +
        EDITORS.map((kind) => {
          const cell = row.by[kind];
          return cell.error ? "ERROR" : classify(cell.text);
        }).join("  "),
    );
    for (const kind of EDITORS) {
      const cell = row.by[kind];
      if (!cell.error && cell.text && !["none "].includes(classify(cell.text))) {
        const verdict = classify(cell.text);
        if (verdict === "DEL  " || verdict === "caret" || verdict === "OTHER" || verdict === "EDIT? ") {
          console.log(`        ${kind.padEnd(12)} ${JSON.stringify(cell.text.replace(/\u00a0/g, " "))}`);
        }
      }
    }
  }
  if (result.pageErrors.length) {
    console.log("\n  page errors:");
    for (const error of result.pageErrors) {
      console.log(`    ${error}`);
    }
  }
  console.log("");
}