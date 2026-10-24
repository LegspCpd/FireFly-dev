import { spawn } from "node:child_process";
import fs from "node:fs";
const log = (m) => { fs.appendFileSync("F:/Github/Firefly/.shots/_dbg/shot2.log", m + "\n"); };
log("start " + new Date().toISOString());
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.argv[2];
const PAGE = process.argv[3] || "/";
const TAG = process.argv[4] || "local";
const OUT = "F:/Github/Firefly/.shots/round5/";
fs.mkdirSync(OUT, { recursive: true });
const PORT = 9342;
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--ignore-certificate-errors",
  "--remote-debugging-port=" + PORT, "--user-data-dir=C:/tmp/efcdp/p" + PORT,
  "--window-size=1280,1000", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ver = null;
for (let i = 0; i < 80; i++) { try { ver = await (await fetch("http://127.0.0.1:" + PORT + "/json/version")).json(); break; } catch { await sleep(250); } }
log("ver " + !!ver);
if (!ver) process.exit(1);
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
ws.onerror = (e) => log("ws error " + (e && e.message ? e.message : "?"));
const send = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
await new Promise((r) => { ws.onopen = r; });
log("ws open");
const t = await send("Target.createTarget", { url: BASE + PAGE });
const sid = (await send("Target.attachToTarget", { targetId: t.result.targetId, flatten: true })).result.sessionId;
await send("Page.enable", {}, sid); await send("Runtime.enable", {}, sid); await send("Page.bringToFront", {}, sid);
log("attached");
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true }, sid)).result?.result?.value;
await sleep(9000);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 30, y: 500, buttons: 0 }, sid);
await sleep(1000);
const w = await ev("Math.round(document.querySelector('.Header_pcHeaderContainer__Sy_8l')?.getBoundingClientRect().width||0)");
log("hoverW " + w);
if (!(w > 150)) {
  await ev("(()=>{const s=document.createElement('style');s.textContent='.Header_pcHeaderContainer__Sy_8l{width:calc(22.5 * var(--efu))!important}'+'.Header_pcHeaderContainer__Sy_8l .Header_buttonFrameContainer__Uvshp{width:calc(10.25 * var(--efu))!important}'+'.Header_pcHeaderContainer__Sy_8l .Header_navItem__c_fLB .Header_textWrapper__o9aHt{opacity:1!important;transform:translate3d(0,-50%,0)!important}'+'.Header_pcHeaderContainer__Sy_8l .Header_buttonFrameContainer__Uvshp .Header_button__b0gdu .Header_textWrapper__o9aHt{opacity:1!important;transform:translate3d(0,-50%,0)!important}';document.head.appendChild(s);return 1})()");
  await sleep(800);
}
log("PROBE " + (await ev("JSON.stringify({efu:getComputedStyle(document.documentElement).getPropertyValue('--efu'),sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,railW:Math.round(document.querySelector('.Header_pcHeaderContainer__Sy_8l').getBoundingClientRect().width),railH:Math.round(document.querySelector('.Header_pcHeaderContainer__Sy_8l').getBoundingClientRect().height),capsule:document.querySelector('.Header_buttonFrameContainer__Uvshp').getBoundingClientRect().toJSON(),black:document.querySelector('a.Header_buttonPreserveBg__rEZGT').getBoundingClientRect().toJSON(),social:document.querySelector('.ef-rail-social').getBoundingClientRect().toJSON(),mark:document.querySelector('.ef-rail-mark').getBoundingClientRect().toJSON(),tiles:[...document.querySelectorAll('.ef-rail-social a')].map(a=>Math.round(a.getBoundingClientRect().width)),active:document.querySelector('[data-ef-rail] .Header_active__jzCyf')?.getAttribute('href'),overlayW:getComputedStyle(document.querySelector('[data-ef-rail] .Header_active__jzCyf'),'::after').width,imgs:document.querySelectorAll('img').length})")));
for (const [suffix, clip] of [
  ["-rail.png", { x: 0, y: 0, width: 300, height: 1000, scale: 1 }],
  ["-rail-bottom.png", { x: 0, y: 640, width: 300, height: 360, scale: 2 }],
]) {
  const s = await send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: false }, sid);
  const f = OUT + TAG + "-" + PAGE.replace(/\//g, "") + suffix;
  fs.writeFileSync(f, Buffer.from(s.result.data, "base64"));
  log("shot " + f + " " + fs.statSync(f).size);
}
ws.close(); chrome.kill();
log("done");
process.exit(0);
