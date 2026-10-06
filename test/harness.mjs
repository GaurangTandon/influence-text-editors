#!/usr/bin/env node
// Measures this project's pages in real browsers.
//
//   node test/harness.mjs                              # the matrix, in this browser
//   node test/harness.mjs --context code-in-iframe     # in a different realm
//
// Measurement only. test/verify.mjs asserts what this produces against expectations.js,
// and test/record.mjs writes expectations.js from it.

import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, firefox, webkit } from "playwright-core";

import { CONTEXT_ENGINES, CONTEXT_LABELS, CONTEXT_IDS, TOP } from "../contexts.js";
import { detectArtifacts, EDITOR_ENGINES } from "../expectations.js";
import { CASES } from "../cases.js";
import { installTemporaryAddon } from "../tools/marionette.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const EXTENSION = join(ROOT, "vendor/extension");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

export const EDITORS = ["prosemirror", "wordgard", "quill", "codemirror", "ckeditor", "lexical", "editcontext"];

const ALL_ENGINES = ["chromium", "firefox", "webkit"];

/** The editors this browser can actually mount, in switcher order. */
export function editorsFor(browserName) {
  return EDITORS.filter((kind) => (EDITOR_ENGINES[kind] ?? ALL_ENGINES).includes(browserName));
}

export const BROWSERS = { chromium, firefox, webkit };

/** What a paste with no DOM selection produces: inserted at the caret. */
const REPLACEMENT_AT_CARET = "sluggish" + "The quick brown fox jumps over the lazy dog.";

// The measured cases live in ../cases.js, next to the buttons the pages build from
// them: a row of the matrix cannot exist without a button that produces it.
export { CASES };

/**
 * Which page carries which context.
 *
 * Split because the contexts have different prerequisites: the iframe ones need nothing
 * but the site, and the extension ones need an extension installed to be meaningful.
 */
export const CONTEXT_PAGES = {
  [TOP]: "index.html",
  "editor-in-iframe": "iframes.html",
  "code-in-iframe": "iframes.html",
  "extension-isolated": "extension.html",
  "extension-main": "extension.html",
  "extension-isolated-in-iframe": "extension.html",
};

/** Contexts whose strategy runs as an extension content script. */
export const isExtensionContext = (contextId) => contextId.startsWith("extension-");

/** Static file server for the site. */
export async function startServer() {
  const server = createServer(async (request, response) => {
    const requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = resolve(ROOT, `.${normalize(requested)}`);
    if (target !== ROOT && !target.startsWith(ROOT + sep)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    let file = target;
    try {
      if ((await stat(target)).isDirectory()) file = join(target, "index.html");
    } catch {
      // Not a directory: fall through and try to read it as a file.
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, {
        "content-type": MIME[extname(file)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain" }).end("not found");
    }
  });
  // No host, so the socket is dual-stack: the cross-origin probe reaches this server
  // through `localhost` (a different origin from 127.0.0.1) whichever address that
  // name resolves to.
  await new Promise((r) => server.listen(0, r));
  return server;
}

/**
 * Launch a browser, with this project's extension loaded when one is needed.
 *
 * Chromium takes `--load-extension`, which needs the full browser rather than
 * chrome-headless-shell (headless shell cannot load extensions at all) and needs
 * `--headless=new` to get there headlessly. Firefox has to be handed the extension over
 * the marionette protocol instead — see tools/marionette.mjs for why.
 */
export async function launchBrowser(name, { extension = false } = {}) {
  if (!extension) {
    const browser = await BROWSERS[name].launch({ headless: true });
    return { browser, close: () => browser.close() };
  }
  if (name === "chromium") {
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "lingo-chromium-")), {
      // Extensions cannot be loaded by chrome-headless-shell, which is what headless
      // uses by default; --headless=new plus the full binary is the combination that works.
      headless: false,
      executablePath: chromium.executablePath(),
      args: [
        "--headless=new",
        `--disable-extensions-except=${EXTENSION}`,
        `--load-extension=${EXTENSION}`,
      ],
    });
    return { browser: context, close: () => context.close() };
  }
  if (name === "firefox") {
    // Playwright's Firefox build only ever opens marionette on 2828 — any other
    // --marionette-port is ignored — so the extension has to be installed on that one.
    const port = 2828;
    const context = await firefox.launchPersistentContext(mkdtempSync(join(tmpdir(), "lingo-firefox-")), {
      headless: true,
      args: ["-marionette", "--marionette-port", String(port)],
    });
    const manifest = JSON.parse(await readFile(join(ROOT, "extension/manifest.json"), "utf8"));
    const addonId = manifest.browser_specific_settings.gecko.id;
    await installTemporaryAddon({ port, xpiPath: join(EXTENSION, `${addonId}.xpi`) });
    return { browser: context, close: () => context.close() };
  }
  throw new Error(`no way to load an extension into ${name}`);
}

