import { spawn } from "node:child_process";
import fs from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.argv[2] || "http://127.0.0.1:4321";
const TAG = process.argv[3] || "dev";
const OUT = "F:/Github/Firefly/.shots/round5/";
fs.mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--ignore-certificate-errors",
  "--remote-debugging-port=9334", "--user-data-dir=F:/Github/Firefly/.shots/_dbg/cdp-profile2",
  "--window-size=1280,1000", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ver = null;
for (let i = 0; i < 60; i++) {
  try { ver = await (await fetch("http://127.0.0.1:9334/json/version")).json(); break; } catch { await sleep(250); }
}
if (!ver) { console.log("cdp not up"); process.exit(1); }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
await new Promise((r) => { ws.onopen = r; });

async function shot(page, file, opts = {}) {
  const t = await send("Target.createTarget", { url: BASE + page });
  const targetId = t.result.targetId;
  const a = await send("Target.attachToTarget", { targetId, flatten: true });
  const sid = a.result.sessionId;
  await send("Page.enable", {}, sid);
  await send("Runtime.enable", {}, sid);
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false }, sid);
  await sleep(opts.wait || 6500);
  // 悬停到竖排栏上，触发展开
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 40, y: 500, buttons: 0 }, sid);
  await sleep(900);
  const probe = await send("Runtime.evaluate", { expression: "JSON.stringify({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,railW:document.querySelector('.Header_pcHeaderContainer__Sy_8l')?.getBoundingClientRect().width, own:document.querySelector('.Header_pcHeaderContainer__Sy_8l')?.getBoundingClientRect(),social:document.querySelector('.ef-rail-social')?.getBoundingClientRect(),mark:document.querySelector('.ef-rail-mark')?.getBoundingClientRect(),capsule:document.querySelector('.Header_buttonFrameContainer__Uvshp')?.getBoundingClientRect(),black:document.querySelector('a.Header_buttonPreserveBg__rEZGT')?.getBoundingClientRect(),active:document.querySelector('.Header_active__jzCyf')?.getAttribute('href'),imgs:document.querySelectorAll('img').length})", returnByValue: true }, sid);
  console.log("PROBE " + page + " " + (probe.result?.result?.value ?? JSON.stringify(probe.result)));
  const box = opts.clip || { x: 0, y: 0, width: 1280, height: 1000, scale: 1 };
  const s = await send("Page.captureScreenshot", { format: "png", clip: box, captureBeyondViewport: true }, sid);
  fs.writeFileSync(OUT + file, Buffer.from(s.result.data, "base64"));
  console.log("shot " + OUT + file);
  await send("Target.closeTarget", { targetId });
}

await shot("/", TAG + "-home-top.png", { clip: { x: 0, y: 0, width: 640, height: 760, scale: 1 } });
await shot("/", TAG + "-home-bottom.png", { clip: { x: 0, y: 0, width: 640, height: 1000, scale: 1 } });
ws.close();
chrome.kill();
