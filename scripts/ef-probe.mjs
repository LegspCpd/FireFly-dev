import fs from "node:fs";

const html = fs.readFileSync(".scratch/c.html", "utf8");
const withBase = html.replace("<head>", '<head><base href="https://dev.legspcpd.top/">');

const script = [
  "<scratch-probe>",
  '<pre id="R">P</pre>',
  "<script>",
  "setTimeout(function(){",
  "  var o = [];",
  '  var badge = document.querySelector("#categories a div div");',
  "  if (badge) {",
  "    var cs = getComputedStyle(badge);",
  '    o.push("badgeBg=" + cs.backgroundColor);',
  '    o.push("badgeColor=" + cs.color);',
  '    o.push("badgeClip=" + String(cs.clipPath).slice(0, 26));',
  "  } else o.push(\"badge 未找到\");",
  '  var btn = document.querySelector("a.bg-\\\\(--primary\\\\)");',
  "  if (btn) {",
  "    var cb = getComputedStyle(btn);",
  '    o.push("btnBg=" + cb.backgroundColor);',
  '    o.push("btnColor=" + cb.color);',
  "  } else o.push(\"btn 未找到\");",
  '  o.push("dark=" + document.documentElement.classList.contains("dark"));',
  '  document.getElementById("R").textContent = "RPT " + o.join(" | ") + " END";',
  "}, 2500);",
  "</scr" + "ipt>",
].join("\n");

fs.writeFileSync(".scratch/cp2.html", withBase.replace(/<\/body>/i, script + "</body>"));
console.log("  探针页已生成");