/**
 * Run every case against every editor in one browser, in one context.
 *
 * @param {string} browserName
 * @param {string} contextId one of CONTEXT_IDS
 */
export async function measure(browserName, contextId = TOP) {
  const extension = isExtensionContext(contextId);
  if (extension && !(CONTEXT_ENGINES[contextId] ?? []).includes(browserName)) {
    throw new Error(`${browserName} cannot measure ${contextId}`);
  }
  const { browser, close } = await launchBrowser(browserName, { extension });
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const rows = [];
  const pageErrors = [];
  // A closure, because the page-error handler is registered before the loop that knows
  // which editor and case is running.
  const whereRef = { value: `${contextId} / load` };
  let capabilities = null;
  let probes = null;
  try {
    const page = await browser.newPage();
    // Prefixed with where it happened, and test/verify.mjs compares only that prefix —
    // an editor that throws in its own handler says so differently in each engine, and
    // the prefix is what says *whether* it threw at all.
    page.on("pageerror", (error) => {
      const frame = String(error.stack ?? "").split("\n")[1]?.trim() ?? "";
      pageErrors.push(`${whereRef.value}: ${error.message.split("\n")[0]}${frame ? ` — ${frame}` : ""}`);
    });

    await page.goto(`${base}/${CONTEXT_PAGES[contextId]}`);
    await page.waitForFunction(() => Boolean(window.LingoDemo));
    await page.waitForFunction(() => Boolean(document.querySelector("#host")?.dataset.mounted));
    if (contextId !== TOP) {
      // Every context switch tears the old editor down and mounts a fresh one, so the
      // mount counter is what tells us the new context is ready.
      const before = await mountCount(page);
      await page.locator("#context").selectOption(contextId);
      await waitForMount(page, before);
    }

    if (contextId === TOP) {
      capabilities = await page.evaluate(() => window.LingoDemo.probeCapabilities());
    }

    // Case-major, editor-minor, because remounting is what makes a case independent of
    // the one before it: clicking an editor's switcher button tears that editor down and
    // builds it again, so every (case, editor) pair starts from the same text. That
    // ordering is also what the recorded baseline was measured with. Editors an engine
    // cannot run are skipped — but the switcher index stays the full-list one, because
    // the page builds its buttons from the complete EDITORS list.
    for (const testCase of CASES) {
      const row = { label: testCase.label, by: {} };
      for (const [editorIndex, kind] of EDITORS.entries()) {
        if (!editorsFor(browserName).includes(kind)) continue;
        whereRef.value = `run ${kind} / ${testCase.label}`;
        const mount = await mountCount(page);
        await page.locator("#switcher button").nth(editorIndex).click();
        await waitForMount(page, mount);
        await setUi(page, testCase.ui);
        await page.locator(`#${testCase.button}`).click();
        await page.locator("#outcome .verdict").waitFor({ timeout: 20000 });
        const verdict = await page.locator("#outcome .verdict").textContent();
        if (verdict.startsWith("UNEXPECTED")) {
          throw new Error(`${browserName} / ${contextId} / ${kind} / ${testCase.label}: ${verdict}`);
        }
        const text = (await page.locator("#text-after").textContent()).trim();
        row.by[kind] = {
          text,
          outcomes: [text],
          // Raw text before the classifier normalises whitespace, so artifacts stay
          // visible: an NBSP is a real change to the document.
          artifacts: detectArtifacts(text),
          dom: await page.locator("#dom-after").textContent(),
        };
      }
      rows.push(row);
    }

    if (contextId !== TOP) {
      probes = await measureProbes(page, browserName, contextId, (where) => {
        whereRef.value = where;
      });
    }
  } finally {
    await close();
    server.close();
  }

  return { capabilities, rows, pageErrors, probes };
}

/**
 * Run only the probes for one context, skipping the 21 x 5 matrix.
 *
 * The probe *summary* is part of the recorded file, so a change to how probes are
 * described would otherwise force a full re-measure of every context — hours of
 * browser time to re-learn facts that did not change.
 */
