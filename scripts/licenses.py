#!/usr/bin/env python3
"""Write the notices for everything the playground ships (web/dist/licenses.html).

The page sends software to the browser: its interface (the Rust Playground's
frontend and the npm packages bundled with it, dist/ui), rustc.wasm, wild.wasm,
the standard library (sysroot.bundle, which ends up in every program) and the
prebuilt crates (dist/crates). Their licenses ask that copyright notices and
license texts go along with copies, so this lists every package in each, with
the copyright lines and license files from its own source.

The packages are the ones `cargo tree` lists with the features each is built
with: bootstrap builds rustc-main with `cranelift max_level_info` and the
sysroot with `backtrace panic-unwind`. (On 2026-10-24 these matched the
packages in the build directories exactly.) Code only used while building is
left out: build scripts and the compiler's proc macros. The crates' proc
macros ship, compiled to wasm, so they are in. So is what cargo doesn't
describe: wasi-libc (licenses/wasi-libc), LLVM's libunwind, and third-party
code inside rust's own tree, from its REUSE metadata. The npm packages are
the ones the bundler put in the bundle (frontend/build/packages.json, written
by frontend/rspack.config.mjs), so the interface must be built first.

Usage: scripts/licenses.py [out.html]
"""

import html
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
RUST = ROOT / "vendor/rust"
WILD = ROOT / "vendor/wild"
UI = ROOT / "frontend"
TARGET = "wasm32-wasip1-threads"
CARGO = ["cargo", "+nightly-2026-10-19"]
# SPDX license texts, for packages that ship none of their own: rust's, and
# ours (licenses/spdx) for those rust's tree does not have.
SPDX_TEXTS = RUST / "LICENSES"
MORE_SPDX_TEXTS = ROOT / "licenses/spdx"
RUST_PROJECT = "The Rust Project Developers (see https://thanks.rust-lang.org)"

LICENSE_FILE = re.compile(r"(?i)^(licen[cs]e|copying|copyright|notice|unlicense)([-._].*)?(?<!\.json)$")
# License files a package keeps somewhere other than its top directory.
MORE_LICENSE_FILES = {"zstd-sys": ["zstd/LICENSE"], "monaco-editor": ["ThirdPartyNotices.txt"]}
# Notices a package's license files leave out. Source Code Pro's LICENSE has
# no copyright line; this is the one in the font's name table.
COPYRIGHT_NOTICES = {
    "@fontsource-variable/source-code-pro":
        ["Copyright © 2023 Adobe (http://www.adobe.com/), with Reserved Font Name ‘Source’"],
}
COPYRIGHT = re.compile(r"(?i)^\s*(?:copyright\b|©)|\bcopyright\s*(?:\(c\)|©)")
# Lines that mention copyright without being a notice (license wording, templates).
NOT_A_NOTICE = re.compile(r"(?i)\[yyyy\]|\[name of|<year>|copyright (?:notices?|holders?|owners?|license|"
                          r"statement|and|law|protection|interest|assignment)\b|copyrights? (?:in|to)\b|"
                          r"copyright\W*$")
# A notice that is only a year, its holder on the next line.
NO_HOLDER = re.compile(r"(?i)^(?:copyright|\(c\)|©|[\d\s,.-])*$")
# What a license text is, by a phrase in it; the first match wins.
KINDS = [
    (r"LLVM Exceptions to the Apache 2\.0 License", "Apache-2.0 WITH LLVM-exception"),
    (r"Apache License,? Version 2\.0, January 2004", "Apache-2.0"),
    (r"Mozilla Public License,? [Vv]ersion 2\.0", "MPL-2.0"),
    (r"UNICODE LICENSE V3", "Unicode-3.0"),
    (r"free and unencumbered software released into the public domain", "Unlicense"),
    (r"Boost Software License", "BSL-1.0"),
    (r"publicdomain/zero|CC0 1\.0 Universal", "CC0-1.0"),
    # Before MIT: it grants permission in the same words.
    (r"SIL OPEN FONT LICENSE Version 1\.1", "OFL-1.1"),
    (r"Permission is hereby granted, free of charge", "MIT"),
    (r"Neither the name", "BSD-3-Clause"),
    (r"Redistribution and use in source and binary forms", "BSD-2-Clause"),
    (r"provided that the above copyright notice and this permission notice appear", "ISC"),
    (r"Permission to use, copy, modify, and/or distribute this software for any purpose", "0BSD"),
    (r"This software is provided 'as-is'", "Zlib"),
]


