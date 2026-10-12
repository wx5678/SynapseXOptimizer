import fs from "node:fs/promises";
import path from "node:path";

const endpoint = process.env.SYNAPSEX_CDP_ENDPOINT || "http://127.0.0.1:9223";
const outputRoot = path.resolve("artifacts/0.21.3-keybind-preview");
const captureWidth = Number(process.env.SYNAPSEX_CAPTURE_WIDTH || 0);
const captureHeight = Number(process.env.SYNAPSEX_CAPTURE_HEIGHT || 0);
const capturePrefix = process.env.SYNAPSEX_CAPTURE_PREFIX || "";

const pages = await fetch(`${endpoint}/json/list`).then((response) => response.json());
const page = pages.find((item) => item.type === "page" && String(item.title).includes("SynapseX"));
if (!page?.webSocketDebuggerUrl) throw new Error("SynapseX Electron page was not found on the CDP endpoint.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const exceptions = [];
const consoleErrors = [];
let nextId = 1;

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params?.exceptionDetails?.text || "Uncaught exception");
  if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") consoleErrors.push((message.params.args || []).map((item) => item.value ?? item.description ?? "").join(" "));
  if (message.method === "Log.entryAdded" && ["error", "warning"].includes(message.params?.entry?.level)) consoleErrors.push(message.params.entry.text || message.params.entry.level);
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  return result.result?.value;
}

async function waitFor(expression, timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function capture(fileName) {
  const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  await fs.mkdir(outputRoot, { recursive: true });
  const target = path.join(outputRoot, fileName);
  await fs.writeFile(target, Buffer.from(result.data, "base64"));
  return target;
}

await send("Runtime.enable");
await send("Page.enable");
await send("Log.enable");
if (captureWidth > 0 && captureHeight > 0) {
  await send("Emulation.setDeviceMetricsOverride", { width: captureWidth, height: captureHeight, deviceScaleFactor: 1, mobile: false });
}
await send("Page.reload", { ignoreCache: true });
await waitFor("document.readyState === 'complete'");

await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('按键方案库'));
  if (!button) throw new Error('按键方案库 navigation button not found');
  button.click();
  return true;
})()`);
await waitFor("document.body.innerText.includes('从现有账号保存方案')", 12000);
await waitFor("document.querySelector('button[title=\"预览所选方案\"]')", 12000);
await evaluate(`document.querySelector('button[title="预览所选方案"]').click()`);
await waitFor("document.querySelector('.keybind-preview-dialog')", 8000);
await new Promise((resolve) => setTimeout(resolve, 700));
const defaultScreenshot = await capture(`${capturePrefix}01-default.png`);

await evaluate(`(() => {
  const tabs = [...document.querySelectorAll('.keybind-bar-tabs button')];
  if (tabs.length < 3) throw new Error('Expected at least three shortcut-bar tabs');
  tabs[2].click();
  return tabs[2].getAttribute('aria-selected');
})()`);
await new Promise((resolve) => setTimeout(resolve, 300));
const selectedScreenshot = await capture(`${capturePrefix}02-third-bar-selected.png`);

const state = await evaluate(`({
  dialogVisible: Boolean(document.querySelector('.keybind-preview-dialog')),
  barCount: document.querySelectorAll('.keybind-layout-bar').length,
  tabCount: document.querySelectorAll('.keybind-bar-tabs button').length,
  selectedBar: document.querySelector('.keybind-bar-tabs button[aria-selected="true"]')?.textContent?.trim() || '',
  unresolvedSlots: document.querySelectorAll('.keybind-layout-cells .is-unresolved').length,
  overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  bodyText: document.querySelector('.keybind-preview-dialog')?.innerText?.slice(0, 1200) || ''
})`);

await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
await waitFor("!document.querySelector('.keybind-preview-dialog')", 4000);

socket.close();
console.log(JSON.stringify({ defaultScreenshot, selectedScreenshot, state, exceptions, consoleErrors }, null, 2));
