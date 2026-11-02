// The kernel worker: owns the kernel (filesystem, processes), loads the
// toolchain, and compiles and runs programs for the page.
//
// Messages from the page:
//   { type: "run", id, source?, files?, crateType?, run?, emit?, opt?, edition?, tests?, color?,
//     clippy?, env?, timeoutMs? }
//       Compile the crate and run it. The crate is `source`, or `files`
//       ([{ name, content }], the crate root being src/main.rs or src/lib.rs),
//       compiled as a `crateType` crate (default "bin"). `tests` builds a test
//       harness (`--test`) instead. `run: false` only compiles. `emit` asks
//       for a textual form instead of a binary: "mir", "hir", "expanded"
//       (macros) or "metadata" (checking only, as with Clippy). `color`
//       (default true) asks rustc for colored diagnostics. `clippy` adds
//       Clippy's lints to the compiler's warnings. `env` is the program's
//       environment. `timeoutMs` kills the program if it runs longer.
//   { type: "format", id, source?, files?, edition? }
//       Format the crate (as in "run") with rustfmt, which is built into
//       rustc.wasm. Its done message has the files, formatted.
//   { type: "cancel", id }
//       Stop run `id`: kill its compiler or program, whichever is running.
//       (In Safari its compiler finishes, its output dropped: see
//       KILL_COMPILERS.)
//   { type: "download-crates" }  fetch all the crates into the browser's cache
//   { type: "remove-crates" }    empty that cache
// Messages to the page:
//   { type: "status", text }           what is happening (loading, compiling…)
//   { type: "ready", crates }          the toolchain is loaded; `crates` are the
//                                      crates programs can use: [{ name,
//                                      version, id }] (see crates.js)
//   { type: "crates", cacheable, files, total, savedFiles, saved,
//     downloading?, failed? }          how much of the crates the browser
//                                      keeps, in bytes to download
//   { type: "output", id, stream: "compiler" | "stdout" | "stderr", text }
//   { type: "done", id, stage: "compile" | "run", code, ms, timedOut?, output?, runs?, formatted? }
//                                      `output`: what `emit` asked for; `runs`:
//                                      whether a run (and its done) follows;
//                                      `formatted`: a format's files, [{ name,
//                                      content }] (or the source, a string)
//   { type: "error", id?, text }
//
// Diagnostics and panics name the files as Cargo would, src/main.rs, and
// the crate is called playground, as on play.rust-lang.org.

import { Kernel, OutOfMemoryError, importedMemory } from "../browser-kernel/kernel.js";
import { File } from "../browser-kernel/fs.js";
import { Crates } from "./crates.js";

const SYSROOT = "/sysroot";
const TARGET = "wasm32-wasip1-threads";
const SELF_CONTAINED = `${SYSROOT}/lib/rustlib/${TARGET}/lib/self-contained`;
const CRATES = "/crates";

function createBrowserWorker() {
  const w = new Worker(new URL("../browser-kernel/thread-worker.js", import.meta.url), { type: "module" });
  return {
    postMessage: (m) => w.postMessage(m),
    onMessage: (f) => { w.onmessage = (e) => f(e.data); },
    terminate: () => w.terminate(),
  };
}

const status = (text) => postMessage({ type: "status", text });

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return res;
}

/** The memory limits of the module in `res`, read from the start of the
 *  body without reading all of it. */
async function limitsOf(res) {
  const reader = res.body.getReader();
  let buf = new Uint8Array(0);
  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      const next = new Uint8Array(buf.length + value.length);
      next.set(buf);
      next.set(value, buf.length);
      buf = next;
    }
    const limits = importedMemory(buf);
    if (limits !== undefined || done) {
      reader.cancel();
      return limits;
    }
  }
}

/** Compile a gzipped toolchain program while it downloads. */
async function program(url, label) {
  const res = await fetchOk(url);
  const [forCompile, forLimits] = res.body.pipeThrough(new DecompressionStream("gzip")).tee();
  const wasm = new Response(forCompile, { headers: { "Content-Type": "application/wasm" } });
  const [module, limits] = await Promise.all([
    WebAssembly.compileStreaming(wasm),
    limitsOf(new Response(forLimits)),
  ]);
  status(`Loaded ${label}.`);
  return { module, limits };
}

