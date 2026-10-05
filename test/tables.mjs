#!/usr/bin/env node
// Rewrites the "Measured results" tables in README.md from expectations.js, so
// the documentation cannot drift from what was recorded. Run after
// `npm run record`.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CAPABILITIES,
  EDITOR_KINDS,
  EXPECTATIONS,
  ROW_LABELS,
} from "../expectations.js";

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
};
const VERSIONS = { prosemirror: "1.42.5", wordgard: "0.5.2", quill: "2.0.3", codemirror: "6.43.13", ckeditor: "5.41.4" };
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

/** A recorded value may be a "|" separated set, for cells that were measured as
 *  non-deterministic; render those as "at-caret / replace". */
const outcome = (browser, row, kind) =>
  EXPECTATIONS[browser][row][kind]
    .split("|")
    .map((value) => CELL[value] ?? value)
    .join(" / ");

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
    "the three engines. Shadowing `getTargetRanges()` is what covers WebKit.",
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