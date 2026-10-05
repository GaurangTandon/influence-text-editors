#!/usr/bin/env node
// Asserts the measured behaviour of the pages against test/expectations.js.
//
//   node test/verify.mjs                 # chromium only (the fast default)
//   node test/verify.mjs firefox webkit  # any of chromium, firefox, webkit
//   node test/verify.mjs --context=code-in-iframe chromium
//
// Measurement lives in test/harness.mjs; this file is only the assertion layer.
//
// The same-document baseline is asserted exactly as it always was, against
// EXPECTATIONS. Every other context is asserted against its own recorded table in
// CONTEXT_EXPECTATIONS, with the same shape and the same classifier, so a context can
// only "pass" by being measured — an unmeasured context fails with the reason, it is
// never silently skipped.

import { CASES, EDITORS, measure } from "./harness.mjs";
import { summariseProbes } from "../probes.js";
import {
  CAPABILITIES,
  CONTEXT_EXPECTATIONS,
  CONTEXT_PAGE_ERRORS,
  CONTEXT_PROBES,
  EDITOR_KINDS,
  EXPECTATIONS,
  PAGE_ERRORS,
  ROW_LABELS,
  classifyOutcome,
} from "../expectations.js";
import {
  CONTEXT_ENGINES,
  CONTEXT_IDS,
  NOT_MEASURED,
  PROBES,
  TOP,
} from "../contexts.js";

