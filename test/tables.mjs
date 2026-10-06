#!/usr/bin/env node
// Rewrites the "Measured results" tables in README.md from expectations.js, so
// the documentation cannot drift from what was recorded. Run after
// `npm run record`.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CAPABILITIES,
  CONTEXT_EXPECTATIONS,
  CONTEXT_PAGE_ERRORS,
  CONTEXT_PROBES,
  EDITOR_KINDS,
  EXPECTATIONS,
  ROW_LABELS,
} from "../expectations.js";
import { CONTEXT_ENGINES, CONTEXT_LABELS, NOT_MEASURED, PROBES, TOP } from "../contexts.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "README.md");
const BEGIN = "<!-- BEGIN GENERATED TABLES: npm run tables -->";
const END = "<!-- END GENERATED TABLES -->";

const TITLES = {
  prosemirror: "ProseMirror",
  wordgard: "Wordgard",
  quill: "Quill 2",
  codemirror: "CodeMirror 6",
  ckeditor: "CKEditor 5",
  lexical: "Lexical",
};
const VERSIONS = { prosemirror: "1.42.5", wordgard: "0.5.2", quill: "2.0.3", codemirror: "6.43.13", ckeditor: "5.41.4", lexical: "0.52.0" };
const ENGINES = ["chromium", "firefox", "webkit"];
const ENGINE_NAMES = {
  chromium: "Chromium 153",
  firefox: "Firefox 155",
  webkit: "WebKit / Safari 26.6",
};

/** Outcome -> cell text. Kept terse so the tables stay readable. */
const CELL = {
  unchanged: "—",
  replaced: "replace",
  deleted: "**delete**",
  "at-caret": "caret",
};
/** The same, for "what the baseline cell said" in a delta row. */
const CELL_RECORD = CELL;

/** A recorded value may be a "|" separated set, for cells that were measured as
 *  non-deterministic; render those as "at-caret / replace". */
/** Cell text for one recorded outcome set ("a|b" renders as "a / b"). */
const cells = (values) =>
  values
    .split("|")
    .map((value) => CELL[value] ?? value)
    .join(" / ");

/** The baseline's cell. */
const outcome = (browser, row, kind) => cells(EXPECTATIONS[browser][row][kind]);

/** A context's cell, falling back to an explicit marker rather than to the baseline. */
const contextOutcome = (contextId, browser, row, kind) => {
  const value = CONTEXT_EXPECTATIONS[contextId]?.[browser]?.[row]?.[kind];
  return value === undefined ? "**not measured**" : cells(value);
};

const lines = [];
lines.push(BEGIN);
lines.push("");

lines.push("### `targetRanges` support, per engine");
lines.push("");
lines.push(
  "Whether the engine keeps `sequence<StaticRange> targetRanges` from the `InputEventInit` dict:",
);
lines.push("");
lines.push(
  `| probe | ${ENGINES.map((b) => ENGINE_NAMES[b]).join(" | ")} |`,
);
lines.push(`| --- | ${ENGINES.map(() => "---").join(" | ")} |`);
lines.push(
  `| \`targetRanges\` in the \`InputEvent\` init dict | ${ENGINES.map((b) =>
    CAPABILITIES[b].targetRanges ? "**yes**" : "**no**",
  ).join(" | ")} |`,
);
lines.push(
  `| \`dataTransfer\` in the \`InputEvent\` init dict | ${ENGINES.map((b) =>
    CAPABILITIES[b].dataTransfer ? "yes" : "**no**",
  ).join(" | ")} |`,
);
lines.push(
  `| \`clipboardData\` in the \`ClipboardEvent\` init dict | ${ENGINES.map((b) =>
    CAPABILITIES[b].clipboardData ? "yes" : "**no**",
  ).join(" | ")} |`,
);
lines.push("");
lines.push(
  "So `targetRanges` in the init dict is the spec'd route and it works in two of " +
    "the three engines. Shadowing `getTargetRanges()` is what covers WebKit. The " +
    "same shape applies to `dataTransfer`: Chromium and Firefox keep the one from " +
    "the init dict, WebKit drops it — which is why Wordgard's `insertReplacementText` " +
    "throws there and Lexical falls back to `event.data`.",
);
lines.push("");
lines.push(
  "`replace` = the target word was replaced, `delete` = the word was removed and " +
    "nothing inserted, `caret` = the content changed but the target word survived, " +
    "— = nothing changed.",
);

const header = `| strategy | ${EDITOR_KINDS.map((k) => TITLES[k]).join(" | ")} |`;
const rule = `| --- | ${EDITOR_KINDS.map(() => "---").join(" | ")} |`;

for (const browser of ENGINES) {
  lines.push("");
  lines.push(`### ${ENGINE_NAMES[browser]}`);
  lines.push("");
  lines.push(header);
  lines.push(rule);
  for (const [index, label] of ROW_LABELS.entries()) {
    lines.push(
      `| \`${label}\` | ${EDITOR_KINDS.map((kind) => outcome(browser, index, kind)).join(" | ")} |`,
    );
  }
}

