import fs from "node:fs";
const html = fs.readFileSync(".scratch/c.html", "utf8");
const withBase = html.replace("<head>", String.fromCharCode(60) + "head" + String.fromCharCode(62) + '<base href="https://dev.legspcpd.top/">');
const js = [
  String.fromCharCode(60) + "pre id=" + String.fromCharCode(34) + "R" + String.fromCharCode(34) + String.fromCharCode(62) + "P" + String.fromCharCode(60) + "/pre" + String.fromCharCode(62),
  String.fromCharCode(60) + "script" + String.fromCharCode(62),
  "setTimeout(function(){var o=[];",
  'var b=document.querySelector("#categories a div div");',
  "if(b){var cs=getComputedStyle(b);o.push(\"badgeBg=\"+cs.backgroundColor);o.push(\"badgeColor=\"+cs.color);o.push(\"clip=\"+String(cs.clipPath).slice(0,20));}else{o.push(\"badge未找到\");}",
  'o.push("dark="+document.documentElement.classList.contains("dark"));',
  'document.getElementById("R").textContent="RPT "+o.join(" | ")+" END";},2500);',
  String.fromCharCode(60) + "/script" + String.fromCharCode(62),
].join("\n");
fs.writeFileSync(".scratch/cp3.html", withBase.replace(/<\/body>/i, js + "</body>"));
console.log("  探针页已生成");