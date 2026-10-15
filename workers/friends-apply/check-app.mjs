import { readFileSync } from "node:fs";
import { signAppJwt } from "./src/index.js";

const KEY = process.argv[2];
if (!KEY) {
	console.log("用法: node check-app.mjs <App 私钥 .pem 路径> [APP_ID]");
	process.exit(1);
}
const APP_ID = process.argv[3] || process.env.APP_ID || "";
const OWNER = "LegspCpd";
const REPO = "friends";

const pem = readFileSync(KEY, "utf8");
console.log("  私钥: 已读取 " + pem.length + " 字节（不显示内容）");

const jwt = await signAppJwt({ APP_ID: APP_ID, APP_PRIVATE_KEY: pem });
console.log("  1) JWT 签发: OK（" + jwt.length + " 字符）");

const h = { authorization: "Bearer " + jwt, accept: "application/vnd.github+json", "user-agent": "firefly-friends-apply" };

const instRes = await fetch("https://api.github.com/repos/" + OWNER + "/" + REPO + "/installation", { headers: h });
if (!instRes.ok) {
	console.log("  2) 读取 App 安装信息: ✗ HTTP " + instRes.status + " " + (await instRes.text()).slice(0, 160));
	console.log("     → 多半是 App 还没安装到 " + OWNER + "/" + REPO + "（App 页面左侧 Install App）");
	process.exit(0);
}
const inst = await instRes.json();
console.log("  2) App 安装: OK（installation id=" + inst.id + "，账号=" + (inst.account && inst.account.login) + "，仓库选择=" + (inst.repository_selection || "-") + "）");

const tokRes = await fetch("https://api.github.com/app/installations/" + inst.id + "/access_tokens", { method: "POST", headers: h });
if (!tokRes.ok) { console.log("  3) 签发 installation token: ✗ HTTP " + tokRes.status); process.exit(0); }
const tok = await tokRes.json();
console.log("  3) installation token: OK（长度 " + tok.token.length + "，过期 " + tok.expires_at + "）");

// 用这个令牌真的读一下仓库，确认权限够
const th = { authorization: "Bearer " + tok.token, accept: "application/vnd.github+json", "user-agent": "firefly-friends-apply" };
const repoRes = await fetch("https://api.github.com/repos/" + OWNER + "/" + REPO, { headers: th });
console.log("  4) 令牌可读仓库: " + (repoRes.ok ? "OK" : "✗ HTTP " + repoRes.status));
const permsRes = await fetch("https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents/config/site.json", { headers: th });
console.log("  5) 令牌可读文件（Contents 权限）: " + (permsRes.ok ? "OK" : "✗ HTTP " + permsRes.status));