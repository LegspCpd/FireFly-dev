import { spawn } from "node:child_process";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--ignore-certificate-errors",
  "--remote-debugging-port=9336", "--user-data-dir=F:/Github/Firefly/.shots/_dbg/cdp-profile4",
  "--window-size=1280,1000", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ver = null;
for (let i = 0; i < 60; i++) { try { ver = await (await fetch("http://127.0.0.1:9336/json/version")).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
await new Promise((r) => { ws.onopen = r; });
const t = await send("Target.createTarget", { url: "http://127.0.0.1:4321/" });
const sid = (await send("Target.attachToTarget", { targetId: t.result.targetId, flatten: true })).result.sessionId;
await send("Page.enable", {}, sid); await send("Runtime.enable", {}, sid);
await send("Page.bringToFront", {}, sid);
await sleep(6000);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 30, y: 500, buttons: 0 }, sid);
await sleep(800);
const r = await send("Runtime.evaluate", { expression: "JSON.stringify({n:[...document.querySelectorAll(':hover')].length, railW:document.querySelector('.Header_pcHeaderContainer__Sy_8l').getBoundingClientRect().width})", returnByValue: true }, sid);
console.log("R", JSON.stringify(r.result).slice(0, 800));
ws.close(); chrome.kill();
