// The crates programs can use (crates/build.py): play.rust-lang.org's, a
// gzipped file per library in dist/crates, which add up to far more than a
// page should download up front. Each is a lazy file in the kernel's
// filesystem, fetched when rustc first opens it: when a program uses its
// crate. What is fetched is kept in Cache Storage, for the next visit, and
// `downloadAll` fetches everything there ahead of time.
//
// rustc loads every crate it is given with --extern when it looks for an
// import to suggest for a name it cannot resolve. So a program is only given
// the crates it names: a program can only use a crate by naming it.

import { File } from "../browser-kernel/fs.js";

const BASE = new URL("../dist/crates/", import.meta.url);
const CACHE = "crates";
const PARALLEL = 6;

async function gunzip(packed) {
  const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return res;
}

export class Crates {
  /** The crates in dist/crates/index.json, or null if there are none.
   *  `onDownload(crate)` is called when a crate ("name version") is first
   *  downloaded for a program. */
  static async load(onDownload) {
    let index;
    try {
      const res = await fetch(new URL("index.json", BASE));
      if (!res.ok) return null;
      index = await res.json();
    } catch {
      return null;
    }
    // Not in every browser, or in insecure contexts: then files are
    // fetched (and kept by the HTTP cache) each visit.
    const cache = await self.caches?.open(CACHE).catch(() => null) ?? null;
    const crates = new Crates(index, cache, onDownload);
    await crates.prune();
    return crates;
  }

  constructor(index, cache, onDownload) {
    this.index = index;
    this.cache = cache;
    this.onDownload = onDownload;
    /** The compressed files fetched this visit, by name. */
    this.packed = new Map();
    /** The crates downloaded this visit, reported once each. */
    this.downloaded = new Set();
  }

  /** The crates programs can use: [{ name, version, id }], `id` being the
   *  name a program uses (rand_0_8_8 for a second version of rand). */
  get list() {
    return this.index.crates;
  }

  url(name) {
    return new URL(`${name}.gz?v=${this.index.files[name].hash}`, BASE).href;
  }

  /** Put the files in `fs` under `dir`. They are evictable: a program reads
   *  a library into its own memory, so the kernel's copy is dropped when
   *  the program closes it, and unpacked again from `packed` next time. */
  mount(fs, dir) {
    const d = fs.mkdirp(dir);
    for (const [name, { size }] of Object.entries(this.index.files)) {
      d.entries.set(name, File.lazy(async () => gunzip(await this.fetch(name)), size, { evictable: true }));
    }
  }

  /** rustc's arguments for a program whose source files are `texts`. */
  args(dir, texts) {
    const words = new Set(texts.join("\n").match(/[A-Za-z_][A-Za-z0-9_]*/g));
    const args = ["-L", `dependency=${dir}`, "-Zwasm-proc-macros"];
    for (const [id, files] of Object.entries(this.index.externs)) {
      if (!words.has(id)) continue;
      for (const file of files) args.push("--extern", `${id}=${dir}/${file}`);
    }
    return args;
  }

  /** A file, compressed: from this visit, the cache, or the network. */
  async fetch(name) {
    let packed = this.packed.get(name);
    if (packed) return packed;
    const url = this.url(name);
    let res = await this.cache?.match(url);
    if (!res) {
      const { crate } = this.index.files[name];
      if (!this.downloaded.has(crate)) {
        this.downloaded.add(crate);
        this.onDownload(crate);
      }
      res = await fetchOk(url);
      await this.cache?.put(url, res.clone()).catch(() => {});
    }
    packed = new Uint8Array(await res.arrayBuffer());
    this.packed.set(name, packed);
    return packed;
  }

  /** Drop what the cache has of other builds of the crates. */
  async prune() {
    if (!this.cache) return;
    const current = new Set(Object.keys(this.index.files).map((name) => this.url(name)));
    for (const req of await this.cache.keys()) {
      if (!current.has(req.url)) await this.cache.delete(req);
    }
  }

  /** How much of the crates the cache has: { cacheable, files, total,
   *  savedFiles, saved }, sizes being of the downloads. */
  async status() {
    const all = Object.entries(this.index.files);
    const status = {
      cacheable: !!this.cache, files: all.length, total: 0, savedFiles: 0, saved: 0,
    };
    const kept = new Set(this.cache ? (await this.cache.keys()).map((r) => r.url) : []);
    for (const [name, { packed }] of all) {
      status.total += packed;
      if (kept.has(this.url(name))) {
        status.savedFiles++;
        status.saved += packed;
      }
    }
    return status;
  }

  /** Put every file in the cache; `progress(saved)` follows the bytes.
   *  Resolves with how many files could not be downloaded. */
  async downloadAll(progress) {
    if (!this.cache) throw new Error("This browser cannot keep the crates.");
    const kept = new Set((await this.cache.keys()).map((r) => r.url));
    const all = Object.entries(this.index.files);
    let saved = all.reduce((n, [name, f]) => n + (kept.has(this.url(name)) ? f.packed : 0), 0);
    const todo = all.filter(([name]) => !kept.has(this.url(name)));
    let failed = 0;
    const worker = async () => {
      for (let next; (next = todo.shift());) {
        const [name, { packed }] = next;
        try {
          const url = this.url(name);
          await this.cache.put(url, await fetchOk(url));
          saved += packed;
          progress(saved);
        } catch (e) {
          failed++;
          console.warn(`not downloaded: ${name}:`, e);
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    return failed;
  }

  /** Empty the cache. */
  async remove() {
    if (!this.cache) return;
    await self.caches.delete(CACHE);
    this.cache = await self.caches.open(CACHE);
  }
}
