import { spawn } from "node:child_process";
import fs from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.argv[2] || "http://127.0.0.1:4321";
const TAG = process.argv[3] || "dev";
const VW = Number(process.argv[4] || 1280);
const VH = Number(process.argv[5] || 1000);
const PAGES = (process.argv[6] || "/").split(",");
const OUT = "F:/Github/Firefly/.shots/round5/";
fs.mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--ignore-certificate-errors",
  "--remote-debugging-port=9340", "--user-data-dir=F:/Github/Firefly/.shots/_dbg/cdp-p8",
  "--window-size=" + VW + "," + VH, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ver = null;
for (let i = 0; i < 60; i++) { try { ver = await (await fetch("http://127.0.0.1:9340/json/version")).json(); break; } catch { await sleep(250); } }
if (!ver) { console.log("cdp not up"); process.exit(1); }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
await new Promise((r) => { ws.onopen = r; });

const PROBE = "JSON.stringify({path:location.pathname,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,railW:Math.round(document.querySelector('.Header_pcHeaderContainer__Sy_8l')?.getBoundingClientRect().width||0),railH:Math.round(document.querySelector('.Header_pcHeaderContainer__Sy_8l')?.getBoundingClientRect().height||0),capsule:document.querySelector('.Header_buttonFrameContainer__Uvshp')?.getBoundingClientRect().toJSON(),black:document.querySelector('a.Header_buttonPreserveBg__rEZGT')?.getBoundingClientRect().toJSON(),social:document.querySelector('.ef-rail-social')?.getBoundingClientRect().toJSON(),mark:document.querySelector('.ef-rail-mark')?.getBoundingClientRect().toJSON(),active:document.querySelector('[data-ef-rail] .Header_active__jzCyf')?.getAttribute('href'),imgs:document.querySelectorAll('img').length,navItems:document.querySelectorAll('[data-ef-rail] .Header_navItem__c_fLB').length,socialN:document.querySelectorAll('.ef-rail-social a').length})";

for (const page of PAGES) {
  const t = await send("Target.createTarget", { url: BASE + page });
  const sid = (await send("Target.attachToTarget", { targetId: t.result.targetId, flatten: true })).result.sessionId;
  await send("Page.enable", {}, sid); await send("Runtime.enable", {}, sid); await send("Page.bringToFront", {}, sid);
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true }, sid)).result?.result?.value;
  let opened = false;
  for (let i = 0; i < 40; i++) {
    await sleep(700);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 30, y: Math.round(VH / 2), buttons: 0 }, sid);
    await sleep(450);
    const v = await ev("Math.round(document.querySelector('.Header_pcHeaderContainer__Sy_8l')?.getBoundingClientRect().width||0)");
    if (typeof v === "number" && v > 150) { opened = true; break; }
  }
  await sleep(700);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 30, y: Math.round(VH / 2), buttons: 0 }, sid);
  await sleep(600);
  console.log("OPENED=" + opened + " " + (await ev(PROBE)));
  const slug = page === "/" ? "home" : page.replace(/^\//, "").replace(/\//g, "_");
  const shots = [
    ["-rail.png", { x: 0, y: 0, width: 300, height: VH, scale: 1 }],
    ["-rail-bottom.png", { x: 0, y: Math.max(0, VH - 300), width: 300, height: 300, scale: 2 }],
  ];
  for (const [suffix, clip] of shots) {
    const s = await send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: false }, sid);
    const f = OUT + TAG + "-" + slug + suffix;
    fs.writeFileSync(f, Buffer.from(s.result.data, "base64"));
    console.log("shot " + f + " " + fs.statSync(f).size);
  }
  await send("Target.closeTarget", { targetId: t.result.targetId });
}
ws.close(); chrome.kill();
