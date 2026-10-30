#!/usr/bin/env python3
"""Build the crates in Cargo.toml for wasm32-wasip1-threads, for the browser.

They are compiled by the native rustc from the same source as rustc.wasm
(vendor/rust's stage1 compiler), so rustc.wasm can read their metadata.
Each library is a file of web/dist/crates, gzipped, which the page fetches
when a program first uses it: Cargo keeps the full metadata of a library in
its .rmeta file, which rustc reads when compiling, and its code in the
.rlib, which the linker reads. index.json lists the files, with their sizes
and a hash of their contents, and the crates programs can use directly (the
dependencies in Cargo.toml) with their files, for `--extern`.

rustc.wasm cannot load native proc macros, so the crates are built against
proc macros compiled to wasm (`-Zwasm-proc-macros`), which rustc runs in an
interpreter, natively here and in the browser alike:

1. Every proc macro in the dependency graph is built for wasm32-wasip1, in a
   generated package (target/wasm-proc-macros) whose dependencies are those
   proc macros at the same versions. Cargo only builds proc macros for the
   host, except with -Zdual-proc-macros, which builds them for the target too.
2. The crates are built with wasm-proc-macros.py as RUSTC_WRAPPER, which hands
   the wasm proc macros to the crates instead of the native ones.

web/dist/crates has the wasm proc macros too.

A crate that fails to build is named, and the build fails: leave it out in
top-crates.py.
"""

import gzip
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
RUSTC = ROOT / "vendor/rust/build/aarch64-apple-darwin/stage1/bin/rustc"
TARGET = "wasm32-wasip1-threads"
WASI_SDK = ROOT / "tools/wasi-sdk-34.0-arm64-macos"
WASM_LD = WASI_SDK / "bin/wasm-ld"
OUT = ROOT / "web/dist/crates"


PROC_MACRO_TARGET = "wasm32-wasip1"
CARGO = ["cargo", "+nightly-2026-10-19"]
# The stage1 sysroot links lib/rustlib/src/rust to vendor/rust; without this,
# std's code instantiated in the crates names paths there instead of
# /rustc/1.101.0 (see build-rustc.sh).
NO_LOCAL_PATHS = "-Ztranslate-remapped-path-to-local-path=no"
ENV = dict(os.environ, RUSTC=str(RUSTC),
           # The stage1 sysroot has no rust-objcopy for stripping build scripts.
           CARGO_PROFILE_RELEASE_STRIP="false",
           # C code (ring, zstd) is compiled with wasi-sdk.
           CC_wasm32_wasip1_threads=str(WASI_SDK / "bin/clang"),
           AR_wasm32_wasip1_threads=str(WASI_SDK / "bin/llvm-ar"),
           CFLAGS_wasm32_wasip1_threads=f"--sysroot={WASI_SDK / 'share/wasi-sysroot'}")


def package_of(package_id):
    """(name, version) of a Cargo package id such as
    registry+https://github.com/rust-lang/crates.io-index#serde@1.0.229."""
    name, _, version = package_id.rsplit("#", 1)[1].partition("@")
    return name, version


def cargo_build(cwd, target, env, *args, keep_going=False):
    """Run `cargo build` and return its compiler-artifact messages. With
    `keep_going`, build what can be built, and return whether all was too.

    Paths are trimmed (-Ztrim-paths), so the libraries name crate-version/...
    and /rustc/<sha>/... instead of paths on this machine."""
    res = subprocess.run(
        [*CARGO, "-Ztrim-paths", "build", "--release", f"--target={target}",
         "--config", 'profile.release.trim-paths="all"',
         "--message-format=json-render-diagnostics", *(["--keep-going"] if keep_going else []), *args],
        cwd=cwd, env=env, stdout=subprocess.PIPE, text=True)
    if res.returncode != 0 and not keep_going:
        sys.exit(f"cargo build failed in {cwd}")
    artifacts = [m for m in map(json.loads, res.stdout.splitlines()) if m.get("reason") == "compiler-artifact"]
    return (artifacts, res.returncode == 0) if keep_going else artifacts


def metadata(cwd, target):
    return json.loads(subprocess.run(
        [*CARGO, "metadata", "--format-version=1", f"--filter-platform={target}"],
        cwd=cwd, env=ENV, check=True, stdout=subprocess.PIPE, text=True).stdout)


