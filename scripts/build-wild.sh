#!/bin/sh
# Build wild for the host (native testing) and for wasm32-wasip1-threads.
# The wasm build trims paths (-Ztrim-paths) so that wild.wasm doesn't name
# paths on this machine.
set -eu
cd "$(dirname "$0")/../vendor/wild"
W="$(cd ../../tools/wasi-sdk && pwd -P)"
cargo build --release -p wild-linker
CC_wasm32_wasip1_threads="$W/bin/clang" AR_wasm32_wasip1_threads="$W/bin/llvm-ar" \
  CFLAGS_wasm32_wasip1_threads="--sysroot=$W/share/wasi-sysroot" \
  cargo +nightly-2026-10-19 -Ztrim-paths build --release --target wasm32-wasip1-threads -p wild-linker \
  --config 'profile.release.trim-paths="all"'
ls -la target/wasm32-wasip1-threads/release/wild.wasm
