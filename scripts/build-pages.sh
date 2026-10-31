#!/bin/sh
# The page, built by build-web.sh, as a static site for a host that cannot
# send the COOP and COEP headers, such as GitHub Pages (web/coi-sw.js adds
# them): into build/pages, with the kernel's files copied in instead of the
# web/wasi-kernel link to ../wasi-kernel.
set -eu
cd "$(dirname "$0")/.."
test -f web/index.html || { echo "build the page first: scripts/build-web.sh" >&2; exit 1; }
rm -rf build/pages
mkdir -p build/pages/wasi-kernel
cp -R web/index.html web/coi-sw.js web/dist web/kernel build/pages/
for f in kernel.js fs.js thread-worker.js LICENSE; do
  cp "web/wasi-kernel/$f" build/pages/wasi-kernel/
done
# Served as they are, without Jekyll.
touch build/pages/.nojekyll
du -sh build/pages