async function bytesOf(res) {
  return new Uint8Array(await res.arrayBuffer());
}

/** Add a bundle (scripts/bundle.py) to the filesystem under `root`. Its
 *  files stay compressed until a program opens them: a compile reads about
 *  half of the standard library and crates. */
function addBundle(fs, bundle, root) {
  const view = new DataView(bundle.buffer, bundle.byteOffset);
  if (new TextDecoder().decode(bundle.subarray(0, 4)) !== "PGB2") throw new Error(`${root}: not a bundle`);
  const len = view.getUint32(4, true);
  const files = JSON.parse(new TextDecoder().decode(bundle.subarray(8, 8 + len)));
  const base = 8 + len;
  for (const [path, offset, length, size] of files) {
    // Copied out, so that the bundle itself can be freed.
    const bytes = bundle.slice(base + offset, base + offset + length);
    const file = length === size ? new File(bytes) : File.compressed(bytes, size);
    const parts = path.split("/");
    const name = parts.pop();
    fs.mkdirp(`${root}/${parts.join("/")}`).entries.set(name, file);
  }
}

// Memory limits, in 64 KiB pages: what a process may grow to. Browsers
// reserve the limit up front, as shared memory cannot move. Chrome and Firefox
// only reserve address space; Safari (WebKit, which every browser on iOS uses)
// counts it against a tight budget. Lists are tried in turn, largest first.
const MIB = 16;
const ua = self.navigator?.userAgent ?? "";
const WEBKIT = /AppleWebKit/.test(ua) && !/Chrome\/|Chromium\//.test(ua);
// Chrome says how much memory a device has, in GB (at most 8); Safari does not.
const LOW_MEMORY = (self.navigator?.deviceMemory ?? 8) < 4;
// Phones (iPads say they are Macs) have far less to go round: small limits
// from the start, as the largest of a list, tried first, could leave the
// linker and the program nothing.
const MOBILE = /Android|iPhone|iPod|Mobi/.test(ua);
// Where memory is scarce: no idle workers or prepared processes, which hold
// memories of their own, and smaller limits.
const THRIFTY = WEBKIT || LOW_MEMORY || MOBILE;
const limits = (mobile, thrifty, roomy) => (MOBILE ? mobile : THRIFTY ? thrifty : roomy).map((mib) => mib * MIB);
// The compiler uses 120 to 190 MiB for most programs (hello world to tokio;
// 260 for 2,500 lines), the linker under 50, programs a few.
const RUSTC_MAX_PAGES = limits([384, 256], [768, 512, 384, 256], [1024, 512]);
const LINKER_MAX_PAGES = limits([128, 64], [256, 128, 64], [256]);
// Programs are linked to allow all 4 GiB a 32-bit program can address.
const PROGRAM_MAX_PAGES = limits([256, 128, 64], [1024, 512, 256, 128, 64], [4096, 2048, 1024, 512]);

let kernel, rustc;
/** The crates programs can use (crates.js), or null. */
let crates = null;
/** The run whose compiler is running last, which a crate's download is
 *  reported to. */
let compiling = null;
let readyResolve;
const ready = new Promise((r) => (readyResolve = r));
const decoders = new Map();
// The process each run is waiting for, and the runs to stop.
const running = new Map();
const cancelled = new Set();

// One compiler runs at a time: a compile (or format) waits for the one
// before it. In Safari a cancelled compile is not killed but finishes, its
// output dropped, as if killed: a process killed while it runs wasm leaves
// a thread there that Safari can neither stop nor free the memory of
// (retireTimeout). Programs are still killed.
const KILL_COMPILERS = !WEBKIT;
const compilers = new WeakSet();
let compilerFree = Promise.resolve();

/** Wait for the compiler; returns the function that frees it. */
async function takeCompiler() {
  const before = compilerFree;
  let free;
  compilerFree = new Promise((resolve) => (free = resolve));
  await before;
  return free;
}

