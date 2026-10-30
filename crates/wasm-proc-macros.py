#!/usr/bin/env python3
"""RUSTC_WRAPPER for build.py's main build: target crates use wasm proc macros.

Cargo builds proc macros for the host and passes them to the crates that use
them as `--extern name=libname-HASH.dylib`. For crates built for the target,
this wrapper replaces those with the same proc macros built for wasm
(build.py's first step), listed by name and version in the JSON file
$WASM_PROC_MACROS, and adds `-Zwasm-proc-macros`. rustc then runs them in
its wasm interpreter, and the crates' metadata names the wasm proc macros,
which rustc.wasm can run too.

A proc macro may be there in two versions, and its dylib's name does not
say which: when Cargo builds a proc macro for the host, this notes its
package and version in $PROC_MACRO_VERSIONS, under the dylib's name.
"""

import json
import os
import sys

rustc, *args = sys.argv[1:]


def arg(flag):
    """The value of `flag` (`--flag value` or `--flag=value`), or None."""
    for i, a in enumerate(args):
        if a == flag and i + 1 < len(args):
            return args[i + 1]
        if a.startswith(f"{flag}="):
            return a[len(flag) + 1:]
    return None


versions = os.environ["PROC_MACRO_VERSIONS"]
if arg("--target") is None and arg("--crate-type") == "proc-macro":
    codegen = [a for i, a in enumerate(args) if i > 0 and args[i - 1] == "-C"] + \
              [a[2:] for a in args if a.startswith("-C") and len(a) > 2]
    extra = next((a[len("extra-filename="):] for a in codegen if a.startswith("extra-filename=")), "")
    for ext in ("dylib", "so"):
        with open(os.path.join(versions, f"lib{arg('--crate-name')}{extra}.{ext}"), "w") as f:
            f.write(f"{os.environ['CARGO_PKG_NAME']} {os.environ['CARGO_PKG_VERSION']}")
elif arg("--target") is not None:
    macros = json.load(open(os.environ["WASM_PROC_MACROS"]))
    for i in range(1, len(args)):
        if args[i - 1] != "--extern" or "=" not in args[i]:
            continue
        name, path = args[i].split("=", 1)
        if path.endswith((".dylib", ".so")):
            try:
                key = open(os.path.join(versions, os.path.basename(path))).read()
            except FileNotFoundError:
                sys.exit(f"wasm-proc-macros.py: which version of {name} is {path}? (cargo clean, and build again)")
            if key not in macros:
                sys.exit(f"wasm-proc-macros.py: no wasm build of the proc macro {key}")
            args[i] = f"{name}={macros[key]}"
    # Crates that use a proc macro indirectly find it by name.
    for d in sorted({os.path.dirname(p) for p in macros.values()}):
        args += ["-L", f"dependency={d}"]
    args.append("-Zwasm-proc-macros")
os.execv(rustc, [rustc, *args])