def run(cwd, *args):
    return subprocess.run(args, cwd=cwd, check=True, stdout=subprocess.PIPE, text=True).stdout


def license_files(d):
    return sorted(p for p in d.iterdir() if p.is_file() and LICENSE_FILE.match(p.name))


def spdx_files(expression):
    """The SPDX texts for a license expression; of a choice ("A OR B"), the first."""
    if "(" not in expression:
        expression = re.split(r" OR |/", expression)[0]
    ids = set(re.findall(r"[\w.+-]+", expression)) - {"OR", "AND", "WITH"}
    return [SPDX_TEXTS / f"{i}.txt" if (SPDX_TEXTS / f"{i}.txt").exists() else MORE_SPDX_TEXTS / f"{i}.txt"
            for i in sorted(ids)]


def cargo_packages(cwd, *args):
    """The packages `cargo tree` lists for TARGET, as entries."""
    meta = json.loads(run(cwd, *CARGO, "metadata", "--offline", "--format-version=1", "--all-features"))
    by_version = {(p["name"], p["version"]): p for p in meta["packages"]}
    tree = run(cwd, *CARGO, "tree", "--offline", f"--target={TARGET}", "--prefix=none", "--format={p}", *args)
    keys = {tuple(line.split()[:2]) for line in tree.splitlines()}
    return [package_entry(by_version[name, version[1:]]) for name, version in sorted(keys)]


def package_entry(pkg):
    d = pathlib.Path(pkg["manifest_path"]).parent
    files = license_files(d)
    if pkg.get("license_file") and (d / pkg["license_file"]) not in files:
        files.insert(0, (d / pkg["license_file"]).resolve())
    if not files and pkg["source"] is None:
        # A crate inside a repository (rustc's, wild's): the repository's files.
        for parent in d.parents:
            files = license_files(parent)
            if files or (parent / ".git").exists():
                break
    files += [d / f for f in MORE_LICENSE_FILES.get(pkg["name"], [])]
    in_rust = d.is_relative_to(RUST)
    url = pkg["repository"] or pkg["homepage"]
    if not url:
        url = "https://github.com/rust-lang/rust" if in_rust else f"https://crates.io/crates/{pkg['name']}"
    return {
        "name": pkg["name"],
        "version": pkg["version"],
        "url": url,
        "license": pkg["license"] or ("Apache-2.0 OR MIT" if in_rust else ""),
        "authors": [re.sub(r"\s*<[^>]*>", "", a) for a in pkg["authors"]],
        "repository": pkg["repository"],
        "files": files,
    }


def npm_packages():
    """The npm packages in the interface's bundle, as entries."""
    entries = []
    for d in map(pathlib.Path, json.loads((UI / "build/packages.json").read_text())):
        pkg = json.loads((d / "package.json").read_text())
        author = pkg.get("author")
        author = author.get("name") if isinstance(author, dict) else author
        entries.append({
            "name": pkg["name"],
            "version": pkg["version"],
            "url": f"https://www.npmjs.com/package/{pkg['name']}",
            "license": pkg.get("license", ""),
            "authors": [re.sub(r"\s*[<(][^>)]*[>)]", "", author)] if author else [],
            "repository": None,
            "files": license_files(d) + [d / f for f in MORE_LICENSE_FILES.get(pkg["name"], [])],
        })
        if pkg["name"] in COPYRIGHT_NOTICES:
            entries[-1]["copyright"] = COPYRIGHT_NOTICES[pkg["name"]]
    return entries


