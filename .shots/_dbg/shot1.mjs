import { spawn } from "node:child_process";
import fs from "node:fs";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.argv[2];
const PAGE = process.argv[3] || "/";
const TAG = process.argv[4] || "dev";
const OUT = "F:/Github/Firefly/.shots/round5/";
fs.mkdirSync(OUT, { recursive: true });
const PORT = 9341 + Math.floor(Math.random() * 40);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--ignore-certificate-errors",
  "--remote-debugging-port=" + PORT, "--user-data-dir=C:/tmp/efcdp/cdp-" + PORT,
  "--window-size=1280,1000", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ver = null;
for (let i = 0; i < 60; i++) { try { ver = await (await fetch("http://127.0.0.1:" + PORT + "/json/version")).json(); break; } catch { await sleep(250); } }
if (!ver) { console.log("cdp not up"); process.exit(1); }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
await new Promise((r) => { ws.onopen = r; });
const t = await send("Target.createTarget", { url: BASE + PAGE });
const sid = (await send("Target.attachToTarget", { targetId: t.result.targetId, flatten: true })).result.sessionId;
await send("Page.enable", {}, sid); await send("Runtime.enable", {}, sid); await send("Page.bringToFront", {}, sid);
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true }, sid)).result?.result?.value;
await sleep(9000);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 30, y: 500, buttons: 0 }, sid);
await sleep(900);
let w = await ev("Math.round(document.querySelector('.Header_pcHeaderContainer__Sy_8l').getBoundingClientRect().width)");
if (!(w > 150)) {
  console.log("hover not taken (w=" + w + "), forcing expanded geometry for the visual check");
  await ev("(()=>{const s=document.createElement('style');s.id='ef-force-open';s.textContent='.Header_pcHeaderContainer__Sy_8l{width:calc(22.5 * var(--efu))!important}'+'.Header_pcHeaderContainer__Sy_8l .Header_buttonFrameContainer__Uvshp{width:calc(10.25 * var(--efu))!important}'+'.Header_pcHeaderContainer__Sy_8l .Header_navItem__c_fLB .Header_textWrapper__o9aHt{opacity:1!important;transform:translate3d(0,-50%,0)!important}'+'.Header_pcHeaderContainer__Sy_8l .Header_buttonFrameContainer__Uvshp .Header_button__b0gdu .Header_textWrapper__o9aHt{opacity:1!important;transform:translate3d(0,-50%,0)!important}';document.head.appendChild(s);return 1})()");
  await sleep(600);
}
const probe = await ev("JSON.stringify({path:location.pathname,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,railW:Math.round(document.querySelector('.Header_pcHeaderContainer__Sy_8l').getBoundingClientRect().width),railH:Math.round(document.querySelector('.Header_pcHeaderContainer__Sy_8l').getBoundingClientRect().height),capsule:document.querySelector('.Header_buttonFrameContainer__Uvshp').getBoundingClientRect().toJSON(),black:document.querySelector('a.Header_buttonPreserveBg__rEZGT').getBoundingClientRect().toJSON(),social:document.querySelector('.ef-rail-social').getBoundingClientRect().toJSON(),mark:document.querySelector('.ef-rail-mark').getBoundingClientRect().toJSON(),active:document.querySelector('[data-ef-rail] .Header_active__jzCyf')?.getAttribute('href'),imgs:document.querySelectorAll('img').length,navItems:document.querySelectorAll('[data-ef-rail] .Header_navItem__c_fLB').length,socialN:document.querySelectorAll('.ef-rail-social a').length})");
console.log("PROBE " + probe);
const slug = PAGE === "/" ? "home" : PAGE.replace(/^\//, "").replace(/\//g, "_");
for (const [suffix, clip] of [
  ["-rail.png", { x: 0, y: 0, width: 300, height: 1000, scale: 1 }],
  ["-rail-bottom.png", { x: 0, y: 700, width: 300, height: 300, scale: 2 }],
]) {
  const s = await send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: false }, sid);
  const f = OUT + TAG + "-" + slug + suffix;
  fs.writeFileSync(f, Buffer.from(s.result.data, "base64"));
  console.log("shot " + f + " " + fs.statSync(f).size);
}
ws.close(); chrome.kill();
console.log("done");
