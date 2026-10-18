import fs from "node:fs";
const html = fs.readFileSync(".scratch/c.html", "utf8");
const withBase = html.replace("<head>", "<head><base href=\"https://dev.legspcpd.top/\">");
const js = [
  "<pre id=\"R\">P</pre>",
  "<script>",
  "setTimeout(function(){var o=[];",
  'var pb=getComputedStyle(document.body,"::before");',
  'o.push("contour="+(String(pb.backgroundImage).indexOf("contour")>=0?"有":"无")+"@"+pb.opacity);',
  'var tri=document.querySelector(".ef-tri");',
  'o.push("tri="+(tri?Array.from(tri.children).map(function(c){return getComputedStyle(c).backgroundColor}).join("/"):"无"));',
  'var eb=document.querySelector(".ef-eyebrow");',
  'o.push("eyebrow="+(eb?eb.textContent.trim():"无"));',
  'var btn=document.querySelector(".btn-plain");',
  'o.push("btnClip="+(btn?String(getComputedStyle(btn).clipPath).slice(0,18):"无"));',
  'o.push("dark="+document.documentElement.classList.contains("dark"));',
  'document.getElementById("R").textContent="RPT "+o.join(" | ")+" END";},2600);',
  "</script>",
].join("\n");
fs.writeFileSync(".scratch/cp5.html", withBase.replace(/<\/body>/i, js + "</body>"));
console.log("  探针页已生成");