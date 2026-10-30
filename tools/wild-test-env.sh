# Environment for wild's wasm integration tests: wasi-sdk clang and wasm-ld,
# wasmtime, and wasi-libc in the Debian layout the tests expect.
# Source it from the playground's root: . tools/wild-test-env.sh
export PATH="$PWD/tools/wasi-sdk-34.0-arm64-macos/bin:$PWD/tools:$PATH"
export WASI_SYSROOT="$PWD/tools/wasi-sysroot-shim"
