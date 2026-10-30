#!/usr/bin/env python3
"""Pack a directory into the playground's bundle format.

Bundle: the magic bytes PGB2, a little-endian u32 header length, a JSON
header listing [path, offset, length, size] for each file, then the files.
Each file is compressed on its own (raw deflate) unless that does not make
it smaller; a file is stored as is when its length equals its size. Files
compressed separately can stay compressed in the browser until a program
opens them.

Usage: bundle.py <dir> <out.bundle> [--exclude glob]...
"""

import fnmatch
import json
import pathlib
import struct
import sys
import zlib


def deflate(data):
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    return c.compress(data) + c.flush()


def main():
    src, out, *rest = sys.argv[1:]
    excludes = [rest[i + 1] for i, a in enumerate(rest) if a == "--exclude"]
    root = pathlib.Path(src)
    entries, blobs, offset, size = [], [], 0, 0
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        rel = path.relative_to(root).as_posix()
        if any(fnmatch.fnmatch(rel, pat) for pat in excludes):
            continue
        data = path.read_bytes()
        packed = deflate(data)
        if len(packed) >= len(data):
            packed = data
        entries.append([rel, offset, len(packed), len(data)])
        blobs.append(packed)
        offset += len(packed)
        size += len(data)
    header = json.dumps(entries).encode()
    with open(out, "wb") as f:
        f.write(b"PGB2")
        f.write(struct.pack("<I", len(header)))
        f.write(header)
        for b in blobs:
            f.write(b)
    print(f"{out}: {len(entries)} files, {size / 1e6:.1f} MB, {offset / 1e6:.1f} MB compressed")


if __name__ == "__main__":
    main()
