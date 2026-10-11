// A small driver for a real Chrome over the DevTools protocol, and a static server for
// the app. No dependencies: Node 22 or later brings the WebSocket and fetch it needs.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};
const CHROMES = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
];

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Serves the repository the way any static host would, on a port of the system's choosing.
export function serve() {
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, "http://localhost").pathname));
    const file = join(ROOT, path.endsWith("/") ? `${path}index.html` : path);
    if (!file.startsWith(ROOT) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
    response.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() });
    });
  });
}

export async function launch() {
  const chrome = CHROMES.find((path) => path && existsSync(path));
  if (!chrome) throw new Error("No Chrome found. Set CHROME to the path of a Chrome or Chromium.");

  const profile = mkdtempSync(join(tmpdir(), "huectl-"));
  const child = spawn(
    chrome,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      // The sandbox needs privileges a CI container does not give.
      ...(process.env.CI ? ["--no-sandbox"] : []),
      "about:blank"
    ],
    { stdio: "ignore" }
  );

  const close = () => {
    child.kill();
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  };

  // Chrome writes the port it chose into its profile, a moment before it answers on it.
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 300; i += 1) {
    await sleep(50);
    if (!existsSync(portFile)) continue;
    const port = readFileSync(portFile, "utf8").split("\n")[0];
    if (await fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.ok, () => false)) {
      return { port, close };
    }
  }
  close();
  throw new Error("Chrome did not start");
}

export async function openPage(browser) {
  const target = await (
    await fetch(`http://127.0.0.1:${browser.port}/json/new?about:blank`, { method: "PUT" })
  ).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  let nextId = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") {
      errors.push(message.params.exceptionDetails.exception?.description ?? "uncaught exception");
    } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      errors.push(`${message.params.entry.text} ${message.params.entry.url ?? ""}`);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      nextId += 1;
      pending.set(nextId, { resolve, reject });
      socket.send(JSON.stringify({ id: nextId, method, params }));
    });

  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Network.enable");
  // Every load comes from the files on disk, never from the app's own offline cache.
  await send("Network.setBypassServiceWorker", { bypass: true });
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  // SLOW=4 runs the page on a quarter of the processor, to rehearse a slow machine.
  if (process.env.SLOW) await send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.SLOW) });

  const touch = (type, points) => send("Input.dispatchTouchEvent", { type, touchPoints: points });

  const page = {
    send,
    errors,
    async viewport({ width, height, scale = 2, mobile = true }) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile });
      await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: 5 });
    },
    // Loads a page and waits for the app to have built its keys, then a moment more.
    async goto(url, settle = 300) {
      await send("Page.navigate", { url });
      for (let i = 0; i < 200; i += 1) {
        await sleep(50);
        if (await page.eval(`document.readyState === "complete" && Boolean(document.querySelector("#presets .key"))`).catch(() => false)) break;
      }
      await sleep(settle);
    },
    async eval(expression) {
      const { result, exceptionDetails } = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? "evaluate failed");
      return result.value;
    },
    async tap(x, y) {
      await touch("touchStart", [{ x, y }]);
      await sleep(40);
      await touch("touchEnd", []);
    },
    // A finger dragged through the given points.
    async drag(points) {
      await touch("touchStart", [points[0]]);
      for (const point of points.slice(1)) {
        await touch("touchMove", [point]);
        await sleep(16);
      }
      await touch("touchEnd", []);
    },
    swipe(x1, y1, x2, y2, steps = 12) {
      return page.drag(
        Array.from({ length: steps + 1 }, (_, i) => ({
          x: x1 + ((x2 - x1) * i) / steps,
          y: y1 + ((y2 - y1) * i) / steps
        }))
      );
    },
    // A finger carried round a center, from one clock angle to another (0 is twelve o'clock).
    turn(cx, cy, radius, from, to, steps = 18) {
      return page.drag(
        Array.from({ length: steps + 1 }, (_, i) => {
          const angle = ((from + ((to - from) * i) / steps - 90) * Math.PI) / 180;
          return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
        })
      );
    },
    async click(x, y) {
      const base = { x, y, button: "left", clickCount: 1, pointerType: "mouse" };
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, pointerType: "mouse" });
      await send("Input.dispatchMouseEvent", { ...base, type: "mousePressed" });
      await send("Input.dispatchMouseEvent", { ...base, type: "mouseReleased" });
    },
    async key(key, code = key) {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
    },
    async shot(path) {
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(path, Buffer.from(data, "base64"));
    },
    // Where an element is on the screen: its center and its box.
    box(selector) {
      return page.eval(
        `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; })()`
      );
    },
    close: () => socket.close()
  };
  return page;
}
