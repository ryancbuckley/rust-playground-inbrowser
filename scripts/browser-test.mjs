// End-to-end test in headless Chrome: load the playground, run an example,
// and print what the output pane shows.
//
//   node scripts/browser-test.mjs [--example NAME] [--source FILE] [--url URL]
//       [--theme light|dark] [--mode debug|release] [--screenshot FILE.png]
//       [--autorun] [--no-clippy] [--action NAME] [--tool NAME]
//
// It turns auto-run off and clicks Run (or, with --action, the item of the
// menu next to it named NAME: Build, Test, MIR, HIR; with --tool, that of
// the Tools menu: Clippy, Expand macros, Rustfmt, after which it prints the
// code too). With --autorun it
// leaves auto-run on: it waits for the run when the page is ready, then
// makes the change (--example or --source) and waits for the run that
// follows.
//
// Needs the page served with COOP/COEP headers (web/serve.py) and Chrome.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const url = opt("url", "http://127.0.0.1:8000/");
const example = opt("example", null);
const sourceFile = opt("source", null);
const timeoutMs = Number(opt("timeout", "300000"));
const screenshot = opt("screenshot", null);
const theme = opt("theme", null);
const mode = opt("mode", null);
const action = opt("action", null);
const tool = opt("tool", null);
const autorun = args.includes("--autorun");
const noClippy = args.includes("--no-clippy");
// Chrome, or set CHROME (Chromium works too).
const chrome = process.env.CHROME ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "google-chrome");

const profile = mkdtempSync(join(tmpdir(), "playground-chrome-"));
const proc = spawn(chrome, [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

const wsUrl = await new Promise((resolve, reject) => {
  let buf = "";
  proc.stderr.on("data", (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) resolve(m[1]);
  });
  proc.on("exit", () => reject(new Error("chrome exited")));
});

const browser = new WebSocket(wsUrl);
await new Promise((r) => (browser.onopen = r));
let nextId = 1;
const pending = new Map();
const listeners = [];
browser.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  } else {
    for (const l of listeners) l(m);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    browser.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Runtime.enable", {}, sessionId);
listeners.push((m) => {
  if (m.method === "Runtime.consoleAPICalled" && m.sessionId === sessionId) {
    console.log(`[console.${m.params.type}]`, m.params.args.map((a) => a.value ?? a.description).join(" "));
  }
  if (m.method === "Runtime.exceptionThrown") {
    console.log("[exception]", m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  }
});
// The configuration, in the page's storage before it starts (local_storage.ts).
const configuration = {
  ...(autorun ? {} : { autoRun: false }),
  ...(noClippy ? { clippyOnRun: false } : {}),
  ...(theme ? { theme } : {}),
};
await send("Page.enable", {}, sessionId);
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `try {
    if (!sessionStorage.getItem("configured")) {
      localStorage.setItem("redux", ${JSON.stringify(JSON.stringify({ version: 2, configuration }))});
      sessionStorage.setItem("configured", "1");
    }
  } catch {}`,
}, sessionId);
await send("Page.navigate", { url: mode ? `${url}?mode=${mode}` : url }, sessionId);

const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;

const deadline = Date.now() + timeoutMs;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();

const outputText = `(() => {
  const pane = document.querySelector('[data-test-id="output"]');
  return pane ? pane.innerText : "";
})()`;
const executing = `document.querySelector('[data-test-id="execution-control"]')?.dataset.executing === "true"`;
const busy = `(${executing}) || !!document.querySelector('[data-test-id="output-loader"]')`;

// Wait for the toolchain.
let lastStatus = "";
for (;;) {
  const s = await evaluate(`JSON.stringify({
    status: document.querySelector('[data-test-id="toolchain-status"]')?.textContent ?? "",
    loaded: !!document.querySelector('[data-test-id="header"]'),
    isolated: self.crossOriginIsolated })`).catch(() => null);
  const st = s && JSON.parse(s);
  if (st && st.status !== lastStatus) {
    lastStatus = st.status;
    console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${st.status || "Ready."}`);
  }
  if (st?.loaded && !st.status) break;
  if (st && /Failed|needs cross-origin|Error/.test(st.status)) process.exit(1);
  if (Date.now() > deadline) throw new Error("timed out loading");
  await sleep(250);
}

/** Wait for a run to start (if `start`), then to finish; returns the output pane's text. */
async function finished(start) {
  if (start) {
    while (!(await evaluate(busy))) {
      if (Date.now() > deadline) throw new Error("timed out waiting for a run");
      await sleep(50);
    }
  }
  while (await evaluate(busy)) {
    if (Date.now() > deadline) throw new Error("timed out running");
    await sleep(250);
  }
  return evaluate(outputText);
}

/** Open the header's menu behind `button` and click its item `name`. */
async function menuItem(button, name) {
  await evaluate(`document.querySelector('[data-test-id="header"] ${button}').click()`);
  await sleep(100);
  await evaluate(`(() => {
    const names = [...document.querySelectorAll('[data-test-id="button-menu-item__name"]')];
    names.find((n) => n.textContent === ${JSON.stringify(name)}).closest("button").click();
  })()`);
}

if (autorun) {
  console.log("---- output of the run on load ----\n" + await finished(true));
}

if (example) await menuItem('button[title="Load an example program"]', example);
if (sourceFile) {
  await evaluate(`window.rustPlayground.setCode(${JSON.stringify(readFileSync(sourceFile, "utf8"))})`);
}
if (!autorun) {
  if (action) {
    await menuItem('button[title="Select what to build"]', action);
  } else if (tool) {
    await menuItem('button[title="Run extra tools on the source code"]', tool);
  } else {
    // The primary button: Run, Build or Test, as the code calls for.
    await evaluate(`document.querySelector('[data-test-id="header"] button').click()`);
  }
}
const out = await finished(true);
console.log("---- output ----\n" + out);
if (tool === "Rustfmt") {
  // A successful format closes the output: the code is the result.
  console.log("---- code ----\n" + await evaluate(`JSON.parse(localStorage.getItem("redux")).code`));
}
if (screenshot) {
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 700, deviceScaleFactor: 1, mobile: false }, sessionId);
  await sleep(300);
  const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  (await import("node:fs")).writeFileSync(screenshot, Buffer.from(data, "base64"));
}

browser.close();
proc.kill();
await new Promise((r) => setTimeout(r, 500));
try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still be writing it */ }
process.exit(0);
