#!/usr/bin/env python3
"""Differential test: rust's run-pass UI tests compiled for wasm32-wasip1-threads
by LLVM and by cg_clif + clif-to-wasm, run under the playground's
kernel; the exit code and stdout must match.

Usage: difftest.py [--sample N] [--seed S] [--jobs J] [--filter SUBSTR] [--out DIR]
"""

import argparse
import concurrent.futures as cf
import json
import os
import pathlib
import random
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
UI = ROOT / "vendor/rust/tests/ui"
DYLIB = {"darwin": "lib{}.dylib", "win32": "{}.dll"}.get(sys.platform, "lib{}.so")
CG = ROOT / "vendor/cg_clif/target/release" / DYLIB.format("rustc_codegen_cranelift")
RUN = ROOT / "web/wasi-kernel/run.js"
TOOLCHAIN = "+nightly-2026-10-19"
SKIP = re.compile(r"aux-build|aux-crate|ignore-wasm|needs-unwind|ignore-emscripten|needs-subprocess|"
                  r"proc-macro|only-|needs-threads|ignore-wasi|revisions|exec-env|run-flags|"
                  r"check-run-results|compile-flags|ignore-backends|needs-dynamic-linking|"
                  r"no-prefer-dynamic|ignore-cross-compile|run-fail|build-fail")


def tests():
    out = []
    for p in sorted(UI.rglob("*.rs")):
        try:
            head = p.read_text(errors="replace")
        except OSError:
            continue
        if "//@ run-pass" in head and not SKIP.search(head):
            m = re.search(r"//@ edition:\s*(\S+)", head)
            edition = m.group(1) if m else "2015"
            if edition.endswith(".."):
                edition = edition[:-2]
            out.append((p, edition))
    return out


def compile_(src, edition, out, backend):
    cmd = ["rustc", TOOLCHAIN, "--target=wasm32-wasip1-threads", f"--edition={edition}",
           "-Awarnings", "-o", str(out), str(src)]
    if backend:
        cmd.insert(2, f"-Zcodegen-backend={CG}")
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=300, cwd=src.parent)
    return p.returncode, p.stderr


def run(wasm):
    try:
        p = subprocess.run(["node", str(RUN), str(wasm)], capture_output=True, timeout=20)
        return p.returncode, p.stdout, p.stderr.decode(errors="replace")
    except subprocess.TimeoutExpired:
        return "timeout", b"", ""


def one(item):
    src, edition = item
    rel = str(src.relative_to(UI))
    with tempfile.TemporaryDirectory() as d:
        d = pathlib.Path(d)
        code, err = compile_(src, edition, d / "llvm.wasm", False)
        if code != 0:
            return rel, "skip-llvm-compile", ""
        code, err = compile_(src, edition, d / "clif.wasm", True)
        stubbed = [l for l in err.splitlines() if "clif-to-wasm:" in l]
        if code != 0:
            first = next((l for l in err.splitlines() if "error" in l or "panicked" in l), err[:300])
            return rel, "clif-compile-fail", first + "\n" + err[-2000:]
        a = run(d / "llvm.wasm")
        if a[0] != 0:
            return rel, "skip-llvm-run", str(a[0])
        b = run(d / "clif.wasm")
        if a[0] == b[0] and a[1] == b[1]:
            return rel, "pass" if not stubbed else "pass-with-stubs", "\n".join(stubbed)
        detail = f"exit llvm={a[0]} clif={b[0]}\n{b[2][-1500:]}\n" + "\n".join(stubbed)
        if a[1] != b[1]:
            detail += f"\nstdout differs: llvm={a[1][:200]!r} clif={b[1][:200]!r}"
        return rel, "fail" if not stubbed else "fail-stubbed", detail


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=0)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--jobs", type=int, default=os.cpu_count())
    ap.add_argument("--filter", default="")
    ap.add_argument("--out", default=str(ROOT / "build/difftest"))
    args = ap.parse_args()
    items = [t for t in tests() if args.filter in str(t[0])]
    if args.sample:
        random.Random(args.seed).shuffle(items)
        items = items[: args.sample]
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    results = {}
    with cf.ThreadPoolExecutor(args.jobs) as ex:
        for rel, status, detail in ex.map(one, items):
            results[rel] = (status, detail)
    counts = {}
    for status, _ in results.values():
        counts[status] = counts.get(status, 0) + 1
    (out / "results.json").write_text(json.dumps(results, indent=1))
    for status in sorted(counts):
        print(f"{status:20} {counts[status]}")
    ran = sum(v for k, v in counts.items() if not k.startswith("skip"))
    passed = counts.get("pass", 0) + counts.get("pass-with-stubs", 0)
    print(f"passed {passed}/{ran} that LLVM compiles and runs")


if __name__ == "__main__":
    main()
