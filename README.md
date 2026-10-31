# Rust in the Browser

A Rust playground that compiles and runs Rust entirely in the browser:

```
main.rs ──rustc.wasm──▶ CLIF ──clif-to-wasm──▶ wasm objects ──wild.wasm──▶ main.wasm ──▶ run
         (cg_clif)                              + LLVM-built std
```

- **rustc.wasm**: rustc compiled to `wasm32-wasip1-threads`, using bjorn3's
  patches for compiling rustc to wasm (`patches/rust`, rebased onto
  nightly-2026-10-19). Its codegen backend, rustc_codegen_cranelift, is linked in
  statically.
- **cg_clif → wasm**: for wasm targets, cg_clif hands each function's CLIF to
  [`clif-to-wasm`](../clif_to_wasm). That backend
  writes relocatable wasm objects (tool-conventions `linking`/`reloc.*`) whose
  calling convention matches LLVM's, so they link against the standard
  library, which LLVM compiled.
- **wild.wasm**: the [wild](https://github.com/wild-linker/wild) linker,
  compiled to wasm. rustc cannot spawn processes on WASI, so it asks the host
  to run the linker (`playground.spawn`).
- **The kernel** ([`wasi-kernel`](../wasi-kernel), the sibling checkout,
  linked as `web/wasi-kernel`) is a small WASI preview1 implementation with
  wasi-threads. Every wasm thread runs in its own worker on its process's
  shared memory. System calls are synchronous RPCs over a SharedArrayBuffer to
  a kernel worker (`web/kernel/kernel-worker.js`) that owns an in-memory filesystem. rustc, the linker and the
  user's program all run on it, and the user's program can use `std::thread`.
- **Crates** (`crates/`): programs can use play.rust-lang.org's crates (the
  top 100 of crates.io, the Rust Cookbook's, and their dependencies): 351 of
  them, prebuilt, all but those that cannot work here (network clients,
  OpenSSL, Windows; `crates/top-crates.py` says which and why). Their proc
  macros are compiled to wasm too, and rustc runs them in an interpreter
  (wasmi), with bjorn3's wasm proc-macro patches (`-Zwasm-proc-macros`).
  They are 124 MB gzipped, so each library is a file of its own
  (`web/dist/crates`), fetched when rustc first opens it
  (`web/kernel/crates.js`) and kept in the browser's Cache Storage; Config >
  Crates downloads them all. A program is given (`--extern`) only the crates
  it names: rustc loads every crate it is given to suggest imports for an
  unresolved name.
- **The interface** (`frontend/`) is the
  [Rust Playground](https://github.com/rust-lang/rust-playground)'s, changed
  to ask the kernel worker where it asks its server (see `frontend/README.md`):
  Run, Build, Test, MIR, HIR, Clippy, Rustfmt and macro expansion, the Ace
  and Monaco editors, clickable diagnostics, Debug and Release, editions. It
  has no gists, channels, Miri, assembly or LLVM IR; Share makes a link with
  the code in it (each file separately, from the multiple-file view, which
  the link then opens in). Auto-run, the run limit and Clippy's lints when running are
  in the advanced options.
- **Clippy**: built into rustc.wasm.
  Tools > Clippy, and running with Clippy's lints on (the default), set
  `RUSTC_CLIPPY`, and its lints join the compiler's warnings. It adds 2.5 MB
  to the download and no measurable compile time.
- **rustfmt**: built into rustc.wasm the same way, for the same reason. With
  `RUSTC_RUSTFMT` set, rustc.wasm is `rustfmt [--edition E] FILE...`,
  formatting the files in place (`compiler/rustc/src/rustfmt.rs` in
  `patches/rust`). Tools > Rustfmt runs it.

The same kernel runs under Node (`web/wasi-kernel/run.js`), which is how
everything is tested outside the browser.

## Building

Requires macOS on arm64 (for the wasi-sdk download in `setup.sh`), rustup,
Node 24.12 or later (with npx, which fetches pnpm 11), Python 3, and the
sibling checkouts
`../clif_to_wasm` and `../wasi-kernel`.

```sh
scripts/setup.sh        # fetch rust, cg_clif and wild at pinned commits + patches, tools
scripts/build-rustc.sh  # rustc.wasm + the wasm32-wasip1-threads std (~30 min the first time)
scripts/build-wild.sh   # wild for the host and for wasm
python3 crates/build.py # the crates, with the native stage1 rustc, into web/dist/crates
scripts/build-web.sh    # the page (frontend/) and the toolchain, into web/
python3 web/serve.py    # http://127.0.0.1:8000/ (sends the COOP/COEP headers)
```

`scripts/build-pages.sh` collects the page into `build/pages`, a static
site for any host, GitHub Pages included. A host that cannot send the
COOP/COEP headers gets them from a service worker (`web/coi-sw.js`): on
the first visit the page registers it and reloads once.

`node scripts/browser-test.mjs --example Threads` runs an example in headless
Chrome and prints the output (`--source FILE` runs a file; `--action MIR`,
`--tool Clippy`, `--mode release` and others are described at its top). In
Chrome, hello world compiles in about 0.3 s and the threads example in 0.5 s,
once the toolchain is loaded.

## Testing

`scripts/difftest.py` compiles rust's run-pass UI tests (`tests/ui`, the
2,716 that need no auxiliary crates, flags or special runtime) for
wasm32-wasip1-threads twice, with LLVM and with cg_clif +
clif-to-wasm. It runs both under the kernel and compares exit
codes and stdout. Result on 2026-10-30: **2640 of the 2650** that LLVM compiles
and runs pass. None of the 10 failures is a miscompile:

- 3 compare addresses of identical constants, which LLVM merges and cg_clif
  does not (`mir_misc_casts`, `mir_raw_fat_ptr`, `issue-33537`).
- 3 print stack addresses or `argv[0]`, which legitimately differ.
- 1 prints a `HashMap`, whose order is random, when it is not the one it
  expects (`hashmap-debug-format`), so it passes or fails by chance.
- 2 use externally implementable items (`eii/`), which cg_clif does not
  support yet.
- 1 uses `#[link_section]`, which the wasm object writer does not support
  yet.

### Without the browser

```sh
# Run any wasm32-wasip1-threads program under the kernel:
node web/wasi-kernel/run.js program.wasm args...

# Compile with rustc.wasm, link with wild.wasm, all under the kernel:
SC=/sysroot/lib/rustlib/wasm32-wasip1-threads/lib/self-contained
node web/wasi-kernel/run.js --dir vendor/rust/dist=/sysroot --dir $PWD/work=/work \
  --program wasm-ld=vendor/wild/target/wasm32-wasip1-threads/release/wild.wasm \
  --save /work/main.wasm=work/main.wasm \
  vendor/rust/build/wasm32-wasip1-threads/stage2/bin/rustc.wasm /work/main.rs \
  --target=wasm32-wasip1-threads --sysroot=/sysroot -o /work/main.wasm \
  -Clinker=wasm-ld -Clinker-flavor=wasm-ld -Clink-arg=$SC/crt1-command.o -L $SC
```

Natively, the same backend runs as a codegen backend dylib for a stock
nightly: build `vendor/cg_clif` (`cargo build --release`) and pass
`-Zcodegen-backend=vendor/cg_clif/target/release/librustc_codegen_cranelift.dylib
--target wasm32-wasip1-threads` to `rustc +nightly-2026-10-19`.

For wild's wasm integration tests, `. tools/wild-test-env.sh` (from this
directory) puts wasi-sdk's clang and wasm-ld and `tools/` on `PATH`, and
points `WASI_SYSROOT` at `tools/wasi-sysroot-shim`, wasi-libc in the Debian
layout the tests expect. They also need `tools/wasmtime`, which `setup.sh`
does not download.