/** A crate is downloaded for the program being compiled: say so, as Cargo does. */
function reportDownload(crate) {
  const [name, version] = crate.split(" ");
  if (compiling !== null) {
    postMessage({ type: "output", id: compiling, stream: "compiler", text: `  Downloaded ${name} v${version}\n` });
  }
  status(`Downloading ${name}…`);
  // The cache has it once it is downloaded.
  setTimeout(postCratesStatus, 1000);
}

let downloading = false;
async function postCratesStatus(extra = {}) {
  if (!crates) return;
  postMessage({ type: "crates", ...(await crates.status()), downloading, ...extra });
}

async function downloadCrates() {
  await ready;
  if (!crates || downloading) return;
  downloading = true;
  const before = await crates.status();
  let last = 0;
  const failed = await crates.downloadAll((saved) => {
    // About ten times a second at most.
    if (performance.now() - last < 100) return;
    last = performance.now();
    postMessage({ type: "crates", ...before, saved, downloading: true });
  });
  downloading = false;
  postCratesStatus({ failed });
}

function textOf(id, stream, bytes) {
  const key = `${id}:${stream}`;
  if (!decoders.has(key)) decoders.set(key, new TextDecoder());
  return decoders.get(key).decode(bytes, { stream: true });
}

async function init() {
  try {
    status("Loading the Rust toolchain…");
    const [rustcProgram, wild, sysroot, crateIndex] = await Promise.all([
      program(new URL("../dist/rustc.wasm.gz", import.meta.url), "rustc"),
      program(new URL("../dist/wild.wasm.gz", import.meta.url), "linker"),
      fetchOk(new URL("../dist/sysroot.bundle", import.meta.url)).then(bytesOf),
      // Optional: crates programs can use (crates/build.py).
      Crates.load(reportDownload),
    ]);
    const linker = { ...wild, maxPages: LINKER_MAX_PAGES };
    const compiler = { ...rustcProgram, maxPages: RUSTC_MAX_PAGES };
    // Idle workers and prepared compiler and linker processes: each compile
    // starts several threads, and starting them is a good part of its time.
    kernel = new Kernel({
      createWorker: createBrowserWorker, programs: { "wasm-ld": linker }, pool: THRIFTY ? 0 : 4,
      // Safari neither stops a worker terminated while it runs wasm nor
      // frees its memory: let a killed process's threads run on to their
      // next system call, where they close themselves.
      retireTimeout: WEBKIT ? null : 1000,
    });
    if (!THRIFTY) {
      kernel.keepWarm(compiler);
      kernel.keepWarm(linker);
    }
    addBundle(kernel.fs, sysroot, SYSROOT);
    crates = crateIndex;
    crates?.mount(kernel.fs, CRATES);
    kernel.fs.mkdirp("/tmp");
    kernel.fs.mkdirp("/work");
    rustc = compiler;
    status("Ready.");
    postMessage({ type: "ready", crates: crates?.list ?? [] });
    readyResolve();
    postCratesStatus();
  } catch (e) {
    postMessage({ type: "error", text: `Failed to load the toolchain: ${e.message}` });
  }
}

// What rustc writes for each `emit`, instead of a binary.
const EMIT_ARGS = {
  mir: ["--emit=mir"],
  hir: ["-Zunpretty=hir"],
  expanded: ["-Zunpretty=expanded"],
  metadata: ["--emit=metadata"],
};

/** Write the crate's files into `dir`; returns the path of its root. */
function writeCrate(fs, dir, { source, files, crateType, tests }) {
  const lib = !tests && crateType && crateType !== "bin";
  if (files === undefined) files = [{ name: lib ? "src/lib.rs" : "src/main.rs", content: source }];
  for (const { name, content } of files) {
    // Names are relative and stay inside the crate's directory.
    if (name.split("/").some((part) => part === "" || part === "." || part === "..")) continue;
    fs.writeFile(`${dir}/${name}`, content);
  }
  const names = files.map((f) => f.name);
  const root = (lib ? ["src/lib.rs", "src/main.rs"] : ["src/main.rs", "src/lib.rs"]).find((n) => names.includes(n));
  return `${dir}/${root ?? files[0]?.name ?? "src/main.rs"}`;
}

