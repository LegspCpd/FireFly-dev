import { spawn } from "node:child_process";
import fs from "node:fs";
console.log("start");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--ignore-certificate-errors",
  "--remote-debugging-port=9338", "--user-data-dir=F:/Github/Firefly/.shots/_dbg/cdp-p6",
  "--window-size=1280,1000", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ver = null;
for (let i = 0; i < 60; i++) { try { ver = await (await fetch("http://127.0.0.1:9338/json/version")).json(); break; } catch { await sleep(250); } }
console.log("ver", !!ver);
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
await new Promise((r) => { ws.onopen = r; });
console.log("ws open");
const t = await send("Target.createTarget", { url: "http://127.0.0.1:4321/" });
console.log("target", !!t.result);
const sid = (await send("Target.attachToTarget", { targetId: t.result.targetId, flatten: true })).result.sessionId;
await send("Page.enable", {}, sid); await send("Runtime.enable", {}, sid); await send("Page.bringToFront", {}, sid);
console.log("attached");
await sleep(7000);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 30, y: 500, buttons: 0 }, sid);
await sleep(900);
const probe = await send("Runtime.evaluate", { expression: "JSON.stringify({railW:Math.round(document.querySelector('.Header_pcHeaderContainer__Sy_8l').getBoundingClientRect().width)})", returnByValue: true }, sid);
console.log("probe", probe.result?.result?.value);
const s = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 260, height: 1000, scale: 1 }, captureBeyondViewport: false }, sid);
console.log("shot", s.result ? s.result.data.length : JSON.stringify(s).slice(0, 200));
fs.writeFileSync("F:/Github/Firefly/.shots/round5/t1.png", Buffer.from((s.result||{}).data || "", "base64"));
ws.close(); chrome.kill();
console.log("done");
