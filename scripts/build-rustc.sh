#!/bin/sh
# Build rustc for wasm32-wasip1-threads (with cg_clif and the wasm backend)
# and the wasm32-wasip1-threads standard library, and the native stage1
# compiler that crates/build.py builds the crates with.
#
# Results: vendor/rust/build/wasm32-wasip1-threads/stage2/bin/rustc.wasm,
# vendor/rust/dist/lib/rustlib/wasm32-wasip1-threads, and
# vendor/rust/build/aarch64-apple-darwin/stage1 with the standard library for
# the host, wasm32-wasip1-threads and wasm32-wasip1 (wasm proc macros).
# rustc.wasm is taken from the build directory.
#
# remap-debuginfo builds with cargo's -Ztrim-paths, so the panic locations and
# metadata in rustc.wasm and the libraries name /rustc/1.101.0/... and
# crate-version/... instead of paths on this machine. The stage1 sysroot links
# lib/rustlib/src/rust to this checkout, and rustc would turn /rustc/1.101.0
# back into it wherever std's generic code is instantiated, hence
# -Ztranslate-remapped-path-to-local-path=no.
set -u
cd "$(dirname "$0")/../vendor/rust"
export WASI_SDK_PATH="$(cd ../../tools && pwd)/wasi-sdk-34.0-arm64-macos"
# A target with its own section, in bootstrap.toml or from --target, doesn't
# take rust.rustflags, so each gets the flag; the two x.py runs must agree, or
# the second builds a second stage1 compiler and bootstrap stops on the
# duplicate rustc crates.
flags='["-Ztranslate-remapped-path-to-local-path=no"]'
NO_LOCAL_PATHS="--set rust.remap-debuginfo=true --set rust.rustflags=$flags
  --set target.aarch64-apple-darwin.rustflags=$flags
  --set target.wasm32-wasip1-threads.rustflags=$flags --set target.wasm32-wasip1.rustflags=$flags"
./x.py install $NO_LOCAL_PATHS "$@"
test -f build/wasm32-wasip1-threads/stage2/bin/rustc.wasm || exit 1
# `install` leaves only its own targets in the stage1 sysroot.
./x.py build library --stage 1 --host aarch64-apple-darwin \
  --target aarch64-apple-darwin,wasm32-wasip1,wasm32-wasip1-threads $NO_LOCAL_PATHS
