// Headless Chrome over its DevTools protocol, with nothing to install: Node's
// own WebSocket talks to the Chrome on this machine. CHROME names another
// binary.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function chrome() {
  // Chrome picks a free port and writes it into the profile, so several can run at once.
  const profile = mkdtempSync(join(tmpdir(), "bazel-for-go-films-"));
  const child = spawn(CHROME, ["--headless=new", "--hide-scrollbars", "--mute-audio", "--force-color-profile=srgb", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  const note = join(profile, "DevToolsActivePort");
  for (let i = 0; !existsSync(note) || !readFileSync(note, "utf8").includes("\n"); i++) {
    if (i > 150) throw new Error(`no answer from ${CHROME}`);
    await sleep(100);
  }
  const [port, path] = readFileSync(note, "utf8").split("\n");
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  let last = 0;
  const pending = new Map();
  const thrown = []; // [session, message] of errors no one caught in a page
  socket.onmessage = ({ data }) => {
    const { id, result, error, method, params, sessionId } = JSON.parse(data);
    if (method === "Runtime.exceptionThrown") thrown.push([sessionId, params.exceptionDetails.exception?.description || params.exceptionDetails.text]);
    if (method === "Runtime.consoleAPICalled" && params.type === "error") thrown.push([sessionId, params.args.map((a) => a.value ?? a.description).join(" ")]);
    const waiting = pending.get(id);
    if (!waiting) return;
    pending.delete(id);
    if (error) waiting.reject(new Error(error.message));
    else waiting.resolve(result);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      pending.set(++last, { resolve, reject });
      socket.send(JSON.stringify({ id: last, method, params, sessionId }));
    });

  // A tab of width by height CSS pixels.
  async function tab({ width, height }) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const call = (method, params) => send(method, params, sessionId);
    await call("Page.enable");
    await call("Runtime.enable");
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    return {
      open: (url) => call("Page.navigate", { url }),
      // The value of an expression in the page; a promise is awaited.
      async run(expression) {
        const { result, exceptionDetails } = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
        return result.value;
      },
      errors: () => thrown.filter(([session]) => session === sessionId).map(([, message]) => message),
      // The tab as drawn now, as the bytes of a PNG.
      async picture() {
        const { data } = await call("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
        return Buffer.from(data, "base64");
      },
    };
  }

  async function close() {
    socket.close();
    const exited = once(child, "exit");
    child.kill();
    await exited;
    // Chrome's helpers may still be writing to the profile for a moment; a leftover temporary directory is harmless.
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {}
  }
  return { tab, close };
}