// ---------------------------------------------------------------------
// The other contexts: deltas against the same-document baseline
// ---------------------------------------------------------------------
//
// Printing every context's full matrix again would triple the tables for what is, so
// far, mostly the same result. What is worth reading is what *changed* and what
// *could not be measured*, so each context gets a delta table and an explicit note
// about the engines that have no column. The full matrices are on the pages, which
// render from the same recorded file.

for (const contextId of Object.keys(CONTEXT_EXPECTATIONS)) {
  lines.push("");
  lines.push(`### ${CONTEXT_LABELS[contextId]?.label ?? contextId}`);
  lines.push("");
  lines.push(`*${CONTEXT_LABELS[contextId]?.where ?? ""}.*`);
  lines.push("");
  lines.push(CONTEXT_LABELS[contextId]?.claim ?? "");
  lines.push("");

  const engines = CONTEXT_ENGINES[contextId] ?? [];
  const measuredEngines = engines.filter((engine) => CONTEXT_EXPECTATIONS[contextId][engine]);
  const unmeasured = engines.filter((engine) => !CONTEXT_EXPECTATIONS[contextId][engine]);
  if (unmeasured.length) {
    lines.push(
      `Not measured here: ${unmeasured
        .map((engine) => `${ENGINE_NAMES[engine]} (${NOT_MEASURED[contextId]?.[engine] ?? "no way to measure it"})`)
        .join("; ")}. A blank column would look like a measurement, so there is none.`,
    );
    lines.push("");
  }

  const header2 = `| strategy | ${EDITOR_KINDS.map((k) => TITLES[k]).join(" | ")} |`;
  const rule2 = `| --- | ${EDITOR_KINDS.map(() => "---").join(" | ")} |`;

  for (const browser of measuredEngines) {
    const baseline = EXPECTATIONS[browser];
    const here = CONTEXT_EXPECTATIONS[contextId][browser];
    const changed = [];
    const changedCells = [];
    for (const [index, label] of ROW_LABELS.entries()) {
      const cells = EDITOR_KINDS.filter((kind) => here[index][kind] !== baseline[index][kind]);
      if (cells.length) {
        changedCells.push(...cells);
        changed.push(
          `| \`${label}\` | ${EDITOR_KINDS.map((kind) =>
            cells.includes(kind)
              ? `${contextOutcome(contextId, browser, index, kind)} ← ${outcome(browser, index, kind)}`
              : "same",
          ).join(" | ")} |`,
        );
      }
    }
    const total = ROW_LABELS.length * EDITOR_KINDS.length;
    lines.push(`**${ENGINE_NAMES[browser]}** — ${total - changedCells.length} of ${total} cells identical to the same-document baseline.`);
    lines.push("");
    if (changed.length === 0) {
      lines.push("Every cell is identical. Nothing about this context changes the outcome of any strategy.");
      lines.push("");
      continue;
    }
    lines.push(header2);
    lines.push(rule2);
    for (const line of changed) lines.push(line);
    lines.push("");
  }

  // The probes: the mechanism, one line each.
  for (const browser of measuredEngines) {
    const recorded = CONTEXT_PROBES[contextId]?.[browser];
    if (!recorded) continue;
    lines.push(`<details><summary>${ENGINE_NAMES[browser]} — what each realm could see</summary>`);
    lines.push("");
    lines.push("| probe | what was observed |");
    lines.push("| --- | --- |");
    for (const probe of PROBES) {
      lines.push(`| \`${probe.label}\` | ${recorded[probe.id] ?? "not recorded"} |`);
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  const contextErrors = CONTEXT_PAGE_ERRORS[contextId] ?? {};
  const withErrors = measuredEngines.filter((engine) => (contextErrors[engine] ?? []).length);
  if (withErrors.length) {
    lines.push("Editors threw from their own handlers on these paths (the edit is still ignored):");
    lines.push("");
    for (const browser of withErrors) {
      lines.push(`- **${ENGINE_NAMES[browser]}**: ${contextErrors[browser].join("; ")}`);
    }
    lines.push("");
  }
}

lines.push("");
lines.push(
  `Editors: ${EDITOR_KINDS.map((k) => `${TITLES[k]} ${VERSIONS[k]}`).join(", ")}.`,
);
lines.push("");
lines.push(END);

const current = await readFile(FILE, "utf8");
const start = current.indexOf(BEGIN);
const stop = current.indexOf(END);
if (start === -1 || stop === -1) {
  throw new Error("could not find the generated-table markers in README.md");
}
await writeFile(FILE, current.slice(0, start) + lines.join("\n") + current.slice(stop + END.length));
console.log(`rewrote ${ROW_LABELS.length} rows x ${EDITOR_KINDS.length} editors x ${ENGINES.length} engines in README.md`);