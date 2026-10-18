import fs from "node:fs";
import { execFileSync } from "node:child_process";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PAIRS = [
  ["/", "home"],
  ["/friends/", "friends"],
  ["/posts/qilu/", "post"],
];
const shots = [];
for (const [path, tag] of PAIRS) {
  for (const [label, base] of [["dev", "https://dev.legspcpd.top"], ["prod", "https://www.legspcpd.top"]]) {
    const png = ".scratch/cmp-" + tag + "-" + label + ".png";
    try {
      execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--ignore-certificate-errors",
        "--window-size=1280,1100", "--virtual-time-budget=13000", "--screenshot=F:/Github/Firefly/" + png, base + path], { stdio: "ignore" });
      if (fs.existsSync(png)) { shots.push([tag + "-" + label, png]); console.log("  ✓ " + tag + "-" + label); }
    } catch (e) { console.log("  ✗ " + tag + "-" + label); }
  }
}
const cells = shots.map(([t, p]) => '<figure><img src="file:///F:/Github/Firefly/' + p + '"><figcaption>' + t + "</figcaption></figure>").join("");
fs.writeFileSync(".scratch/cmp.html", "<!doctype html><meta charset=utf-8><body style=margin:0;background:#000;font:12px sans-serif;color:#eee><div style=\"display:grid;grid-template-columns:repeat(2,640px);gap:6px;padding:6px\">" + cells + "</div><style>figure{margin:0}figcaption{color:#ff0;padding:2px}img{width:632px;display:block;border:1px solid #444}</style></body>");
execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--ignore-certificate-errors",
  "--window-size=1300,1500", "--virtual-time-budget=8000", "--screenshot=F:/Github/Firefly/.scratch/cmp.png", "file:///F:/Github/Firefly/.scratch/cmp.html"], { stdio: "ignore" });
console.log("  对比图: " + shots.length + " 张");