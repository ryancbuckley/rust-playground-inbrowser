#!/bin/sh
# The page, built by build-web.sh, as a static site for a host that cannot
# send the COOP and COEP headers, such as GitHub Pages (web/coi-sw.js adds
# them), installable as an app that works offline: into build/pages, with
# the kernel's files copied in instead of the web/wasi-kernel link.
#
# The service worker is stamped on the way: CACHE gets a hash of the site's
# files and SHELL the list of them (but the crates, which crates.js caches as
# programs use them). So a deploy always replaces the installed app's cache,
# and nobody keeps a list by hand. web/coi-sw.js itself is not modified.
set -eu
cd "$(dirname "$0")/.."
test -f web/index.html || { echo "build the page first: scripts/build-web.sh" >&2; exit 1; }
rm -rf build/pages
mkdir -p build/pages/wasi-kernel
cp -R web/index.html web/coi-sw.js web/manifest.webmanifest web/icons web/dist web/kernel build/pages/
for f in kernel.js fs.js thread-worker.js LICENSE; do
  cp "web/wasi-kernel/$f" build/pages/wasi-kernel/
done
# Served as they are, without Jekyll.
touch build/pages/.nojekyll

python3 -I - build/pages <<'PY'
import hashlib, json, pathlib, re, sys
from urllib.parse import quote

site = pathlib.Path(sys.argv[1])
files = sorted(p for p in site.rglob("*") if p.is_file())
# Not the worker (fetched by the browser apart from the rest, and its hash
# would depend on itself), nor .nojekyll, nor the crates.
content = [p for p in files if p.name not in ("coi-sw.js", ".nojekyll")]
digest = hashlib.sha256()
for p in content:
    digest.update(str(p.relative_to(site)).encode())
    digest.update(p.read_bytes())
cache = f"playground-{digest.hexdigest()[:12]}"
# Relative to the worker, which is at the site's root: "./" is the page.
shell = ["./"] + [quote(str(p.relative_to(site))) for p in content
                  if not str(p.relative_to(site)).startswith("dist/crates/")]

sw = site / "coi-sw.js"
text = sw.read_text()
text, n1 = re.subn(r"^const CACHE = .*$", f"const CACHE = {json.dumps(cache)};", text, count=1, flags=re.M)
text, n2 = re.subn(r"^const SHELL = .*$", f"const SHELL = {json.dumps(shell)};", text, count=1, flags=re.M)
if not (n1 and n2):
    sys.exit("coi-sw.js has no `const CACHE = ...` / `const SHELL = ...` line to stamp")
sw.write_text(text)
kept = sum((site / p).stat().st_size for p in [str(q.relative_to(site)) for q in content]
           if not p.startswith("dist/crates/"))
print(f"stamped coi-sw.js: {cache}, {len(shell)} files kept offline ({kept / 1e6:.0f} MB)")
PY
du -sh build/pages
