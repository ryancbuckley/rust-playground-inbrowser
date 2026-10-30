# The interface

This is the [Rust Playground](https://github.com/rust-lang/rust-playground)'s
frontend (`ui/frontend`), by Jake Goulding and the Rust Playground's
contributors, at the commit in `package.json` (`upstream`). It is licensed
under the MIT license or the Apache License 2.0 (`LICENSE-MIT`,
`LICENSE-APACHE`), as are our changes to it.

Where the Rust Playground asks its server to compile and run code, this asks
the compiler in the browser: `toolchain.ts` starts the kernel worker
(`web/kernel/kernel-worker.js`, which is not bundled) and talks to it. It
replaces `api.ts` and the WebSocket middleware. The rest follows from that:

- Removed: gists (Share gives a link with the code in it instead), channels
  (the compiler is one nightly), Miri, assembly, LLVM IR, Wasm,
  backtraces (programs abort on panic), standard input (programs have none;
  `ExecutionControl.tsx` has only Stop), the excessive-execution notice (the
  run limit stops programs), the server's feature flags, and the Google
  Fonts (the fonts are bundled, from Fontsource).
- MIR, HIR, macro expansion, Clippy and Rustfmt are rustc.wasm's
  `--emit=mir`, `-Zunpretty=hir`, `-Zunpretty=expanded`, and its built-in
  Clippy and rustfmt.
- Added: an Examples menu (`examples.ts`), auto-run (`autoRun.ts`), the run
  limit and Clippy's lints when running (the advanced options), and the
  toolchain's loading status in the header.
- Routes are relative to the page, which can be served from any directory;
  help is `?help`.
- The build writes `web/index.html` and `web/dist/ui`, and lists the npm
  packages it bundled in `build/packages.json`, for `scripts/licenses.py`.

## Building

`scripts/build-web.sh` builds it, with pnpm 11 (through `npx`):

```sh
npx pnpm@11 install --frozen-lockfile
npx pnpm@11 run build:production   # or `build` for a development build
npx pnpm@11 test                   # the unit tests
```

## Updating from upstream

Diff the upstream commit in `package.json` against the new one
(`ui/frontend`) and apply what applies; then update `upstream.commit`.
