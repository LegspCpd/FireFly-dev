import fs from "node:fs";
import { execFileSync } from "node:child_process";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "https://dev.legspcpd.top";
const probe = fs.readFileSync("scripts/ef-probe.js", "utf8");

// [路径, 宽, 是否浅色, 是否用旧版 headless（它认小于 500 的窗口宽）]
const TARGETS = [
  ["/", "390", false, true],
  ["/friends/", "390", false, true],
  ["/archive/", "390", false, true],
  ["/", "1280", true, false],
  ["/friends/", "1280", true, false],
];

for (const [path, w, light, old] of TARGETS) {
  let html = "";
  for (let a = 0; a < 3; a++) {
    try {
      html = execFileSync("curl", ["-sS", "--ssl-no-revoke", "--max-time", "40", "-A", "Mozilla/5.0 Chrome/141", BASE + path], { encoding: "utf8", maxBuffer: 1 << 28 });
      if (html.length > 1000) break;
    } catch (e) { html = ""; }
  }
  if (!html) { console.log("  " + path + " → 抓取失败"); continue; }
  const withBase = html.replace("<head>", '<head><base href="' + BASE + '/">');
  const head = light ? "<pre id=RPT>P</pre><script>window.__efLight=true;</" + "script><script>" + probe + "</" + "script>" : "<pre id=RPT>P</pre><script>" + probe + "</" + "script>";
  const tag = path.replace(/[^a-z0-9]/gi, "_") + w + (light ? "_light" : "");
  const file = ".scratch/w" + tag + ".html";
  fs.writeFileSync(file, withBase.replace(/<\/body>/i, head + "</body>"));
  const args = [old ? "--headless=old" : "--headless=new", "--disable-gpu", "--no-first-run", "--ignore-certificate-errors",
    "--window-size=" + w + ",900", "--virtual-time-budget=15000", "--dump-dom",
    "file:///F:/Github/Firefly/" + file];
  const out = execFileSync(CHROME, args, { encoding: "utf8", maxBuffer: 1 << 28 });
  const m = out.match(/VERIFY ([\s\S]*?) END/);
  console.log("  [" + (light ? "浅色" : "暗色") + " " + w + "px] " + (m ? m[1] : "未取到结果"));
}