async function run(req) {
  const { id, opt, edition, tests, color, clippy, env, timeoutMs, emit } = req;
  const crateType = req.crateType ?? "bin";
  await ready;
  const fs = kernel.fs;
  const dir = `/work/${id}`;
  const outFile = `${dir}/out`;
  // Nothing more from a cancelled run, which may still be compiling.
  const out = (stream) => (b) => {
    if (!cancelled.has(id)) postMessage({ type: "output", id, stream, text: textOf(id, stream, b) });
  };
  let t0;
  let code;
  const freeCompiler = await takeCompiler();
  try {
    // Every run ends with a done message, a cancelled one too.
    if (cancelled.delete(id)) {
      postMessage({ type: "done", id, stage: "compile", code: 137, ms: 0 });
      return;
    }
    fs.mkdirp(dir);
    const root = writeCrate(fs, dir, req);
    status("Compiling…");
    t0 = performance.now();
    compiling = id;
    const texts = req.files ? req.files.map((f) => f.content) : [req.source];
    const compile = kernel.spawn(rustc, {
      args: [
        "rustc", root, `--edition=${edition ?? "2024"}`, "--crate-name=playground",
        ...(tests ? ["--test"] : [`--crate-type=${crateType}`]),
        ...(EMIT_ARGS[emit] ?? []),
        `--target=${TARGET}`, `--sysroot=${SYSROOT}`,
        "-o", outFile, `-Copt-level=${opt ?? 0}`,
        // Paths relative to the crate: src/main.rs.
        `--remap-path-prefix=${dir}/=`,
        // The target's C runtime and libc, passed by hand: this rustc's
        // target spec does not allow -Clink-self-contained.
        "-Clinker=wasm-ld", "-Clinker-flavor=wasm-ld",
        `-Clink-arg=${SELF_CONTAINED}/crt1-command.o`, "-L", SELF_CONTAINED,
        // Instead of the target's 1 GiB: the kernel decides what is reserved.
        "-Clink-arg=--max-memory=4294967296",
        `--color=${color === false ? "never" : "always"}`, "-Zthreads=1",
        // The crates the program names. Their proc macros are wasm modules,
        // which rustc runs in its interpreter.
        ...(crates?.args(CRATES, texts) ?? []),
      ],
      // RUSTC_CLIPPY: this rustc has Clippy built in.
      env: { RUST_BACKTRACE: "0", HOME: "/tmp", TMPDIR: "/tmp", ...(clippy ? { RUSTC_CLIPPY: "1" } : {}) },
      stdout: out("compiler"),
      stderr: out("compiler"),
    });
    compilers.add(compile);
    running.set(id, compile);
    code = await compile.exited;
  } finally {
    freeCompiler();
  }
  // Cancelled: as if killed, though in Safari it ran to its end.
  if (cancelled.has(id)) code = 137;
  if (compiling === id) compiling = null;
  const built = fs.readFile(outFile);
  const output = emit && emit !== "metadata" && built ? new TextDecoder().decode(built) : undefined;
  const runs = code === 0 && !!built && req.run !== false && !emit && (tests || crateType === "bin");
  postMessage({ type: "done", id, stage: "compile", code, ms: performance.now() - t0, output, runs });
  if (!runs || cancelled.has(id)) {
    if (runs) postMessage({ type: "done", id, stage: "run", code: 137, ms: 0 });
    running.delete(id);
    cancelled.delete(id);
    fs.remove(dir);
    status("Ready.");
    return;
  }

  status("Running…");
  t0 = performance.now();
  const bytes = built.slice();
  fs.remove(dir);
  const module = await WebAssembly.compile(bytes);
  if (cancelled.delete(id)) {
    running.delete(id);
    postMessage({ type: "done", id, stage: "run", code: 137, ms: 0 });
    status("Ready.");
    return;
  }
  const proc = kernel.spawn({ bytes, module, maxPages: PROGRAM_MAX_PAGES }, {
    // Tests run in this process: with panic=abort, libtest would otherwise
    // run each test in a subprocess, and WASI cannot start one.
    args: tests ? ["playground", "-Zunstable-options", "--force-run-in-process"] : ["playground"],
    env: env ?? {},
    stdout: out("stdout"),
    stderr: out("stderr"),
  });
  running.set(id, proc);
  let timedOut = false;
  const timer = timeoutMs
    ? setTimeout(() => { timedOut = true; kernel.kill(proc); }, timeoutMs)
    : null;
  const runCode = await proc.exited;
  clearTimeout(timer);
  running.delete(id);
  cancelled.delete(id);
  postMessage({ type: "done", id, stage: "run", code: runCode, ms: performance.now() - t0, timedOut });
  status("Ready.");
}