def reuse_notes(*prefixes):
    """Third-party code in rust's tree under these paths, from REUSE (license-metadata.json)."""
    commit = run(RUST, "git", "rev-parse", "HEAD").strip()
    notes = []

    def walk(node, path):
        if node["type"] == "group":
            paths = [str(path / p) for p in node["files"] + node["directories"]]
        else:
            path = path / node.get("name", "")
            paths = [str(path)]
        lic = node.get("license")
        if lic and lic["copyright"] != [RUST_PROJECT] and any(p.startswith(prefixes) for p in paths):
            notes.append({
                "name": ", ".join(paths), "version": "", "license": lic["spdx"],
                "url": f"https://github.com/rust-lang/rust/tree/{commit}/{paths[0]}",
                "copyright": [f"Copyright {c}" for c in lic["copyright"]],
                "files": spdx_files(lic["spdx"]),
            })
        for child in node.get("children", []):
            walk(child, path)

    walk(json.loads((RUST / "license-metadata.json").read_text())["files"], pathlib.PurePosixPath())
    return notes


def is_notice(line):
    return COPYRIGHT.search(line) and not NOT_A_NOTICE.search(line)


def copyright_lines(text):
    """The copyright notices in a license text, from the word "Copyright" on."""
    notices = []
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if is_notice(line):
            notice = line[COPYRIGHT.search(line).start():]
            if NO_HOLDER.match(notice):
                notice += " " + next((l for l in lines[i + 1:] if l.strip()), "")
            notices.append(" ".join(notice.strip(" */#;").split()).removesuffix("."))
    return notices


def kind(text):
    flat = " ".join(text.split())
    return next((name for pattern, name in KINDS if re.search(pattern, flat)), None)


def components():
    wasi_libc = {
        "name": "wasi-libc", "version": "wasi-sdk-34", "url": "https://github.com/WebAssembly/wasi-libc",
        "license": "Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT, with parts under MIT (musl), "
                   "BSD-2-Clause (cloudlibc), BSD-3-Clause (fts) and CC0-1.0 (dlmalloc)",
        "files": sorted((ROOT / "licenses/wasi-libc").iterdir()),
        # musl's COPYRIGHT names its holders in prose, which copyright_lines() can't take apart.
        "copyright": ["Copyright © 2005-2020 Rich Felker, et al. (musl; see its COPYRIGHT below)",
                      "Copyright (c) 2015-2017 Nuxi (https://nuxi.nl/) and contributors (cloudlibc)",
                      "Copyright (c) 1989, 1993 The Regents of the University of California (fts)",
                      "dlmalloc: Doug Lea, released to the public domain (CC0)"],
    }
    libunwind = {
        "name": "libunwind (LLVM)", "version": "", "url": "https://github.com/llvm/llvm-project",
        "license": "Apache-2.0 WITH LLVM-exception",
        "files": [RUST / "src/llvm-project/libunwind/LICENSE.TXT"],
    }
    kernel = json.loads((ROOT / "web/browser-kernel/package.json").read_text())
    upstream = json.loads((UI / "package.json").read_text())["upstream"]
    rust_playground = {
        "name": "Rust Playground (its frontend, changed)", "version": upstream["commit"][:12],
        "url": f"{upstream['repository']}/tree/{upstream['commit']}/{upstream['path']}",
        "license": "MIT OR Apache-2.0", "files": [UI / "LICENSE-MIT", UI / "LICENSE-APACHE"],
    }
    own = [
        {"name": "Rust in the Browser", "version": "", "url": "", "license": "Apache-2.0",
         "files": [ROOT / "LICENSE"]},
        {"name": "browser-kernel", "version": kernel["version"], "url": "https://github.com/ryancbuckley/browser-kernel", "license": kernel["license"],
         "files": [ROOT / "web/browser-kernel/LICENSE"]},
    ]
    no_proc_macros = ["-e", "normal,no-proc-macro"]
    std = cargo_packages(RUST / "library", "-p", "sysroot", "-F", "backtrace,panic-unwind", *no_proc_macros)
    crates = [e for e in cargo_packages(ROOT / "crates", "-e", "normal") if e["name"] != "playground-crates"]
    return [
        ("playground", "This playground",
         "The page and its WASI kernel.",
         own),
        ("ui", "The interface",
         "The page's interface is the Rust Playground's, changed to compile in the browser. It is bundled "
         "(dist/ui) with the npm packages below: the Ace and Monaco editors, React, Redux, Prism, tree-sitter, "
         "the fonts, and what they use.",
         [rust_playground] + npm_packages()),
        ("rustc", "rustc.wasm",
         "The compiler: rustc with Clippy and rustc_codegen_cranelift, using Cranelift, clif-to-wasm and, "
         "for proc macros, wasmi. It also contains the standard library (below).",
         cargo_packages(RUST, "-p", "rustc-main", "-F", "cranelift,max_level_info", *no_proc_macros)
         + [wasi_libc] + reuse_notes("compiler/", "src/tools/clippy/")),
        ("wild", "wild.wasm",
         "The linker: wild, with the zstd C library. It also contains the standard library (below).",
         cargo_packages(WILD, "-p", "wild-linker", *no_proc_macros) + [wasi_libc]),
        ("sysroot", "sysroot.bundle",
         "The standard library and C runtime that every program, and the compiler and linker themselves, "
         "are linked with.",
         std + [libunwind, wasi_libc] + reuse_notes("library/")),
        ("crates", "The crates",
         "The crates programs can use, and their proc macros, compiled to wasm.",
         crates + [wasi_libc]),
    ]


