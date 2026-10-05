#!/usr/bin/env bash
# Open the demo in WebKit, headed, in its own window.
#
# The WebKit build that ships with Playwright is the only WebKit engine on this
# machine, and it is called MiniBrowser. It is not on your PATH — it lives inside
# the Playwright cache:
#
#   ~/.cache/ms-playwright/webkit-<version>/minibrowser-gtk/bin/MiniBrowser
#
# It cannot be run bare: it links against WebKitGTK symbols that are only
# resolvable with Playwright's own library directory on the loader path. Hence
# this wrapper, which sets the same environment Playwright's pw_run.sh does, plus
# two flags that this machine's GNOME/Wayland session needs before the GTK window
# will map:
#
#   GDK_BACKEND=x11                this session is Wayland; XWayland works, the
#                                   native Wayland path does not
#   WEBKIT_DISABLE_DMABUF_RENDERER=1  no GPU buffer sharing available here
#
# Usage:
#   npm run webkit                 # the demo at http://localhost:8090/
#   npm run webkit -- http://localhost:8080/    # some other URL
#
# To get a JavaScript console in this window use `npm run webkit:console`.

set -euo pipefail

URL="${1:-http://localhost:8090/}"
PORT="${WEBKIT_INSPECTOR_PORT:-9222}"

WEBKIT_DIR="$(ls -d "${HOME}/.cache/ms-playwright/webkit-"* 2>/dev/null | sort -V | tail -1 || true)"
if [[ -z "${WEBKIT_DIR}" || ! -x "${WEBKIT_DIR}/minibrowser-gtk/bin/MiniBrowser" ]]; then
  echo "No Playwright WebKit build found. Run: npx playwright install webkit" >&2
  exit 1
fi

LIB="${WEBKIT_DIR}/minibrowser-gtk/lib"
BROWSER="${WEBKIT_DIR}/minibrowser-gtk/bin/MiniBrowser"

echo "WebKit: ${WEBKIT_DIR}"
echo "Opening ${URL}"
echo "Close the window to quit."

# --automation makes MiniBrowser behave like a scripted browser rather than a
# plain page viewer, which is what we want for this demo. Without Wayland: a GTK
# window on an XWayland display.
exec env -u WAYLAND_DISPLAY \
  DISPLAY="${DISPLAY:-:0}" \
  GDK_BACKEND=x11 \
  WEBKIT_DISABLE_DMABUF_RENDERER=1 \
  WEBKIT_DISABLE_COMPOSITING_MODE=1 \
  WEBKIT_INSPECTOR_SERVER="127.0.0.1:${PORT}" \
  LD_LIBRARY_PATH="${LIB}${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}" \
  WEBKIT_INJECTED_BUNDLE_PATH="${LIB}" \
  WEBKIT_FORCE_COMPLEX_TEXT=1 \
  "${BROWSER}" --automation "${URL}"