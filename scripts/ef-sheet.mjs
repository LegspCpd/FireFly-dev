import fs from "node:fs";
import { execFileSync } from "node:child_process";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE;
const TAG = process.env.TAG || "sheet";
const W = process.env.W || "1280";
const PAGES = (process.env.PAGES || "/").split(",");
const LIGHT = process.env.LIGHT === "1";
const shots = [];
for (const p of PAGES) {
  let html = "";
  for (let i = 0; i < 3; i++) {
    try { html = execFileSync("curl", ["-sS", "--ssl-no-revoke", "--max-time", "40", "-A", "Mozilla/5.0 Chrome/141", BASE + p], { encoding: "utf8", maxBuffer: 1 << 28 }); if (html.length > 500) break; } catch (e) { html = ""; }
  }
  if (!html) { console.log("  抓取失败 " + p); continue; }
  const name = p.replace(/[^a-z0-9]/gi, "_") || "root";
  const f = ".scratch/sh-" + TAG + "-" + name + ".html";
  let body = html.replace("<head>", '<head><base href="' + BASE + '/">');
  if (LIGHT) body = body.replace(/<html([^>]*?)class="([^"]*)"/, (m, a, b) => '<html' + a + 'class="' + b.replace(/\bdark\b/g, "") + '"');
  fs.writeFileSync(f, body);
  const png = ".scratch/sh-" + TAG + "-" + name + ".png";
  try {
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--ignore-certificate-errors",
      "--window-size=" + W + ",1000", "--virtual-time-budget=12000", "--screenshot=F:/Github/Firefly/" + png, "file:///F:/Github/Firefly/" + f], { stdio: "ignore" });
    if (fs.existsSync(png)) { shots.push([p, png]); console.log("  ✓ " + p); }
  } catch (e) { console.log("  ✗ " + p); }
}
const cells = shots.map(([p, img]) => '<figure><img src="file:///F:/Github/Firefly/' + img + '"><figcaption>' + p + "</figcaption></figure>").join("");
fs.writeFileSync(".scratch/" + TAG + ".html", "<!doctype html><meta charset=utf-8><body style=margin:0;background:#000;font:11px sans-serif;color:#eee><div style=\"display:grid;grid-template-columns:repeat(3,420px);gap:6px;padding:6px\">" + cells + "</div><style>figure{margin:0}figcaption{color:#ff0;padding:1px 3px}img{width:412px;display:block;border:1px solid #444}</style></body>");
execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--ignore-certificate-errors",
  "--window-size=1300,900", "--virtual-time-budget=8000", "--screenshot=F:/Github/Firefly/.scratch/" + TAG + ".png", "file:///F:/Github/Firefly/.scratch/" + TAG + ".html"], { stdio: "ignore" });
console.log("  联络表 " + TAG + ": " + shots.length + " 页");