def main():
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "web/dist/licenses.html"
    comps = components()
    entries = [e for _, _, _, es in comps for e in es]

    # A crate without license files of its own: a sibling's from the same
    # repository with the same license (Cranelift's), or else the SPDX texts.
    for e in entries:
        if not e["files"]:
            sibling = next((s for s in entries if s["files"] and s.get("repository")
                            and s.get("repository") == e.get("repository") and s["license"] == e["license"]), None)
            e["files"] = sibling["files"] if sibling else spdx_files(e["license"])
    missing = sorted({str(f) for e in entries for f in e["files"] if not f.is_file()})
    if missing:
        sys.exit("missing license files:\n  " + "\n  ".join(missing))

    # The texts, each once. Copyright lines are listed with their packages, so
    # texts that differ only in those are the same text.
    texts, keys = [], {}
    for e in entries:
        e["texts"] = []
        found = []
        for f in e["files"]:
            text = f.read_text(errors="replace").strip("\n")
            if not f.is_relative_to(SPDX_TEXTS) and not f.is_relative_to(MORE_SPDX_TEXTS):   # templates
                found += copyright_lines(text)
            key = " ".join(" ".join(l for l in text.splitlines() if not is_notice(l)).split())
            if key not in keys:
                keys[key] = len(texts)
                texts.append({"text": text, "kind": kind(text), "file": f"{f.name} of {f.parent.name}",
                              "users": set()})
            t = keys[key]
            texts[t]["users"].add(e["name"])
            if t not in e["texts"]:
                e["texts"].append(t)
        e.setdefault("copyright", list(dict.fromkeys(found)))

    # Number the texts by kind, most used first: "MIT", "MIT (2)", ...
    order = sorted(range(len(texts)), key=lambda t: (texts[t]["kind"] or "~", -len(texts[t]["users"])))
    count = {}
    for t in order:
        k = texts[t]["kind"] or texts[t]["file"]
        count[k] = count.get(k, 0) + 1
        texts[t]["label"] = k if count[k] == 1 else f"{k} ({count[k]})"

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(comps, texts, order))
    print(f"{out}: {len(entries)} entries, {len(texts)} license texts")


