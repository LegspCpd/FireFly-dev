import fs from "node:fs";
import subsetFont from "subset-font";

const SRC = "F:/web/new blog/endfield-ui-skill-main/templates/flutter/fonts/Saira.ttf";
const OUT_DIR = "public/assets/fonts";
fs.mkdirSync(OUT_DIR, { recursive: true });

// 拉丁字母数字标点 + 界面会用到的少量符号（Saira 不含中日韩，中文由系统黑体兜底）
const BT = String.fromCharCode(96); // 反引号单独补，避免写进模板
const chars =
	" !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_" +
	BT +
	"abcdefghijklmnopqrstuvwxyz{|}~" +
	"¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ" +
	"│─┌┐└┘├┤┬┴┼→←↑↓•‥…‰′″‹›⁄⁰⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉";

const buf = fs.readFileSync(SRC);
const woff2 = await subsetFont(buf, chars, { targetFormat: "woff2" });
fs.writeFileSync(OUT_DIR + "/saira-subset.woff2", woff2);
const ttf = await subsetFont(buf, chars, { targetFormat: "truetype" });
fs.writeFileSync(OUT_DIR + "/saira-subset.ttf", ttf);
fs.copyFileSync(
	"F:/web/new blog/endfield-ui-skill-main/templates/flutter/fonts/Saira-OFL.txt",
	OUT_DIR + "/Saira-OFL.txt",
);
console.log("  原文件:", Math.round(buf.length / 1024) + " KB");
console.log("  woff2 :", Math.round(woff2.length / 1024) + " KB");
console.log("  ttf   :", Math.round(ttf.length / 1024) + " KB");
