#!/usr/bin/env node
// Asserts the measured behaviour of index.html against test/expectations.mjs.
//
//   node test/verify.mjs                 # chromium only (the fast default)
//   node test/verify.mjs firefox webkit  # any of chromium, firefox, webkit
//
// Measurement lives in test/harness.mjs; this file is only the assertion layer.

import { CASES, EDITORS, measure } from "./harness.mjs";
import {
  CAPABILITIES,
  EDITOR_KINDS,
  EXPECTATIONS,
  PAGE_ERRORS,
  ROW_LABELS,
  classifyOutcome,
} from "../expectations.js";

const ORIGINAL = "The quick brown fox jumps over the lazy dog.";

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

const browsers = process.argv.slice(2);
const targets = browsers.length ? browsers : ["chromium"];

for (const name of targets) {
  assert(
    EXPECTATIONS[name],
    `no expectations recorded for "${name}" (have: ${Object.keys(EXPECTATIONS)}) — run: npm run record`,
  );

  const { capabilities, rows, pageErrors } = await measure(name);

  assert(
    capabilities.StaticRange === "function",
    `${name}: StaticRange missing, so getTargetRanges() cannot be attached at all`,
  );
  assert(
    capabilities.DataTransfer === "object",
    `${name}: new DataTransfer() does not work`,
  );

  const expectedCapabilities = CAPABILITIES[name];
  const clipboardHonoured =
    capabilities["clipboardData honoured in init dict"] !== 'text/html=""';
  assert(
    clipboardHonoured === expectedCapabilities.clipboardData,
    `${name}: clipboardData-in-init-dict is ${clipboardHonoured}, expected ${expectedCapabilities.clipboardData}`,
  );
  const dataTransferHonoured = capabilities["dataTransfer honoured in InputEvent init dict"] === "yes";
  assert(
    dataTransferHonoured === expectedCapabilities.dataTransfer,
    `${name}: dataTransfer-in-InputEvent-init-dict is ${dataTransferHonoured}, expected ${expectedCapabilities.dataTransfer}`,
  );
  // `targetRanges` in the init dict is the spec'd route to a target range.
  // Chromium and Firefox keep it; WebKit drops it, which is the only reason the
  // getTargetRanges() override exists at all.
  const clipboardIsReal = capabilities["clipboardData is a real DataTransfer"] === "true";
  assert(
    clipboardIsReal === expectedCapabilities.clipboardIsReal,
    `${name}: init-dict clipboardData instanceof DataTransfer is ${clipboardIsReal}, expected ${expectedCapabilities.clipboardIsReal}`,
  );
  const targetRangesHonoured = /^yes/.test(
    capabilities["targetRanges honoured in InputEvent init dict"],
  );
  assert(
    targetRangesHonoured === expectedCapabilities.targetRanges,
    `${name}: targetRanges-in-InputEvent-init-dict is ${JSON.stringify(capabilities["targetRanges honoured in InputEvent init dict"])}, expected ${expectedCapabilities.targetRanges}`,
  );

  const racy = [];
  const expectations = EXPECTATIONS[name];
  assert(expectations, `no expectations recorded for "${name}"`);
  assert(
    EDITOR_KINDS.length === 5 && EDITOR_KINDS.includes("wordgard"),
    `EDITOR_KINDS should list the five engines, got ${EDITOR_KINDS.join(", ")}`,
  );
  assert(
    rows.length === CASES.length && ROW_LABELS.length === CASES.length,
    `${name}: ${rows.length} measured cases, ${CASES.length} test cases, ${ROW_LABELS.length} recorded rows`,
  );

  for (const [index, row] of rows.entries()) {
    assert(
      row.label === CASES[index].label && ROW_LABELS[index] === row.label,
      `${name}: case ${index} is "${row.label}", expected "${CASES[index].label}", recorded "${ROW_LABELS[index]}"`,
    );
    for (const kind of EDITOR_KINDS) {
      const cell = row.by[kind];
      assert(!cell.error, `${name} / ${row.label} / ${kind}: ${cell.error}`);
      const actual = classifyOutcome(cell.text);
      // A cell may be recorded as a set ("at-caret|replaced") when the
      // measurement was not deterministic; any of them is a pass.
      const allowed = expectations[index][kind].split("|");
      assert(
        allowed.includes(actual),
        `${name} / ${row.label} / ${kind}: expected one of ${allowed.join(", ")}, got ${actual} — ${cell.dom}`,
      );
      if (allowed.length > 1) {
        racy.push(`${name} / ${row.label} / ${kind} (${allowed.join(" or ")})`);
      }
    }
  }

  // Wordgard 0.5.2 and CKEditor 5 both throw from their own event handlers on
  // some of these paths — Wordgard when a beforeinput carries no usable target
  // range, CKEditor when one is present but unusable. The edits are still
  // ignored, so the matrix above is unaffected, but an external tool has to
  // wrap its dispatch.
  //
  // Asserted as "no *unexpected* errors" rather than an exact set: which of
  // these fire depends on how far the editor got before the exception, which in
  // turn depends on where it sits in the sequence of cases run against it. A new
  // error appearing is a real change and fails; a known one not reproducing on a
  // given run is only logged.
  const recorded = new Set(PAGE_ERRORS[name]);
  const observed = [...new Set(pageErrors.map((entry) => entry.split(": ")[0]))];
  const unexpected = observed.filter((entry) => !recorded.has(entry));
  assert(
    unexpected.length === 0,
    `${name}: unexpected page errors: ${unexpected.join(" | ")}`,
  );
  const missing = [...recorded].filter((entry) => !observed.includes(entry));
  if (racy.length) {
    console.log(`  note: ${name} has ${racy.length} non-deterministic cell(s):`);
    for (const entry of racy) console.log(`    ${entry}`);
  }
  if (missing.length) {
    console.log(`  note: ${name} did not reproduce ${missing.length} known page error(s):`);
    for (const entry of missing) console.log(`    ${entry}`);
  }

  const labelWidth = Math.max(...rows.map((row) => row.label.length));
  console.log(`  ${"".padEnd(labelWidth)}  ${EDITOR_KINDS.join("  ")}`);
  for (const row of rows) {
    console.log(
      `  ${row.label.padEnd(labelWidth)}  ` +
        EDITOR_KINDS.map((kind) => MARK[classifyOutcome(row.by[kind].text)] ?? "?").join("  "),
    );
  }
  console.log("");
}

console.log("all assertions passed");