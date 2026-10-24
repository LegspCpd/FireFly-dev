import fs from "node:fs";
import { execFileSync } from "node:child_process";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:4399";
const probe = `<script>
window.__errs=[];
window.addEventListener('error',function(e){window.__errs.push(String(e.message).slice(0,80))});
setTimeout(function(){
  var de=document.documentElement, out=[];
  var rail=document.querySelector('[data-ef-rail]');
  var rb=rail?rail.getBoundingClientRect():null;
  var imgs=[].slice.call(document.querySelectorAll('img')).filter(function(i){var s=getComputedStyle(i);return s.display!=='none'&&s.visibility!=='hidden'&&i.getBoundingClientRect().width>1});
  var shell=document.querySelector('.ef-shell');
  out.push('page='+location.pathname);
  out.push('vw='+window.innerWidth+' scrollW='+de.scrollWidth+' hOverflow='+(de.scrollWidth>window.innerWidth+1?'YES':'no'));
  out.push('rail='+(rb?('x'+Math.round(rb.x)+' top'+Math.round(rb.top)+' bottom'+Math.round(rb.height)+' vh'+window.innerHeight+' pos'+getComputedStyle(rail).position):'MISSING'));
  out.push('imgs='+imgs.length);
  out.push('shellBg='+(shell?getComputedStyle(shell).backgroundColor:'-')+' bodyBg='+getComputedStyle(document.body).backgroundColor);
  out.push('dark='+(de.classList.contains('dark')?'yes':'no'));
  out.push('errs='+(window.__errs.length?window.__errs.slice(0,2).join(';'):'none'));
  document.title='RPT '+out.join(' | ');
},2600);
<\/script>`;
const widths = [390, 768, 1280, 1920];
const paths = ["", "archive", "categories", "tags", "series", "friends", "about", "guestbook", "search", "posts/qilu"];
for (const w of widths) {
  for (const raw of paths) {
    const path = raw === "" ? "/" : "/" + raw + "/";
    let html = "";
    try { html = execFileSync("curl", ["-sS", "--max-time", "30", BASE + path], { encoding: "utf8", maxBuffer: 1 << 28 }); } catch { html = ""; }
    if (!html) { console.log(w + " " + path + " FETCH FAIL"); continue; }
    const doc = html.replace("<head>", '<head><base href="' + BASE + '/">').replace("</body>", probe + "</body>");
    const f = "F:/Github/Firefly/.shots/_dbg/pr.html";
    fs.writeFileSync(f, doc);
    let out = "";
    try {
      out = execFileSync(CHROME, ["--headless=new","--disable-gpu","--no-first-run","--ignore-certificate-errors",
        "--window-size=" + w + ",900","--virtual-time-budget=7000","--dump-dom","file:///" + f], { encoding: "utf8", maxBuffer: 1 << 28 });
    } catch (e) { console.log(w + " " + path + " CHROME FAIL"); continue; }
    const m = out.match(/<title>([^<]*)<\/title>/);
    console.log("[" + w + "] " + (m ? m[1] : "no rpt"));
  }
}
