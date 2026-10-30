#!/bin/sh
# Build the page and collect the playground's toolchain into web/dist:
#   ../index.html  the page, and ui/ its interface (frontend/, the Rust
#                  Playground's, built with pnpm and rspack)
#   rustc.wasm.gz  the compiler (vendor/rust, built with scripts/build-rustc.sh)
#   wild.wasm.gz   the linker (vendor/wild, built for wasm32-wasip1-threads)
#   sysroot.bundle the wasm32-wasip1-threads standard library and C runtime
#   toolchain.json which Rust this is, for the page
#   licenses.html  the notices for all of it (scripts/licenses.py)
set -eu
cd "$(dirname "$0")/.."
mkdir -p web/dist
# The interface first: licenses.py lists the npm packages it bundles.
pnpm() { npx --yes pnpm@11 "$@"; }
(cd frontend && pnpm install --frozen-lockfile && pnpm run build:production)
# Without their name sections (debugging names), gzipped: rustc.wasm goes from
# about 120 MB to 20 MB. The kernel worker decompresses them as it downloads.
for m in "${RUSTC_WASM:-vendor/rust/build/wasm32-wasip1-threads/stage2/bin/rustc.wasm}" \
         vendor/wild/target/wasm32-wasip1-threads/release/wild.wasm; do
  name=$(basename "$m")
  tools/wasm-tools strip --all "$m" -o "web/dist/$name.tmp"
  gzip -9 -c "web/dist/$name.tmp" > "web/dist/$name.gz"
  rm "web/dist/$name.tmp"
done
rm -f web/dist/rustc.wasm web/dist/wild.wasm
rm -f web/dist/sysroot.bin.gz web/dist/crates.bin.gz   # the old format
python3 scripts/bundle.py vendor/rust/dist web/dist/sysroot.bundle \
  --exclude 'bin/*' --exclude 'etc/*' --exclude 'share/*' \
  --exclude 'lib/rustlib/[!w]*' --exclude 'lib/rustlib/*/bin/*'
# The nightly the compiler is built from (the build itself says 1.101.0-dev).
nightly=$(sed -n 's/^RUST_NIGHTLY=\([^ ]*\).*/\1/p' scripts/setup.sh)
printf '{ "rust": "%s" }\n' "$nightly" > web/dist/toolchain.json
python3 scripts/licenses.py web/dist/licenses.html
ls -la web/dist
