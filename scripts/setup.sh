#!/bin/sh
# Fetch the third-party sources at the pinned commits, apply our patches, and
# download the tools. Safe to rerun: existing checkouts are left alone.
#
# Layout afterwards:
#   vendor/rust     rust-lang/rust + patches/rust      (the compiler, for wasm)
#   vendor/cg_clif  rustc_codegen_cranelift + patches   (for native testing)
#   vendor/wild     wild-linker/wild                    (the linker)
#   tools/          wasi-sdk; wasm-tools (build-web.sh); wabt's wat2wasm (wild's
#                   wasm tests)
#
# The wasm backend itself is ../clif_to_wasm, which the
# compiler's cg_clif depends on by path.
set -eu
cd "$(dirname "$0")/.."
ROOT=$(pwd)

RUST_NIGHTLY=nightly-2026-10-19   # the nightly built from RUST_COMMIT (the page shows it)
RUST_COMMIT=b6eeb93c992027a03e1fd120b6652546396b142c
CG_CLIF_COMMIT=4f78fd3e5f2ce8a688865b4a6197e6d33211c09c
WILD_COMMIT=1f1538211df2d9b0a45bfc63ef3160672b00091e
WASI_SDK=wasi-sdk-34.0-arm64-macos
WASI_SDK_URL=https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-34/$WASI_SDK.tar.gz
WASM_TOOLS_URL=https://github.com/bytecodealliance/wasm-tools/releases/download/v1.262.0/wasm-tools-1.262.0-aarch64-macos.tar.gz
WABT_URL=https://github.com/WebAssembly/wabt/releases/download/1.0.42/wabt-1.0.42-macos-arm64.tar.gz

mkdir -p vendor tools

checkout() { # dir url commit patches branch
  if [ -d "$1" ]; then
    echo "$1 exists, leaving it alone"
    return
  fi
  git init -q "$1"
  git -C "$1" fetch -q --depth 1 "$2" "$3"
  git -C "$1" checkout -q -b "$5" FETCH_HEAD
  if ls "$4"/*.patch >/dev/null 2>&1; then
    git -C "$1" -c user.name=playground -c user.email=playground@localhost am -q "$ROOT/$4"/*.patch
  fi
}

checkout vendor/rust https://github.com/rust-lang/rust $RUST_COMMIT patches/rust wasm-playground
checkout vendor/cg_clif https://github.com/rust-lang/rustc_codegen_cranelift $CG_CLIF_COMMIT patches/cg_clif wasm-backend
checkout vendor/wild https://github.com/wild-linker/wild $WILD_COMMIT patches/wild main

# bootstrap.toml names the wasi-sdk by absolute path.
sed -i.bak "s|/[^\"]*/$WASI_SDK|$ROOT/tools/$WASI_SDK|g" vendor/rust/bootstrap.toml && rm vendor/rust/bootstrap.toml.bak

if [ ! -d tools/$WASI_SDK ]; then
  curl -sL "$WASI_SDK_URL" | tar xz -C tools
fi

# A single binary from a release archive: tool url path-in-archive.
fetch_tool() {
  if [ ! -x "tools/$1" ]; then
    tmp=$(mktemp -d)
    curl -sL "$2" | tar xz -C "$tmp"
    cp "$tmp"/$3 "tools/$1"
    rm -rf "$tmp"
  fi
}
fetch_tool wasm-tools "$WASM_TOOLS_URL" '*/wasm-tools'
fetch_tool wat2wasm "$WABT_URL" '*/bin/wat2wasm'

rustup toolchain install nightly-2026-10-19 --profile minimal \
  --component rust-src,rustc-dev,llvm-tools --target wasm32-wasip1-threads
echo "Done. Next: scripts/build-rustc.sh, scripts/build-wild.sh, scripts/build-web.sh"
