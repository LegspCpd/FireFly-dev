import fs from "node:fs";
import { execFileSync } from "node:child_process";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "https://dev.legspcpd.top";
const PAGES = [
  ["/", "home"],
  ["/friends/", "friends"],
  ["/archive/", "archive"],
  ["/posts/qilu/", "post"],
  ["/categories/", "cats"],
  ["/about/", "about"],
];
const grabbed = [];
for (const [path, tag] of PAGES) {
  let html = "";
  for (let i = 0; i < 3; i++) {
    try { html = execFileSync("curl", ["-sS", "--ssl-no-revoke", "--max-time", "40", "-A", "Mozilla/5.0 Chrome/141", BASE + path], { encoding: "utf8", maxBuffer: 1 << 28 }); if (html.length > 500) break; } catch (e) { html = ""; }
  }
  if (!html) { console.log("  抓取失败 " + path); continue; }
  const f = ".scratch/pg-" + tag + ".html";
  fs.writeFileSync(f, html.replace("<head>", '<head><base href="' + BASE + '/">'));
  const png = ".scratch/pg-" + tag + ".png";
  try {
    execFileSync(CHROME, ["--headless=old", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--ignore-certificate-errors",
      "--window-size=1280,1200", "--virtual-time-budget=11000", "--screenshot=F:/Github/Firefly/" + png, "file:///F:/Github/Firefly/" + f], { stdio: "ignore" });
    if (fs.existsSync(png)) { grabbed.push([tag, png]); console.log("  ✓ " + tag); }
  } catch (e) { console.log("  ✗ " + tag + " " + String(e.message).slice(0, 60)); }
}
// 拼一张联络表（每页缩到 400 宽，3 列）
const cells = grabbed.map(([tag, png]) => '<figure><img src="file:///F:/Github/Firefly/' + png + '"><figcaption>' + tag + "</figcaption></figure>").join("");
const sheet = "<!doctype html><meta charset=utf-8><body style=\"margin:0;background:#111;font:12px sans-serif;color:#eee\"><div style=\"display:grid;grid-template-columns:repeat(3,420px);gap:8px;padding:8px\">" + cells + "</div><style>figure{margin:0}figcaption{padding:2px 4px;color:#ff0}img{width:400px;display:block;border:1px solid #333}</style></body>";
fs.writeFileSync(".scratch/sheet.html", sheet);
execFileSync(CHROME, ["--headless=old", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--ignore-certificate-errors",
  "--window-size=1300,860", "--virtual-time-budget=6000", "--screenshot=F:/Github/Firefly/.scratch/sheet.png", "file:///F:/Github/Firefly/.scratch/sheet.html"], { stdio: "ignore" });
console.log("  联络表: " + grabbed.length + " 页");