def build_wasm_proc_macros():
    """Build the proc macros the crates use for wasm; return {"name version": .wasm path}."""
    meta = metadata(HERE, TARGET)
    features = {n["id"]: n["features"] for n in meta["resolve"]["nodes"]}
    macros = sorted((p["name"], p["version"], features[p["id"]]) for p in meta["packages"]
                    if p["id"] in features and any("proc-macro" in t["kind"] for t in p["targets"]))
    pkg = HERE / "target/wasm-proc-macros"
    pkg.mkdir(parents=True, exist_ok=True)
    # Keyed by version too: a crate may be there in two versions (phf_macros).
    # With the features the crates use, which decide what macros there are.
    deps = "".join(f'{re.sub(r"\W", "_", f"{name}_{version}")} = {{ package = "{name}", version = "={version}", '
                   f'default-features = false, features = {json.dumps(feats)} }}\n'
                   for name, version, feats in macros)
    (pkg / "Cargo.toml").write_text(
        '[package]\nname = "wasm-proc-macros"\nversion = "0.0.0"\nedition = "2024"\n'
        f'[lib]\npath = "lib.rs"\n[workspace]\n[dependencies]\n{deps}')
    (pkg / "lib.rs").write_text("")
    # This rustc's wasm targets don't take -Clink-self-contained, so the C
    # runtime and libc are passed by hand, with the reactor (library) runtime.
    self_contained = RUSTC.parent.parent / f"lib/rustlib/{PROC_MACRO_TARGET}/lib/self-contained"
    env = dict(ENV, CARGO_TARGET_WASM32_WASIP1_LINKER=str(WASM_LD),
               RUSTFLAGS=f"{NO_LOCAL_PATHS} -Zwasm-proc-macros -L {self_contained} "
                         f"-Clink-arg={self_contained}/crt1-reactor.o")
    wasm = {}
    for m in cargo_build(pkg, PROC_MACRO_TARGET, env, "-Zdual-proc-macros"):
        if "proc-macro" in m["target"]["kind"]:
            for f in m["filenames"]:
                if f"/{PROC_MACRO_TARGET}/" in f and f.endswith(".wasm"):
                    wasm[" ".join(package_of(m["package_id"]))] = f
    missing = [f"{name} {version}" for name, version, _ in macros if f"{name} {version}" not in wasm]
    if missing:
        sys.exit(f"no wasm build of the proc macros {missing}")
    return wasm


def main():
    wasm_macros = build_wasm_proc_macros()
    macros_json = HERE / "target/wasm-proc-macros.json"
    macros_json.write_text(json.dumps(wasm_macros, indent=1))
    versions = HERE / "target/proc-macro-versions"
    versions.mkdir(parents=True, exist_ok=True)
    env = dict(ENV, RUSTC_WRAPPER=str(HERE / "wasm-proc-macros.py"),
               WASM_PROC_MACROS=str(macros_json), PROC_MACRO_VERSIONS=str(versions),
               # tokio's multi-threaded runtime on wasm is unstable.
               RUSTFLAGS=f"{NO_LOCAL_PATHS} --cfg tokio_unstable")
    artifacts, ok = cargo_build(HERE, TARGET, env, keep_going=True)
    libs = {}  # package id -> {"rlib": path, "rmeta": path}, for libraries built for the target
    for m in artifacts:
        for f in m["filenames"]:
            if f"/{TARGET}/" in f and f.endswith((".rlib", ".rmeta")):
                libs.setdefault(m["package_id"], {})[f.rsplit(".", 1)[1]] = pathlib.Path(f)

    # The crates programs can use: Cargo.toml's dependencies, by their keys.
    meta = metadata(HERE, TARGET)
    root = next(n for n in meta["resolve"]["nodes"] if n["id"] == meta["resolve"]["root"])
    crates, externs, failed = [], {}, []
    for dep in root["deps"]:
        name, version = package_of(dep["pkg"])
        if dep["pkg"] in libs and len(libs[dep["pkg"]]) == 2:
            externs[dep["name"]] = [libs[dep["pkg"]]["rmeta"].name, libs[dep["pkg"]]["rlib"].name]
        elif f"{name} {version}" in wasm_macros:
            externs[dep["name"]] = [pathlib.Path(wasm_macros[f"{name} {version}"]).name]
        else:
            failed.append(f"{dep['name']} ({name} {version})")
            continue
        crates.append({"name": name, "version": version, "id": dep["name"]})
    if failed or not ok:
        sys.exit(f"these crates did not build (see above): {', '.join(failed) or 'none of the direct ones'}")

    # Every library, and every wasm proc macro, gzipped.
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    files, packed_total, total = {}, 0, 0
    # Each file with the crate it is, "name version".
    sources = [(p, " ".join(package_of(pid))) for pid, lib in libs.items() for p in lib.values()] + \
              [(pathlib.Path(p), key) for key, p in wasm_macros.items()]
    for path, crate in sorted(sources, key=lambda s: s[0].name):
        data = path.read_bytes()
        packed = gzip.compress(data, 9, mtime=0)
        (OUT / f"{path.name}.gz").write_bytes(packed)
        files[path.name] = {"size": len(data), "packed": len(packed),
                            "hash": hashlib.sha256(packed).hexdigest()[:16], "crate": crate}
        total += len(data)
        packed_total += len(packed)
    index = {"crates": sorted(crates, key=lambda c: c["id"]), "externs": externs, "files": files}
    (OUT / "index.json").write_text(json.dumps(index, separators=(",", ":")))
    print(f"{len(crates)} crates programs can use, {len(libs)} libraries, proc macros "
          f"{', '.join(sorted(wasm_macros))}: {len(files)} files, {total / 1e6:.0f} MB, "
          f"{packed_total / 1e6:.0f} MB gzipped")


if __name__ == "__main__":
    main()
