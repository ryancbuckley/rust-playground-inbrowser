// The compiler runs in this browser: a worker (web/kernel/kernel-worker.js,
// served next to the page and not bundled) loads rustc.wasm, compiles and
// runs code. The page talks to it here, where the Rust Playground talks to
// its server.
import { Code, Crate, Edition, Mode } from './types';

export type Emit = 'mir' | 'hir' | 'expanded' | 'metadata';

export interface RunRequest {
  code: Code;
  mode: Mode;
  edition: Edition;
  crateType: string;
  tests: boolean;
  /** Only compile. */
  run?: boolean;
  /** A textual form instead of a binary (see the worker). */
  emit?: Emit;
  clippy?: boolean;
  timeoutMs?: number;
}

export interface RunHandlers {
  output?: (stream: 'compiler' | 'stdout' | 'stderr', text: string) => void;
  /** The compiler finished; `runs` says whether the program runs next.
   *  A format has the code, formatted. */
  compiled?: (result: {
    code: number;
    ms: number;
    output?: string;
    runs: boolean;
    formatted?: Code;
  }) => void;
  /** The program finished (or was stopped). */
  exited?: (result: { code: number; ms: number; timedOut: boolean; cancelled: boolean }) => void;
  error?: (text: string) => void;
}

/** How much of the crates the browser keeps, in bytes to download. */
export interface CratesStatus {
  /** Whether the browser can keep them (Cache Storage). */
  cacheable: boolean;
  files: number;
  total: number;
  savedFiles: number;
  saved: number;
  /** Downloading them all. */
  downloading: boolean;
  /** How many could not be downloaded, after downloading them all. */
  failed?: number;
}

export interface ToolchainEvents {
  status: (text: string) => void;
  ready: (crates: Crate[]) => void;
  crates: (status: CratesStatus) => void;
  error: (text: string) => void;
}

const OPT_LEVEL: Record<Mode, number> = { debug: 0, release: 3 };

let worker: Worker | null = null;
const runs = new Map<number, RunHandlers>();
const cancelled = new Set<number>();
let nextId = 1;

/** Start the worker, which starts loading the toolchain. */
export function connect(events: ToolchainEvents) {
  if (!crossOriginIsolated) {
    // About to reload under the service worker that isolates it (index.ejs).
    if ((window as { coiReloading?: boolean }).coiReloading) return;
    events.error(
      'This page needs cross-origin isolation (the COOP and COEP headers) for SharedArrayBuffer. ' +
        'Serve it with web/serve.py.',
    );
    return;
  }
  worker = new Worker(new URL('kernel/kernel-worker.js', document.baseURI), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data;
    const handlers = m.id === undefined ? undefined : runs.get(m.id);
    if (m.type === 'status') {
      events.status(m.text);
    } else if (m.type === 'ready') {
      events.ready(m.crates);
    } else if (m.type === 'crates') {
      const { type: _, ...status } = m;
      events.crates(status);
    } else if (m.type === 'error' && !handlers) {
      events.error(m.text);
    } else if (!handlers) {
      return;
    } else if (m.type === 'error') {
      finish(m.id);
      handlers.error?.(m.text);
    } else if (m.type === 'output') {
      handlers.output?.(m.stream, m.text);
    } else if (m.type === 'done' && m.stage === 'compile') {
      if (!m.runs) finish(m.id);
      handlers.compiled?.({
        code: m.code,
        ms: m.ms,
        output: m.output,
        runs: !!m.runs,
        formatted: m.formatted,
      });
    } else if (m.type === 'done') {
      const wasCancelled = cancelled.has(m.id);
      finish(m.id);
      handlers.exited?.({
        code: m.code,
        ms: m.ms,
        timedOut: !!m.timedOut,
        cancelled: wasCancelled,
      });
    }
  };
}

function finish(id: number) {
  runs.delete(id);
  cancelled.delete(id);
}

/** Compile, and run unless asked not to. Returns the run's id. */
export function run(request: RunRequest, handlers: RunHandlers): number {
  const id = nextId++;
  if (!worker) {
    queueMicrotask(() => handlers.error?.('The Rust toolchain is not available.'));
    return id;
  }
  runs.set(id, handlers);
  const { code, mode, ...rest } = request;
  worker.postMessage({
    type: 'run',
    id,
    ...(typeof code === 'string' ? { source: code } : { files: code }),
    ...rest,
    opt: OPT_LEVEL[mode],
    // The page highlights diagnostics itself (highlighting.ts).
    color: false,
  });
  return id;
}

/** Download all the crates, for the browser to keep. */
export function downloadCrates() {
  worker?.postMessage({ type: 'download-crates' });
}

/** Forget the crates the browser keeps. */
export function removeCrates() {
  worker?.postMessage({ type: 'remove-crates' });
}

/** Stop a run: its compiler or its program, whichever is running. */
export function cancel(id: number) {
  if (!runs.has(id)) return;
  cancelled.add(id);
  worker?.postMessage({ type: 'cancel', id });
}

export interface CompileResult {
  success: boolean;
  /** What `emit` asked for. */
  code: string;
  /** Nothing: the program does not run. */
  stdout?: string;
  /** The compiler's diagnostics. */
  stderr: string;
}

/** Compile without running; `signal` cancels it. */
export function compile(request: RunRequest, signal?: AbortSignal): Promise<CompileResult> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const id = run(
      { ...request, run: false },
      {
        output: (_stream, text) => {
          stderr += text;
        },
        compiled: ({ code, output }) => {
          signal?.removeEventListener('abort', abort);
          resolve({ success: code === 0, code: output ?? '', stderr });
        },
        error: (text) => {
          signal?.removeEventListener('abort', abort);
          reject(new Error(text));
        },
      },
    );
    const abort = () => cancel(id);
    signal?.addEventListener('abort', abort);
  });
}

export interface FormatResult {
  success: boolean;
  /** The code, formatted (unchanged if it could not be). */
  code: Code;
  stdout?: string;
  /** rustfmt's messages. */
  stderr: string;
}

/** Format the code with rustfmt (built into rustc.wasm); `signal` cancels it. */
export function format(
  request: { code: Code; edition: Edition },
  signal?: AbortSignal,
): Promise<FormatResult> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    if (!worker) {
      reject(new Error('The Rust toolchain is not available.'));
      return;
    }
    let stderr = '';
    const abort = () => cancel(id);
    runs.set(id, {
      output: (_stream, text) => {
        stderr += text;
      },
      compiled: ({ code, formatted }) => {
        signal?.removeEventListener('abort', abort);
        resolve({ success: code === 0, code: formatted ?? request.code, stderr });
      },
      error: (text) => {
        signal?.removeEventListener('abort', abort);
        reject(new Error(text));
      },
    });
    signal?.addEventListener('abort', abort);
    const { code, edition } = request;
    worker.postMessage({
      type: 'format',
      id,
      ...(typeof code === 'string' ? { source: code } : { files: code }),
      edition,
    });
  });
}

/** Which Rust this is (scripts/build-web.sh writes toolchain.json). */
export async function version(): Promise<string | undefined> {
  try {
    const res = await fetch(new URL('dist/toolchain.json', document.baseURI));
    return res.ok ? (await res.json()).rust : undefined;
  } catch {
    return undefined;
  }
}
