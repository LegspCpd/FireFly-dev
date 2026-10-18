import fs from "node:fs";
const html = fs.readFileSync(".scratch/c.html", "utf8");
const withBase = html.replace("<head>", "<head><base href=\"https://dev.legspcpd.top/\">");
const js = [
  "<pre id=\"R\">P</pre>",
  "<script>",
  "setTimeout(function(){var o=[];",
  'var b=document.querySelector("#categories .ef-cut");',
  'if(b){var cs=getComputedStyle(b);o.push("badgeBg="+cs.backgroundColor);o.push("badgeColor="+cs.color);o.push("clip="+String(cs.clipPath).slice(0,24));o.push("text="+(b.textContent||"").trim());}else{o.push("未找到 .ef-cut");}',
  'o.push("dark="+document.documentElement.classList.contains("dark"));',
  'document.getElementById("R").textContent="RPT "+o.join(" | ")+" END";},2500);',
  "</script>",
].join("\n");
fs.writeFileSync(".scratch/cp4.html", withBase.replace(/<\/body>/i, js + "</body>"));
console.log("  探针页已生成");