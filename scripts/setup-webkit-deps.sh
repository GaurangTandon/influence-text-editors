#!/usr/bin/env bash
# Playwright's WebKit build for Linux needs a handful of shared libraries that
# are often absent. The supported fix needs root:
#
#     sudo npx playwright install-deps webkit
#
# Run that first. On Ubuntu 24.04+ it covers everything except libbacktrace,
# which this script then supplies without root: download the .deb, extract it,
# and copy the shared object next to WebKit's own libraries — the directory
# Playwright already puts on LD_LIBRARY_PATH when it launches the browser, so it
# works regardless of what the environment says.
#
# Only libraries that are genuinely unresolvable are fetched, so this is safe to
# re-run after install-deps and will do nothing once the system has them all.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd -P)"
CACHE="${HERE}/../.cache/webkit-libs"
DEBS="${CACHE}/debs"
ROOT="${CACHE}/root"

# soname -> package providing it
LIB_PACKAGES=(
  "libmanette-0.2.so.0:libmanette-0.2-0"
  "libbacktrace.so.0:libbacktrace0"
  "libhidapi-hidraw.so.0:libhidapi-hidraw0"
  "libhidapi-libusb.so.0:libhidapi-libusb0"
  "libusb-1.0.so.0:libusb-1.0-0"
)

WEBKIT_DIR="$(ls -d "${HOME}/.cache/ms-playwright/webkit-"* 2>/dev/null | sort -V | tail -1 || true)"
if [[ -z "${WEBKIT_DIR}" || ! -d "${WEBKIT_DIR}" ]]; then
  echo "No Playwright WebKit build found. Run 'npx playwright install webkit' first." >&2
  exit 1
fi

resolve_system() {
  # Not `ldconfig -p | grep -q`: grep -q exits at the first match, ldconfig dies
  # of SIGPIPE, and under `pipefail` that 141 is reported as "not found".
  local cache
  cache="$(ldconfig -p 2>/dev/null || true)"
  grep -q "$1" <<<"${cache}"
}

MISSING_PACKAGES=()
for entry in "${LIB_PACKAGES[@]}"; do
  soname="${entry%%:*}"
  package="${entry##*:}"
  if resolve_system "${soname}"; then
    echo "  system has ${soname}"
  else
    echo "  MISSING   ${soname}  (${package})"
    MISSING_PACKAGES+=("${package}")
  fi
done

if [[ ${#MISSING_PACKAGES[@]} -eq 0 ]]; then
  echo
  echo "nothing to do — every library resolves from the system."
  exit 0
fi

mkdir -p "${DEBS}" "${ROOT}"
echo
echo "downloading: ${MISSING_PACKAGES[*]}"
(cd "${DEBS}" && apt-get download "${MISSING_PACKAGES[@]}" >/dev/null)

for deb in "${DEBS}"/*.deb; do
  dpkg-deb -x "${deb}" "${ROOT}"
done

LIBDIR="${ROOT}/usr/lib/x86_64-linux-gnu"
if [[ ! -d "${LIBDIR}" ]]; then
  LIBDIR="$(dirname "$(find "${ROOT}" -name 'libmanette*' -o -name 'libbacktrace*' | head -1)")"
fi

# Playwright launches minibrowser-wpe/gtk with their own lib directory on
# LD_LIBRARY_PATH and overrides whatever the caller set, so the libraries have
# to physically live there.
for bundle in minibrowser-wpe/lib minibrowser-gtk/lib; do
  if [[ -d "${WEBKIT_DIR}/${bundle}" ]]; then
    echo "installing into ${WEBKIT_DIR}/${bundle}"
    cp -n "${LIBDIR}"/*.so* "${WEBKIT_DIR}/${bundle}/" 2>/dev/null || true
  fi
done

echo
echo "done. Verify with: npm run test:webkit"