export async function measureProbesOnly(browserName, contextId) {
  const extension = isExtensionContext(contextId);
  if (extension && !(CONTEXT_ENGINES[contextId] ?? []).includes(browserName)) {
    throw new Error(`${browserName} cannot measure ${contextId}`);
  }
  const { browser, close } = await launchBrowser(browserName, { extension });
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const pageErrors = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => {
      pageErrors.push(`${contextId} / probes: ${error.message.split("\n")[0]}`);
    });
    await page.goto(`${base}/${CONTEXT_PAGES[contextId]}`);
    await page.waitForFunction(() => Boolean(window.LingoDemo));
    await page.waitForFunction(() => Boolean(document.querySelector("#host")?.dataset.mounted));
    if (contextId !== TOP) {
      const before = await mountCount(page);
      await page.locator("#context").selectOption(contextId);
      await waitForMount(page, before);
    }
    const probes = await measureProbes(page, browserName, contextId, () => {});
    return { pageErrors, probes };
  } finally {
    await close();
    server.close();
  }
}

/** Ask the page's probe button to run, and read what each realm could see. */
async function measureProbes(page, browserName, contextId, setWhere) {
  setWhere(`${contextId} / probes`);
  await page.locator("#run-probes").click();
  await page.waitForFunction(() => !document.getElementById("probe-output").hidden, null, {
    timeout: 60000,
  });
  const status = await page.locator("#probe-status").textContent();
  if (!/done/.test(status)) {
    throw new Error(`${browserName} / ${contextId}: probes did not run — ${status}`);
  }
  const raw = JSON.parse(await page.locator("#probe-output").textContent());
  return raw;
}

async function mountCount(page) {
  return Number((await page.locator("#host").getAttribute("data-mount-count")) ?? 0);
}

async function waitForMount(page, after) {
  await page.waitForFunction(
    (count) => Number(document.querySelector("#host")?.dataset.mountCount ?? 0) > count,
    after,
    { timeout: 60000 },
  );
}

/**
 * Put the page's controls into exactly the state this case needs.
 *
 * Every control is set every time, including back to its default: a select left holding
 * the previous case's value would change what the next case measures, which is how a
 * matrix can drift without any code changing.
 */
async function setUi(page, ui) {
  await page.locator("#ranges").setChecked(Boolean(ui.ranges));
  await page.locator("#selection").setChecked(Boolean(ui.selection));
  await page.locator("#supply").selectOption(String(ui.supply ?? "override"));
  await page.locator("#settle").selectOption(String(ui.settle ?? "none"));
  await page.locator("#clipboard").selectOption(String(ui.clipboard ?? "init"));
}

// -----------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
    const argv = process.argv.slice(2);
  const contextFlag = argv.find((a) => a.startsWith("--context="));
  const contextId = contextFlag ? contextFlag.split("=")[1] : TOP;
  if (!CONTEXT_IDS.includes(contextId)) {
    throw new Error(`unknown context "${contextId}" — have: ${CONTEXT_IDS.join(", ")}`);
  }
  const engines = argv.filter((a) => !a.startsWith("--"));
  const targets = engines.length ? engines : ["chromium"];

  for (const name of targets) {
    const { rows, capabilities, pageErrors, probes } = await measure(name, contextId);
    const original = "The quick brown fox jumps over the lazy dog.";

    if (capabilities) {
      console.log("\nengine capabilities");
      for (const [label, value] of Object.entries(capabilities)) {
        console.log(`  ${String(label).padEnd(42)} ${value}`);
      }
    }

    const labelWidth = Math.max(...rows.map((row) => row.label.length));
    const measurable = editorsFor(name);
    console.log(`\n${name} — ${CONTEXT_LABELS[contextId]?.label ?? contextId}`);
    console.log(`  ${"".padEnd(labelWidth)}  ${measurable.join("  ")}`);
    const mark = (text) => {
      const flat = String(text).replace(/ /g, " ").trim();
      if (flat === original) return "—      ";
      if (flat === "The sluggish brown fox jumps over the lazy dog.") return "replace";
      if (flat === "The  brown fox jumps over the lazy dog.") return "DELETE ";
      if (flat === REPLACEMENT_AT_CARET) return "caret ";
      return "?      ";
    };
    for (const row of rows) {
      console.log(
        `  ${row.label.padEnd(labelWidth)}  ` +
          measurable.map((kind) => mark(row.by[kind].text)).join("  "),
      );
    }

    if (probes) {
      console.log("\nprobes (what each realm could see)");
      for (const [label, value] of Object.entries(probes.influenceRealm ?? {})) {
        console.log(`  ${label.padEnd(28)} ${value}`);
      }
      for (const [label, value] of Object.entries(probes.environment ?? {})) {
        console.log(`  ${label.padEnd(28)} ${value}`);
      }
    }

    const errors = [...new Set(pageErrors)];
    console.log(`\npage errors: ${errors.length ? errors.join(", ") : "none"}`);
  }}