def render(comps, texts, order):
    esc = html.escape
    body = []
    body.append("<nav>" + " · ".join(f'<a href="#{cid}">{esc(title)}</a>' for cid, title, _, _ in comps)
                + ' · <a href="#texts">License texts</a></nav>')
    for cid, title, desc, entries in comps:
        body.append(f'<h2 id="{cid}">{esc(title)}</h2>\n<p>{esc(desc)}</p>')
        rows = []
        for e in sorted(entries, key=lambda e: e["name"].lower()):
            name = esc(e["name"])
            if e["url"]:
                name = f'<a href="{esc(e["url"])}">{name}</a>'
            if e["version"]:
                name += f' <span class="muted">{esc(e["version"])}</span>'
            if e["copyright"]:
                who = "<br>".join(esc(c) for c in e["copyright"])
            elif e.get("authors"):
                who = f'<span class="muted">Authors:</span> {esc(", ".join(e["authors"]))}'
            else:
                who = f'<span class="muted">The {esc(e["name"])} authors</span>'
            refs = ", ".join(f'<a href="#t{t}">{esc(texts[t]["label"])}</a>' for t in e["texts"])
            rows.append(f"<tr><td>{name}</td><td>{esc(e['license'])}</td><td>{who}</td><td>{refs}</td></tr>")
        body.append("<table><thead><tr><th>Package</th><th>License</th>"
                    "<th>Copyright</th><th>Texts</th></tr></thead><tbody>\n"
                    + "\n".join(rows) + "\n</tbody></table>")
    body.append('<h2 id="texts">License texts</h2>\n<p>Each text once; the copyright lines it carries in '
                "each package are listed with the package above.</p>")
    for t in order:
        users = sorted(texts[t]["users"], key=str.lower)
        body.append(f'<details id="t{t}"><summary>{esc(texts[t]["label"])} '
                    f'<span class="muted">({len(users)}: {esc(", ".join(users[:6]))}'
                    f'{", …" if len(users) > 6 else ""})</span></summary>'
                    f'<pre>{esc(texts[t]["text"])}</pre></details>')
    return TEMPLATE.replace("BODY", "\n".join(body))


TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Licenses · Rust in the Browser</title>
<script>
  // The playground's theme (its configuration, in local storage).
  try {
    const theme = JSON.parse(localStorage.getItem("redux"))?.configuration?.theme;
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  } catch {}
  // Open the text a link points at.
  addEventListener("click", (e) => {
    const id = e.target.closest?.('a[href^="#t"]')?.getAttribute("href").slice(1);
    if (id) document.getElementById(id).open = true;
  });
</script>
<style>
:root {
  --bg: #fbfaf8; --panel: #ffffff; --border: #e3e0da; --text: #24211d; --muted: #77716a;
  --accent: #b7410e; --mono: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #171513; --panel: #1f1c19; --border: #3a352f; --text: #ece7e1; --muted: #a39b91;
    --accent: #e0703a; color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #171513; --panel: #1f1c19; --border: #3a352f; --text: #ece7e1; --muted: #a39b91;
  --accent: #e0703a; color-scheme: dark;
}
body {
  margin: 0 auto; max-width: 1100px; padding: 16px; background: var(--bg); color: var(--text);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
}
a { color: var(--accent); }
h1 { font-size: 22px; margin: 8px 0; }
h2 { font-size: 18px; margin: 32px 0 4px; }
.muted { color: var(--muted); }
table { border-collapse: collapse; width: 100%; font-size: 13px; table-layout: fixed; }
th, td { text-align: left; vertical-align: top; padding: 4px 8px; border-bottom: 1px solid var(--border);
         overflow-wrap: anywhere; }
th { position: sticky; top: 0; background: var(--bg); }
th:nth-child(1) { width: 24%; }
th:nth-child(2) { width: 20%; }
th:nth-child(4) { width: 20%; }
@media (max-width: 640px) {
  thead { display: none; }
  table, tbody, tr, td { display: block; }
  tr { padding: 6px 0; border-bottom: 1px solid var(--border); }
  td { border: 0; padding: 1px 0; }
}
details { border: 1px solid var(--border); border-radius: 6px; margin: 6px 0; background: var(--panel); }
summary { cursor: pointer; padding: 6px 10px; }
pre { margin: 0; padding: 10px; border-top: 1px solid var(--border); overflow-x: auto;
      font: 12px/1.45 var(--mono); white-space: pre-wrap; }
</style>
</head>
<body>
<h1>Licenses</h1>
<p>This page runs a Rust compiler, a linker and a standard library in your browser, with the Rust
Playground's interface. They are built from the open-source software below, whose licenses ask that their
copyright notices and license texts come with them. <a href="../">Back to the playground</a>.</p>
BODY
</body>
</html>
"""


if __name__ == "__main__":
    main()