async function format(req) {
  const { id, source, files, edition } = req;
  await ready;
  const fs = kernel.fs;
  const dir = `/work/${id}`;
  // rustfmt names files by the paths it was given: name them as in the crate.
  let messages = "";
  const collect = (b) => { messages += textOf(id, "compiler", b); };
  let root, t0, code;
  const freeCompiler = await takeCompiler();
  try {
    if (cancelled.delete(id)) {
      postMessage({ type: "done", id, stage: "compile", code: 137, ms: 0, runs: false });
      return;
    }
    fs.mkdirp(dir);
    root = writeCrate(fs, dir, req);
    status("Formatting…");
    t0 = performance.now();
    const proc = kernel.spawn(rustc, {
      args: ["rustfmt", `--edition=${edition ?? "2024"}`, root],
      // RUSTC_RUSTFMT: this rustc has rustfmt built in.
      env: { RUSTC_RUSTFMT: "1", HOME: "/tmp", TMPDIR: "/tmp" },
      stdout: collect,
      stderr: collect,
    });
    compilers.add(proc);
    running.set(id, proc);
    code = await proc.exited;
  } finally {
    freeCompiler();
  }
  running.delete(id);
  if (cancelled.delete(id)) {
    // As if killed, though in Safari it ran to its end.
    fs.remove(dir);
    postMessage({ type: "done", id, stage: "compile", code: 137, ms: performance.now() - t0, runs: false });
    status("Ready.");
    return;
  }
  if (messages) postMessage({ type: "output", id, stream: "compiler", text: messages.replaceAll(`${dir}/`, "") });
  const read = (name, original) => {
    const bytes = fs.readFile(`${dir}/${name}`);
    return bytes ? new TextDecoder().decode(bytes) : original;
  };
  const formatted = files
    ? files.map((f) => ({ name: f.name, content: read(f.name, f.content) }))
    : read(root.slice(dir.length + 1), source);
  fs.remove(dir);
  postMessage({ type: "done", id, stage: "compile", code, ms: performance.now() - t0, runs: false, formatted });
  status("Ready.");
}

/** An error for the page: its name and message, then where it happened.
 *  (Chrome's `stack` starts with the name and message; Safari's has only the
 *  frames.) */
function errorText(err) {
  if (err instanceof OutOfMemoryError) return err.message;
  if (!(err instanceof Error)) return String(err);
  let frames = err.stack ?? "";
  if (frames.startsWith(`${err.name}:`)) frames = frames.split("\n").slice(1).join("\n");
  return `${err.name}: ${err.message}${frames ? `\n${frames}` : ""}`;
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === "run") {
    run(m).catch((err) => postMessage({ type: "error", id: m.id, text: errorText(err) }));
  } else if (m.type === "format") {
    format(m).catch((err) => postMessage({ type: "error", id: m.id, text: errorText(err) }));
  } else if (m.type === "download-crates") {
    downloadCrates().catch((err) => postCratesStatus({ failed: -1, error: errorText(err) }));
  } else if (m.type === "remove-crates") {
    crates?.remove().then(() => postCratesStatus());
  } else if (m.type === "cancel") {
    cancelled.add(m.id);
    const proc = running.get(m.id);
    if (proc && (KILL_COMPILERS || !compilers.has(proc))) kernel.kill(proc);
  }
};

init();
