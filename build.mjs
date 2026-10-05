#!/usr/bin/env node
// Bundle ProseMirror, Wordgard, Quill and CodeMirror together with the example
// into vendor/demo.js as a plain IIFE exposing a `LingoDemo` global, then assemble
// the deployable page in site/. Run with `npm run build`.
//
// CKEditor 5 is deliberately not bundled: it is ~4 MB and loads its own assets at
// runtime, so its stock build is copied into vendor/ and editors.js fetches it on
// demand, the first time you switch to it.
//
// Two outputs:
//   vendor/  the libraries, for local development — gitignored
//   site/    index.html + page.js + vendor/, the deployable page — gitignored and
//            rebuilt by .github/workflows/pages.yml on every push
//
// Both are build artifacts, so a fresh clone needs `npm install && npm run build`
// before opening index.html.

import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";
import { ZipArchive } from "./tools/xpi.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(HERE, "vendor");
const SITE = join(HERE, "site");

/**
 * CKEditor 5 is not bundled: it is ~4 MB and loads its own assets at runtime, so
 * its stock build is copied in and fetched on demand when you switch to it. That
 * keeps the bundle small and the behaviour identical to the npm package.
 */
const CKEDITOR_BUILD = join(
  HERE,
  "node_modules/@ckeditor/ckeditor5-build-classic/build/ckeditor.js",
);

/**
 * The loadable extension, built into vendor/extension/ and gitignored with the rest.
 *
 * `XPI_NAME` is the archive form, which is what Playwright's Firefox has to be handed:
 * it cannot be given a directory to load, and about:debugging is not reachable for
 * automation.
 */
const EXTENSION_OUT = join(VENDOR, "extension");
const EXTENSION_ID = "influence-text-editors@example.invalid";
const XPI_NAME = `${EXTENSION_ID}.xpi`;

/** Everything the deployable site is made of.
 *
 * All paths inside are relative, so the site works at a domain root or under a project
 * subdirectory — which is also what lets frame.html load the same bundle from inside an
 * iframe and CKEditor's own build resolve from inside that iframe.
 */
const SITE_FILES = [
  "index.html",
  "page.js",
  "iframes.html",
  "iframes-page.js",
  "extension.html",
  "extension-page.js",
  "frame.html",
  "demo-base.css",
];

await mkdir(VENDOR, { recursive: true });
await esbuild.build({
  entryPoints: [join(HERE, "main.js")],
  outdir: VENDOR,
  entryNames: "demo",
  assetNames: "demo",
  globalName: "LingoDemo",
  bundle: true,
  format: "iife",
  target: "chrome116",
  platform: "browser",
  // CSS imported from JS (CodeMirror's theme, Quill's core) is emitted next to
  // the bundle as vendor/demo.css.
  sourcemap: false,
  logLevel: "warning",
});

await copyFile(CKEDITOR_BUILD, join(VENDOR, "ckeditor.js"));

// The loadable extension, in vendor/extension/. Bundled twice from one source file so the
// isolated-world and MAIN-world copies differ in exactly one thing: the value of WORLD.
// Loading it is the only way to measure a real content script's isolated world.
await mkdir(EXTENSION_OUT, { recursive: true });
for (const world of ["isolated", "main"]) {
  await esbuild.build({
    entryPoints: [join(HERE, "extension/content.js")],
    outfile: join(EXTENSION_OUT, `content-${world}.js`),
    bundle: true,
    format: "iife",
    target: "chrome116",
    platform: "browser",
    define: { __LINGO_WORLD__: JSON.stringify(world) },
    sourcemap: false,
    logLevel: "warning",
  });
}
await copyFile(join(HERE, "extension/manifest.json"), join(EXTENSION_OUT, "manifest.json"));
// Firefox's about:debugging loads a directory, but the marionette route test/harness.mjs
// uses to install an extension into Playwright's Firefox wants an archive.
await writeFile(join(EXTENSION_OUT, XPI_NAME), await xpi());

/** The extension's files, as a zip, with the paths an XPI expects. */
async function xpi() {
  const archive = new ZipArchive();
  for (const name of ["manifest.json", "content-isolated.js", "content-main.js"]) {
    archive.add(name, await readFile(join(EXTENSION_OUT, name)));
  }
  return archive.finalize();
}

// The deployable site: the page plus everything it loads. All paths inside are
// relative, so it works at a domain root or under a project subdirectory.
await mkdir(SITE, { recursive: true });
for (const file of SITE_FILES) {
  await copyFile(join(HERE, file), join(SITE, file));
}
await cp(VENDOR, join(SITE, "vendor"), { recursive: true });
// Keep Jekyll from swallowing anything if Pages is serving the branch directly.
await writeFile(join(SITE, ".nojekyll"), "");

console.log("built vendor/demo.js, vendor/demo.css and vendor/ckeditor.js");
console.log(`static site in ${SITE}/ — serve that directory, or use npm run serve`);