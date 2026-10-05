#!/usr/bin/env node
// Tiny static file server for the example. `npm run serve`, then open the URL
// it prints. A server is needed rather than file:// because index.html loads
// vendor/demo.js as a classic script.
//
// It also exposes one library that must not be bundled, at a fixed path:
//
//   /vendor-libs/ckeditor.js  ->  node_modules/@ckeditor/ckeditor5-build-classic/build/ckeditor.js
//
// Only that single file is reachable; nothing else under node_modules is.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

async function send(response, status, path) {
  try {
    const body = await readFile(path);
    response.writeHead(status, {
      "content-type": MIME[extname(path)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
}

createServer(async (request, response) => {
  const requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname);

  const target = resolve(HERE, `.${normalize(requested)}`);
  if (target !== HERE && !target.startsWith(HERE + sep)) {
    response.writeHead(403).end("forbidden");
    return;
  }
  await send(response, 200, target === HERE ? join(HERE, "index.html") : target);
}).listen(PORT, () => {
  console.log(`serving on http://localhost:${PORT}/`);
});