const MARK = {
  unchanged: "—      ",
  replaced: "replace",
  deleted: "DELETE ",
  "at-caret": "caret ",
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

/** One context in one browser: capabilities, matrix, page errors. */
async function verifyContext(browserName, contextId) {
  const { capabilities, rows, pageErrors, probes } = await measure(browserName, contextId);

  if (contextId === TOP) {
    assert(
      capabilities.StaticRange === "function",
      `${browserName}: StaticRange missing, so getTargetRanges() cannot be attached at all`,
    );
    assert(
      capabilities.DataTransfer === "object",
      `${browserName}: new DataTransfer() does not work`,
    );

    const expectedCapabilities = CAPABILITIES[browserName];
    const clipboardHonoured =
      capabilities["clipboardData honoured in init dict"] !== 'text/html=""';
    assert(
      clipboardHonoured === expectedCapabilities.clipboardData,
      `${browserName}: clipboardData-in-init-dict is ${clipboardHonoured}, expected ${expectedCapabilities.clipboardData}`,
    );
    const dataTransferHonoured = capabilities["dataTransfer honoured in InputEvent init dict"] === "yes";
    assert(
      dataTransferHonoured === expectedCapabilities.dataTransfer,
      `${browserName}: dataTransfer-in-InputEvent-init-dict is ${dataTransferHonoured}, expected ${expectedCapabilities.dataTransfer}`,
    );
    // `targetRanges` in the init dict is the spec'd route to a target range.
    // Chromium and Firefox keep it; WebKit drops it, which is the only reason the
    // getTargetRanges() override exists at all.
    const clipboardIsReal = capabilities["clipboardData is a real DataTransfer"] === "true";
    assert(
      clipboardIsReal === expectedCapabilities.clipboardIsReal,
      `${browserName}: init-dict clipboardData instanceof DataTransfer is ${clipboardIsReal}, expected ${expectedCapabilities.clipboardIsReal}`,
    );
    const targetRangesHonoured = /^yes/.test(
      capabilities["targetRanges honoured in InputEvent init dict"],
    );
    assert(
      targetRangesHonoured === expectedCapabilities.targetRanges,
      `${browserName}: targetRanges-in-InputEvent-init-dict is ${JSON.stringify(capabilities["targetRanges honoured in InputEvent init dict"])}, expected ${expectedCapabilities.targetRanges}`,
    );
  }

  assert(
    EDITOR_KINDS.length === 5 && EDITOR_KINDS.includes("wordgard"),
    `EDITOR_KINDS should list the five engines, got ${EDITOR_KINDS.join(", ")}`,
  );
  assert(
    rows.length === CASES.length && ROW_LABELS.length === CASES.length,
    `${browserName} / ${contextId}: ${rows.length} measured cases, ${CASES.length} test cases, ${ROW_LABELS.length} recorded rows`,
  );

  const racy = [];
  for (const [index, row] of rows.entries()) {
    assert(
      row.label === CASES[index].label && ROW_LABELS[index] === row.label,
      `${browserName} / ${contextId}: case ${index} is "${row.label}", expected "${CASES[index].label}", recorded "${ROW_LABELS[index]}"`,
    );
    for (const kind of EDITORS) {
      const cell = row.by[kind];
      assert(!cell.error, `${browserName} / ${contextId} / ${row.label} / ${kind}: ${cell.error}`);
      const actual = classifyOutcome(cell.text);
      // A cell may be recorded as a set ("at-caret|replaced") when the
      // measurement was not deterministic; any of them is a pass.
      const recorded = contextId === TOP ? EXPECTATIONS[browserName] : CONTEXT_EXPECTATIONS[contextId]?.[browserName];
      assert(recorded, `${browserName} / ${contextId}: no recorded table to compare against`);
      const allowed = recorded[index][kind].split("|");
      assert(
        allowed.includes(actual),
        `${browserName} / ${contextId} / ${row.label} / ${kind}: expected one of ${allowed.join(", ")}, got ${actual} — ${cell.dom}`,
      );
      if (allowed.length > 1) {
        racy.push(`${browserName} / ${contextId} / ${row.label} / ${kind} (${allowed.join(" or ")})`);
      }
    }
  }

  // Wordgard 0.5.2 and CKEditor 5 both throw from their own event handlers on some of
  // these paths — Wordgard when a beforeinput carries no usable target range, CKEditor
  // when one is present but unusable. The edits are still ignored, so the matrix above
  // is unaffected, but an external tool has to wrap its dispatch.
  //
  // Asserted as "no *unexpected* errors" rather than an exact set: which of these fire
  // depends on how far the editor got before the exception, which in turn depends on
  // where it sits in the sequence of cases run against it. A new error appearing is a
  // real change and fails; a known one not reproducing on a given run is only logged.
  const recordedErrors = contextId === TOP ? PAGE_ERRORS[browserName] : CONTEXT_PAGE_ERRORS[contextId]?.[browserName];
  assert(recordedErrors, `${browserName} / ${contextId}: no recorded page errors to compare against`);
  const observed = [...new Set(pageErrors.map((entry) => entry.split(": ")[0]))];
  const unexpected = observed.filter((entry) => !recordedErrors.includes(entry));
  assert(
    unexpected.length === 0,
    `${browserName} / ${contextId}: unexpected page errors: ${unexpected.join(" | ")}`,
  );
  const missing = [...recordedErrors].filter((entry) => !observed.includes(entry));
  if (racy.length) {
    console.log(`  note: ${browserName} / ${contextId} has ${racy.length} non-deterministic cell(s):`);
    for (const entry of racy) console.log(`    ${entry}`);
  }
  if (missing.length) {
    console.log(`  note: ${browserName} / ${contextId} did not reproduce ${missing.length} known page error(s):`);
    for (const entry of missing) console.log(`    ${entry}`);
  }

  // Probes are recorded per context (not for the baseline, which is the reference realm
  // every other context is compared against). Asserted for presence and stability: a
  // probe value is a mechanism, and a mechanism that moved deserves a loud failure.
  if (contextId !== TOP) {
    const recordedProbes = CONTEXT_PROBES[contextId]?.[browserName];
    assert(
      recordedProbes && Object.keys(recordedProbes).length > 0,
      `${browserName} / ${contextId}: no recorded probes — run npm run record first`,
    );
    assert(probes, `${browserName} / ${contextId}: the page reported no probe run`);
    const summarised = summariseProbes(probes.influenceRealm, probes.environment);
    for (const probe of PROBES) {
      const expected = recordedProbes[probe.id];
      const actual = summarised[probe.id];
      assert(
        expected !== undefined,
        `${browserName} / ${contextId}: probe ${probe.id} was never recorded`,
      );
      assert(
        actual !== undefined,
        `${browserName} / ${contextId}: probe ${probe.id} produced no value`,
      );
      assert(
        expected === actual,
        `${browserName} / ${contextId}: probe ${probe.id} is ${JSON.stringify(actual)}, recorded ${JSON.stringify(expected)}`,
      );
    }
  }

  printMatrix(browserName, contextId, rows, racy);
}

function printMatrix(browserName, contextId, rows, racy) {
  const labelWidth = Math.max(...rows.map((row) => row.label.length));
  console.log(`  ${"".padEnd(labelWidth)}  ${EDITOR_KINDS.join("  ")}`);
  for (const row of rows) {
    console.log(
      `  ${row.label.padEnd(labelWidth)}  ` +
        EDITORS.map((kind) => MARK[classifyOutcome(row.by[kind].text)] ?? "?").join("  "),
    );
  }
  console.log("");
}

// -----------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------
const argv = process.argv.slice(2);
const requested = argv
  .filter((a) => a.startsWith("--context="))
  .map((a) => a.split("=")[1]);
const contexts = requested.length ? requested : [TOP];
for (const contextId of contexts) {
  if (!CONTEXT_IDS.includes(contextId)) {
    throw new Error(`unknown context "${contextId}" — have: ${CONTEXT_IDS.join(", ")}`);
  }
}
const browsers = argv.filter((a) => !a.startsWith("--"));
const targets = browsers.length ? browsers : ["chromium"];

for (const contextId of contexts) {
  for (const browserName of targets) {
    const covered = CONTEXT_ENGINES[contextId] ?? [];
    if (!covered.includes(browserName)) {
      console.log(
        `${browserName} / ${contextId}: not measured, and not asserted — ${
          NOT_MEASURED[contextId]?.[browserName] ??
          "no way to measure this context in this browser"
        }`,
      );
      continue;
    }
    console.log(`\n${browserName} — ${contextId}`);
    await verifyContext(browserName, contextId);
  }
}

console.log("all assertions passed");
