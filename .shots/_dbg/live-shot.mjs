import fs from "node:fs";
import { execFileSync } from "node:child_process";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "F:/Github/Firefly/.shots/round4/";
fs.mkdirSync(OUT, { recursive: true });
const [, , target, tag, height] = process.argv;
const png = OUT + tag + ".png";
execFileSync(CHROME, ["--headless=new","--disable-gpu","--hide-scrollbars","--no-first-run","--ignore-certificate-errors",
  "--window-size=1280," + (height || 1000), "--virtual-time-budget=15000",
  "--screenshot=" + png, target], { stdio: "ignore" });
console.log("ok " + png + " " + (fs.existsSync(png) ? fs.statSync(png).size : "MISSING"));