## Patches

- `patches/rust`: bjorn3's `compile_rustc_for_wasm20` changes, rebased. The
  linker runs through the `playground.spawn` host import instead of an
  in-process libwild. Fatal errors exit instead of unwinding (rustc.wasm is
  built with `panic=abort`), there is no dylib loading, and our cg_clif is
  in-tree. Then bjorn3's wasm proc-macro support (rust-lang/rust#157709),
  with a small built-in WASI in place of wasmi_wasi, which does not build for
  a WASI host. Then Clippy and rustfmt built into rustc for WASI hosts
  (`RUSTC_CLIPPY`, `RUSTC_RUSTFMT`), a failed link reported as such rather
  than as a missing linker, and the in-tree cg_clif kept in step with
  `patches/cg_clif` and clif-to-wasm (upstream cg_clif's update to Cranelift
  0.137 among them).
- `patches/cg_clif`: the wasm target support, including imports from wasm
  modules other than `env` (`#[link(wasm_import_module = "...")]`), on top
  of upstream's update to Cranelift 0.137. The in-tree cg_clif in
  `patches/rust` contains the same changes.
- wild needs no patches: our fixes to its wasm port (the main thread's TLS
  with `--shared-memory`, wild-linker/wild#2838, and overridden weak data
  symbols) are upstream. `setup.sh` still applies anything in `patches/wild`.

## Limitations

- One crate, with no Cargo: a program is `src/main.rs` (or `src/lib.rs`)
  and the modules it declares, edited as one file or, with Config > Edit
  files, as several. With both `main.rs` and `lib.rs`, only `main.rs` is
  compiled, so it cannot `use` the library as it can on the Rust
  Playground. Only the prebuilt crates are available, and a program cannot
  define proc macros of its own.
- tokio is built with `--cfg tokio_unstable` (its multi-threaded runtime is
  unstable on wasm), and parking_lot with its `nightly` feature (its thread
  parker on wasm needs it). There is no network.
- No debug info. Panics abort (`wasm32-wasip1-threads` defaults to
  `panic=abort`), and a panicking program exits with a trap.
- Functions the backend cannot compile yet become traps, with a compiler
  warning.
- The downloads are large: rustc.wasm is about 98 MB uncompressed (23 MB
  gzipped), and the page downloads about 58 MB before it can compile. Crates come on top, as
  programs use them: a few MB each with their dependencies, 23 MB for tokio.
- In Safari, an edit during a compile does not stop it: the next compile
  waits for it to finish. Safari can neither stop a worker running wasm nor
  free the memory it reserved, so stopping compiles would use up the page's
  memory after a few dozen edits. Programs are still stopped, and each one
  stopped while it computes keeps its memory until the tab is closed.
- On phones, which give a page far less memory, the compiler may use up to
  384 MiB (it needs 120 to 190 MiB for most programs, 260 for 2,500 lines),
  the linker 128 MiB, and a program 256 MiB.

## License

Apache-2.0 (see `LICENSE`); clif-to-wasm is Apache-2.0 WITH LLVM-exception.
The interface in `frontend/` is the Rust Playground's, by Jake Goulding and
its contributors, under the MIT license or Apache-2.0
(`frontend/LICENSE-MIT`, `frontend/LICENSE-APACHE`), as are our changes to it.
The page ships third-party software to the browser, so `scripts/build-web.sh`
writes `web/dist/licenses.html` (with `scripts/licenses.py`): every package in
the interface's bundle (the Rust Playground's frontend and the npm packages
the bundler included), rustc.wasm, wild.wasm, the sysroot and the crates,
with its copyright notices and license texts. The Help page links to it.
`licenses/` holds the notices for code we only have as binaries (wasi-libc).
