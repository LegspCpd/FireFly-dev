import fs from "node:fs";
import { execFileSync } from "node:child_process";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:4399";
const [, , rawPath, tag, open, height] = process.argv;
const clean = String(rawPath || "").replace(/^\/+|\/+$/g, "");
const path = clean === "" || clean === "." ? "/" : "/" + clean + "/";
const html = execFileSync("curl", ["-sS", "--max-time", "30", BASE + path], { encoding: "utf8", maxBuffer: 1 << 28 });
if (!html || html.length < 500) { console.log("fetch failed"); process.exit(1); }
const forceOpen = open === "open" ? `<style>
.Header_pcHeaderContainer__Sy_8l { width: calc(22.5 * var(--efu)) !important; }
.Header_pcHeaderContainer__Sy_8l .Header_buttonFrameContainer__Uvshp { width: calc(10.25 * var(--efu)) !important; }
.Header_pcHeaderContainer__Sy_8l .Header_navItem__c_fLB .Header_textWrapper__o9aHt,
.Header_pcHeaderContainer__Sy_8l .Header_buttonFrameContainer__Uvshp .Header_button__b0gdu .Header_textWrapper__o9aHt { opacity: 1 !important; }
.Header_pcHeaderContainer__Sy_8l .Header_navItem__c_fLB .Header_textWrapper__o9aHt { transform: translate3d(0,-50%,0) !important; }
.Header_pcHeaderContainer__Sy_8l .Header_buttonFrameContainer__Uvshp .Header_button__b0gdu .Header_textWrapper__o9aHt { transform: translate3d(0,0,0) !important; }
.Header_pcHeaderContainer__Sy_8l .Header_divider__tUYjO { opacity: 1 !important; }
</style>` : "";
const doc = html.replace("<head>", '<head><base href="' + BASE + '/">' + forceOpen);
const f = "F:/Github/Firefly/.shots/_dbg/pg-" + tag + ".html";
fs.writeFileSync(f, doc);
const png = "F:/Github/Firefly/.shots/round3/" + tag + ".png";
fs.mkdirSync("F:/Github/Firefly/.shots/round3", { recursive: true });
execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--ignore-certificate-errors",
  `--window-size=${process.env.WIDTH || 1280},${height || 1200}`, "--virtual-time-budget=9000",
  "--screenshot=" + png, "file:///" + f], { stdio: "ignore" });
console.log("ok " + png + " " + (fs.existsSync(png) ? fs.statSync(png).size : "MISSING"));
