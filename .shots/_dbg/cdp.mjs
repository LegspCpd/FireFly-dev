import { spawn } from "node:child_process";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = process.argv[2];
const clickExpr = process.argv[3] || "window.swup && window.swup.navigate('/tags/')";
const chrome = spawn(CHROME, ["--headless=new","--disable-gpu","--no-first-run","--ignore-certificate-errors",
  "--remote-debugging-port=9333","--user-data-dir=F:/Github/Firefly/.shots/_dbg/cdp-profile",
  "--window-size=1280,900","about:blank"], { stdio: "ignore" });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ver = null;
for (let i = 0; i < 40; i++) {
  try { ver = await (await fetch("http://127.0.0.1:9333/json/version")).json(); break; } catch { await sleep(250); }
}
if (!ver) { console.log("cdp not up"); process.exit(1); }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === "Runtime.consoleAPICalled") logs.push("console." + m.params.type + ": " + m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0,180));
  if (m.method === "Log.entryAdded") logs.push("log(" + m.params.entry.level + "): " + String(m.params.entry.text).slice(0,180));
  if (m.method === "Runtime.exceptionThrown") logs.push("EXC: " + String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0,300));
};
const send = (method, params = {}, sessionId) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
await new Promise(r => { ws.onopen = r; });

const t = await send("Target.createTarget", { url });
const targetId = t.result.targetId;
const a = await send("Target.attachToTarget", { targetId, flatten: true });
const sid = a.result.sessionId;
await send("Page.enable", {}, sid);
await send("Runtime.enable", {}, sid);
await send("Log.enable", {}, sid);
await sleep(7000);
const before = await send("Runtime.evaluate", { expression: "JSON.stringify({origin:Math.round(performance.timeOrigin),path:location.pathname,cls:document.documentElement.className,swup:typeof window.swup})", returnByValue: true }, sid);
console.log("BEFORE " + before.result.result.value);
const nav = await send("Runtime.evaluate", { expression: "(" + clickExpr + ") ? 'ok' : 'falsy'", returnByValue: true, awaitPromise: false }, sid);
console.log("NAV " + JSON.stringify(nav.result.result?.value ?? nav.result.exceptionDetails?.text));
await sleep(5000);
const after = await send("Runtime.evaluate", { expression: "JSON.stringify({origin:Math.round(performance.timeOrigin),path:location.pathname,cls:document.documentElement.classList.contains('swup-enabled'),swup:typeof window.swup})", returnByValue: true }, sid);
console.log("AFTER " + after.result.result.value);
console.log("LOGS " + JSON.stringify(logs.slice(0, 12), null, 1));
ws.close();
chrome.kill();
