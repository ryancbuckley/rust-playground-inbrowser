# Third-party notices without a local source

`scripts/licenses.py` reads most license files from the source it builds
from (cargo's registry, `vendor/`). These come from code we only have as
binaries:

- `wasi-libc/`: wasi-libc at tag `wasi-sdk-34` (commit 2e6fb9d8), whose
  `libc.a` and `crt1-*.o` from wasi-sdk 34 are linked into every wasm binary
  the playground ships or builds. `LICENSE` is wasi-libc's overview of its
  parts. The others are copies of `LICENSE-APACHE-LLVM`, `LICENSE-MIT`,
  `libc-top-half/musl/COPYRIGHT`, `libc-bottom-half/cloudlibc/LICENSE`,
  `fts/musl-fts/COPYING`, and the opening comment of `dlmalloc/src/malloc.c`.
  They need updating when wasi-sdk is.

- `spdx/`: license texts for packages that ship none of their own, when
  rust's tree (`vendor/rust/LICENSES`) does not have the text either.
  `MPL-2.0.txt` (for selectors) is the MPL 2.0, as cssparser ships it.
