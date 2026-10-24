import fs from "node:fs";

const ROOT = "F:/Github/Firefly";
const astroPath = ROOT + "/src/layouts/EndfieldLayout.astro";
const cssPath = ROOT + "/src/styles/endfield-shell.css";
let astro = fs.readFileSync(astroPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");
const markup = fs.readFileSync(ROOT + "/.shots/round6/new-bottom.part", "utf8");
const sec4 = fs.readFileSync(ROOT + "/.shots/round6/new-section4.css", "utf8");
const mob = fs.readFileSync(ROOT + "/.shots/round6/new-mobile.css", "utf8");

function replaceBetween(src, startMarker, endMarker, insert, keepEndMarker) {
  const s = src.indexOf(startMarker);
  if (s < 0) throw new Error("start marker not found: " + startMarker.slice(0, 60));
  if (src.indexOf(startMarker, s + 1) >= 0) throw new Error("start marker not unique: " + startMarker.slice(0, 60));
  const e = src.indexOf(endMarker, s);
  if (e < 0) throw new Error("end marker not found: " + endMarker.slice(0, 60));
  const end = keepEndMarker ? e : e;
  return src.slice(0, s) + insert + src.slice(keepEndMarker ? end : end);
}

// ---- 1. Astro: bottom block ------------------------------------------------
const aStart = astro.indexOf('\t\t\t\t<div class="ef-rail-bottom">');
if (aStart < 0) throw new Error("astro bottom block not found");
const pEnd = astro.indexOf("</p>", aStart);
if (pEnd < 0) throw new Error("astro mark end not found");
const aEnd = astro.indexOf("\n", pEnd) + 1;
const indented = markup
  .split("\n")
  .map((l) => (l.length ? "\t\t\t\t" + l : l))
  .join("\n");
astro = astro.slice(0, aStart) + indented + "\n" + astro.slice(aEnd);

// ---- 2. Astro: triPath -----------------------------------------------------
const triOld = astro.indexOf('const triPath =');
const triOldEnd = astro.indexOf(";", triOld) + 1;
if (triOld < 0) throw new Error("triPath not found");
astro = astro.slice(0, triOld) +
  'const triPath = "M0.6,1.4 L11.4,1.4 L6,10.9 Z";' +
  astro.slice(triOldEnd);

// ---- 3. Astro: bottom comment ---------------------------------------------
astro = astro.replace(
  "// 底部两个圆形按钮：官网是「用户 / 声音」，这边换成站内的「留言 / 订阅」。",
  "// 底部第一组（浅灰圆角块）的两行：官网是「用户 / 鹰角支付中心 / 声音」，\n// 这边换成站内的「留言 / 订阅」，行高与图标文字位置照官网。"
);
astro = astro.replace(
  "// 底部社交：一排「小圆角方块」（官网 Header_iconButton__KWPpn 的方块 + 单色实心字形）。",
  "// 底部第三组：一排「小圆角方块」社交（官网 Header_iconButton__KWPpn 的方块 + 单色实心字形）。"
);
astro = astro.replace(
  "// 黑 CTA 的三角标记（官网 Header_tri__KNP87 的三枚三角）\n",
  ""
);
astro = astro.replace(
  "// path 取自图标集里同风格的实心字形（simple-icons 的 github/x/rss，mdi 的 email）。",
  "// path 取自图标集里同风格的实心字形（simple-icons 的 github/x/rss，mdi 的 email），\n// 单条 path、fill=currentColor、不加 stroke。"
);
astro = astro.replace(/\n{3,}/g, "\n\n");

// ---- 4. CSS: --efu ---------------------------------------------------------
const efuOld = "  /* 官网单位：1rem = min(.625vw, 1.111111vh)，钳到 9~12px 防止极端视口 */\n  --efu: clamp(9px, min(0.625vw, 1.111111vh), 12px);";
if (!css.includes(efuOld)) throw new Error("efu line not found");
css = css.replace(efuOld, "  /* 官网单位：1rem = min(.625vw, 1.111111vh)；1920×1080 下 1u = 12px */\n  --efu: min(0.625vw, 1.111111vh);");

// ---- 5. CSS: section 4 -----------------------------------------------------
const s4 = css.indexOf("/* ---------- 4. ");
const s5 = css.indexOf("/* ---------- 5. ");
if (s4 < 0 || s5 < 0 || s5 < s4) throw new Error("section markers not found");
if (css.indexOf("/* ---------- 4. ", s4 + 1) >= 0) throw new Error("section 4 marker not unique");
css = css.slice(0, s4) + sec4 + "\n" + css.slice(s5);

// ---- 6. CSS: mobile block --------------------------------------------------
const mobStart = "  .Header_textWrapper__o9aHt,\n  .ef-rail-bottom .Header_divider__tUYjO {\n    display: none;\n  }\n";
const mi = css.indexOf(mobStart);
if (mi < 0) throw new Error("mobile anchor not found");
if (css.indexOf(mobStart, mi + 1) >= 0) throw new Error("mobile anchor not unique");
const nw = css.indexOf("\n  .ef-wrap {\n", mi);
if (nw < 0) throw new Error("mobile end anchor not found");
css = css.slice(0, mi) + mob + css.slice(nw);

fs.writeFileSync(astroPath, astro);
fs.writeFileSync(cssPath, css);
console.log("astro lines:", astro.split("\n").length, " css lines:", css.split("\n").length);
