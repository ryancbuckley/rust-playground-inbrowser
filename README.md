# Rust in the Browser

A Rust playground that compiles and runs Rust code directly in the browser, with
no backend server:
https://ryancbuckley.github.io/rust-playground-inbrowser-site

## Toolchain

```
main.rs ──rustc.wasm──▶ CLIF ──clif-to-wasm──▶ wasm objects ──wild.wasm──▶ main.wasm ──▶ run
          (cg_clif)                              + LLVM-built std
```

Every step of the compilation pipeline is compiled to WebAssembly and runs
inside the browser on a small WASI kernel:

- **`rustc.wasm`**: `rustc` compiled to `wasm32-wasip1-threads`, based on
  bjorn3's patches for compiling `rustc` to WebAssembly (`patches/rust`, rebased
  onto `nightly-2026-10-19`). It links in `rustc_codegen_cranelift` (`cg_clif`),
  Clippy, and `rustfmt` statically so they share a single binary.
- **`cg_clif` + [`clif-to-wasm`](https://crates.io/crates/clif-to-wasm)**:
  instead of LLVM, `rustc` uses `rustc_codegen_cranelift` to lower Rust to
  Cranelift IR (CLIF), and `clif-to-wasm` compiles that CLIF into relocatable
  `.o` wasm object files. Those object files follow LLVM's WebAssembly C ABI, so
  they link cleanly against a prebuilt Rust standard library compiled by LLVM.
- **`wild.wasm`**: the [Wild](https://github.com/wild-linker/wild) linker,
  compiled to WebAssembly. Because WASI has no `fork`/`exec`, `rustc` invokes
  the linker through a host import (`playground.spawn`).
- **WASI kernel ([`browser-kernel`](https://github.com/ryancbuckley/browser-kernel), linked as `web/browser-kernel`)**:
  a browser WASI preview1 + `wasi-threads` runtime. A dedicated Web Worker
  (`web/kernel/kernel-worker.js`) owns an in-memory filesystem and services
  synchronous system calls over a `SharedArrayBuffer`. Each wasm thread runs in
  its own Web Worker sharing linear memory, so `rustc`, `wild`, and the user's
  program can all spawn threads with `std::thread`.
- **Prebuilt crates (`crates/`)**: 351 crates from the official Rust Playground
  set (the top 100 crates on crates.io, the Rust Cookbook crates, and their
  dependencies, excluding crates that require networking, OpenSSL, or OS-specific
  APIs; see `crates/top-crates.py`). Proc-macro crates are also compiled to
  wasm and executed inside `rustc` using the `wasmi` interpreter
  (`-Zwasm-proc-macros`, based on bjorn3's patches). The full set is 124 MB
  gzipped, so individual `.rlib` and proc-macro files (`web/dist/crates`) are
  fetched on demand when `rustc` first opens them (`web/kernel/crates.js`) and
  cached in the browser's Cache Storage. You can also prefetch the entire set
  under **Config > Crates**. Only crates referenced in the user's code are
  passed via `--extern`.
- **Frontend (`frontend/`)**: adapted from the official
  [Rust Playground](https://github.com/rust-lang/rust-playground) UI to talk to
  the local kernel worker instead of a remote server (see `frontend/README.md`).
  Supports Run, Build, Test, MIR, HIR, Clippy, Rustfmt, macro expansion, Ace and
  Monaco editors, multi-file editing, clickable diagnostics, Debug/Release
  profiles, and Rust editions. **Share** encodes the current file (or all files
  in multi-file mode) directly into the URL.
- **Clippy and `rustfmt`**: compiled into `rustc.wasm` so they do not require
  separate binaries. Setting `RUSTC_CLIPPY` enables Clippy lints alongside
  regular compiler warnings (adds ~2.5 MB to the binary with no measurable
  compile-time overhead). Setting `RUSTC_RUSTFMT` runs `rustfmt` in place on the
  given files (`compiler/rustc/src/rustfmt.rs` in `patches/rust`).

In Chrome, once the toolchain is loaded, a "Hello, world" program compiles and
runs in about 0.3 seconds, and a multi-threaded example takes about 0.5 seconds.

## Building

Building requires macOS or Linux on `x86_64` or `arm64` (use WSL on Windows),
`rustup`, Node 24.12+ (with `npx`, which fetches `pnpm` 11), Python 3, and the
[`browser-kernel`](https://github.com/ryancbuckley/browser-kernel) checked out beside this repository, as `../browser-kernel`. `scripts/setup.sh`
downloads `wasi-sdk` and other prebuilt tools for the host platform.

```sh
scripts/setup.sh        # fetch rust, cg_clif, wild at pinned commits, apply patches, download tools
scripts/build-rustc.sh  # build rustc.wasm + wasm32-wasip1-threads sysroot (~30 min first run)
scripts/build-wild.sh   # build wild for the host and for wasm
python3 crates/build.py # prebuild the 351 playground crates into web/dist/crates
scripts/build-web.sh    # bundle frontend/ and toolchain into web/
python3 web/serve.py    # serve at http://127.0.0.1:8000/ with COOP/COEP headers
```

### Static site deployment and offline PWA

`scripts/build-pages.sh` packages the site into `build/pages`, ready for any
static host (including GitHub Pages). `scripts/deploy-pages.sh` publishes it to
the `main` branch of
[rust-playground-inbrowser-site](https://github.com/ryancbuckley/rust-playground-inbrowser-site),
which GitHub Pages serves, as a single commit that replaces the last deploy (so
that repository doesn't collect every version of the toolchain):

- **Cross-origin isolation**: Shared WebAssembly memory requires `COOP`/`COEP`
  HTTP headers. On hosts like GitHub Pages that cannot set custom response
  headers, a service worker (`web/coi-sw.js`) injects them; on the first visit,
  the page registers the service worker and reloads once.
- **Offline support (PWA)**: The site includes a web app manifest
  (`web/manifest.webmanifest`) and caches the 76 MB toolchain in the service
  worker for offline use. Each deploy stamps the service worker with a content
  hash so updates download in the background and prompt the user before
  reloading.
- **Icon**: Uses custom crab artwork generated by `scripts/artwork/icon.py`
  rather than the trademarked Rust logo.

## Testing

### Browser end-to-end tests

`scripts/browser-test.mjs` runs the playground in headless Chrome:

```sh
node scripts/browser-test.mjs --example Threads
node scripts/browser-test.mjs --source path/to/file.rs --mode release
node scripts/browser-test.mjs --action MIR --tool Clippy
```

### Differential test suite (`scripts/difftest.py`)

`scripts/difftest.py` compiles 2,716 single-file run-pass tests from `rustc`'s
`tests/ui` suite for `wasm32-wasip1-threads` twice (once with the LLVM backend
and once with `cg_clif` + `clif-to-wasm`), runs both on the WASI kernel under
Node, and compares exit codes and stdout.

Of the 2,650 tests that compile and run with LLVM, **2,640 pass** with
`cg_clif` + `clif-to-wasm`. The 10 differences are not codegen miscompilations:

- 3 rely on identical constants having the same memory address, which LLVM
  merges and `cg_clif` does not (`mir_misc_casts`, `mir_raw_fat_ptr`,
  `issue-33537`).
- 3 print stack addresses or `argv[0]`, which naturally differ between builds.
- 1 formats a two-element `HashMap` and checks for one specific iteration order
  (`hashmap-debug-format`).
- 2 use experimental externally implementable items (`eii/`), which `cg_clif`
  does not implement yet.
- 1 uses `#[link_section]`, which the wasm object writer does not support yet.

### Running under Node (without a browser)

The same WASI kernel runs under Node via `web/browser-kernel/run.js`:

```sh
# Run any wasm32-wasip1-threads binary:
node web/browser-kernel/run.js program.wasm args...

# Compile main.rs with rustc.wasm and link with wild.wasm under Node:
SC=/sysroot/lib/rustlib/wasm32-wasip1-threads/lib/self-contained
node web/browser-kernel/run.js --dir vendor/rust/dist=/sysroot --dir $PWD/work=/work \
  --program wasm-ld=vendor/wild/target/wasm32-wasip1-threads/release/wild.wasm \
  --save /work/main.wasm=work/main.wasm \
  vendor/rust/build/wasm32-wasip1-threads/stage2/bin/rustc.wasm /work/main.rs \
  --target=wasm32-wasip1-threads --sysroot=/sysroot -o /work/main.wasm \
  -Clinker=wasm-ld -Clinker-flavor=wasm-ld -Clink-arg=$SC/crt1-command.o -L $SC
```

You can also use the patched `cg_clif` as a native codegen backend plugin with a
standard nightly compiler: build `vendor/cg_clif` with `cargo build --release`
and pass
`-Zcodegen-backend=vendor/cg_clif/target/release/librustc_codegen_cranelift.dylib --target wasm32-wasip1-threads`
(or `.so` on Linux) to `rustc +nightly-2026-10-19`.

To run Wild's own wasm integration tests, source `. tools/wild-test-env.sh` to
configure `PATH` and `WASI_SYSROOT` (requires `tools/wasmtime`).

## Patches

- **`patches/rust`**:
  - bjorn3's `compile_rustc_for_wasm20` branch, rebased onto
    `nightly-2026-10-19`: static linking of `cg_clif`, `panic=abort` error
    handling without unwinding, and spawning the linker via the
    `playground.spawn` host import.
  - bjorn3's WebAssembly proc-macro support (rust-lang/rust#157709), using a
    minimal built-in WASI shim instead of `wasmi_wasi` so it builds for a WASI
    host.
  - Built-in Clippy (`RUSTC_CLIPPY`) and `rustfmt` (`RUSTC_RUSTFMT`) entrypoints
    for WASI builds.
- **`patches/cg_clif`**: WebAssembly target support using `clif-to-wasm`,
  including custom wasm import modules (`#[link(wasm_import_module = "...")]`).
  Kept in sync with the in-tree copy in `patches/rust`.
- **`patches/wild`**: Empty. All required wasm linker fixes (main-thread TLS
  initialization with `--shared-memory` in wild-linker/wild#2838 and overridden
  weak data symbols) have been upstreamed to Wild.

## Limitations

- **Single crate, no Cargo**: Programs consist of `src/main.rs` (or
  `src/lib.rs`) plus any modules edited via **Config > Edit files**. If both
  `main.rs` and `lib.rs` exist, only `main.rs` is compiled. Only the 351
  prebuilt external crates are available, and users cannot define new proc-macro
  crates in the editor.
- **Crate flags and environment**: `tokio` is compiled with `--cfg tokio_unstable`
  (required for its multi-threaded runtime on wasm) and `parking_lot` with its
  `nightly` feature. Networking is not available.
- **Panics and unsupported codegen**: `wasm32-wasip1-threads` uses `panic=abort`,
  so panics terminate with a WebAssembly trap and no debug info. Functions that
  use CLIF features not yet supported by `clif-to-wasm` are replaced with trap
  stubs and emit a compiler warning.
- **Download size**: The page downloads about 58 MB on first load (`rustc.wasm`
  alone is 98 MB uncompressed / 23 MB gzipped). External crates are downloaded
  on demand (a few MB for most crates, or ~23 MB for `tokio` and its dependency
  tree).
- **Safari worker memory**: WebKit cannot reclaim WebAssembly shared memory from
  a terminated Web Worker until the tab closes. To avoid exhausting memory on
  repeated edits, Safari waits for an in-progress compile to finish before
  starting the next one rather than terminating the compiler worker mid-flight.
- **Mobile memory limits**: Mobile browsers cap per-page memory tightly. Peak
  memory is configured to 384 MiB for `rustc` (typical compiles use 120–190 MiB),
  128 MiB for `wild`, and 256 MiB for the user's program.

## License

Licensed under Apache-2.0 (see `LICENSE`); `clif-to-wasm` is licensed under
`Apache-2.0 WITH LLVM-exception`.

The UI in `frontend/` is adapted from the
[Rust Playground](https://github.com/rust-lang/rust-playground) by Jake Goulding
and contributors, dual-licensed under MIT and Apache-2.0
(`frontend/LICENSE-MIT`, `frontend/LICENSE-APACHE`). Because the site distributes
compiled third-party code to the browser, `scripts/build-web.sh` runs
`scripts/licenses.py` to generate `web/dist/licenses.html` (linked from the Help
page) with copyright notices and license texts for all bundled npm packages,
`rustc.wasm`, `wild.wasm`, the sysroot (`licenses/`), and the prebuilt crates.
