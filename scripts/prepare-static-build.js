/**
 * EdgeOne / 纯静态构建辅助脚本
 *
 * 背景：
 *  - 项目默认用 @astrojs/vercel（serverless）与 @astrojs/cloudflare（CF Pages Functions），
 *    都能承载 prerender = false 的动态路由。
 *  - 纯静态构建（output: static）遇到 prerender = false 的动态路由会直接报错 [NoAdapterInstalled]。
 *
 * 解决方案：
 *  - 纯静态构建时把动态路由文件临时移出 src/pages，构建完成后再放回；
 *  - 其中 robots.txt 是按请求 Host 判定是否允许收录的动态路由，纯静态下没有动态能力，
 *    因此额外在 public/ 写一份"允许放行"的兜底 robots.txt，保证静态产物里仍有 robots.txt
 *    （不覆盖用户已有的同名文件；恢复时也只删我们写的那一份）。
 *
 * 用法：
 *   node scripts/prepare-static-build.js            # 暂移（构建前）
 *   node scripts/prepare-static-build.js --restore  # 恢复（构建后）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const pagesDir = path.join(rootDir, "src", "pages");
const backupDir = path.join(
	rootDir,
	"node_modules",
	".cache",
	"firefly-api-backup",
);
const fallbackRobotsPath = path.join(rootDir, "public", "robots.txt");

// 需要暂移的动态路由（相对于 src/pages）
const DYNAMIC_ROUTES = [
	"api/indexnow.ts",
	"gh/[...path].astro",
	"robots.txt.ts",
];

const isRestore = process.argv.includes("--restore");

// 用来识别"这份兜底文件是我们写的"，避免误删用户自己的 public/robots.txt
const FALLBACK_MARKER = "[generated-by-prepare-static-build]";

function ensureDir(p) {
	fs.mkdirSync(p, { recursive: true });
}

// 从 siteConfig.ts 里取站点 URL，避免域名在两处各写一遍
function resolveSiteUrl() {
	try {
		const cfgPath = path.join(rootDir, "src", "config", "siteConfig.ts");
		const cfg = fs.readFileSync(cfgPath, "utf8");
		const m = cfg.match(/site_url:\s*["']([^"']+)["']/);
		if (m && m[1]) return m[1].replace(/\/+$/, "");
	} catch {
		/* 取不到就用下面的默认值 */
	}
	return "https://blog.legspcpd.top";
}

function writeFallbackRobots() {
	if (fs.existsSync(fallbackRobotsPath)) {
		console.log("[static-build] ℹ️  public/robots.txt 已存在，保持不动");
		return;
	}
	const site = resolveSiteUrl();
	const body = [
		"# robots.txt（纯静态构建兜底版本）" + FALLBACK_MARKER,
		"# 动态版 robots.txt 会按请求 Host 判定：仅 legspcpd.top / www.legspcpd.top /",
		"# blog.legspcpd.top 允许收录，其它镜像主机整站 Disallow。",
		"# 纯静态平台没有动态路由，这里放行全部，避免误伤。",
		"",
		"User-agent: *",
		"Allow: /",
		"",
		"Disallow: /api/",
		"Disallow: /og/",
		"Disallow: /gh/",
		"Disallow: /ftp/",
		"Disallow: /404",
		"",
		"Sitemap: " + site + "/sitemap-index.xml",
		"",
	].join("\n");
	ensureDir(path.dirname(fallbackRobotsPath));
	fs.writeFileSync(fallbackRobotsPath, body, "utf8");
	console.log("[static-build] 📝 已写入纯静态兜底 public/robots.txt");
}

function removeFallbackRobots() {
	try {
		if (!fs.existsSync(fallbackRobotsPath)) return;
		const content = fs.readFileSync(fallbackRobotsPath, "utf8");
		if (!content.includes(FALLBACK_MARKER)) return;
		fs.rmSync(fallbackRobotsPath, { force: true });
		console.log("[static-build] 🧹 已移除纯静态兜底 public/robots.txt");
	} catch {
		/* 清理失败不影响构建结果 */
	}
}

try {
	if (isRestore) {
		for (const rel of DYNAMIC_ROUTES) {
			const targetFile = path.join(pagesDir, rel);
			const backupFile = path.join(backupDir, rel);
			if (fs.existsSync(backupFile) && !fs.existsSync(targetFile)) {
				ensureDir(path.dirname(targetFile));
				fs.copyFileSync(backupFile, targetFile);
				fs.rmSync(backupFile, { force: true });
				console.log("[static-build] ✅ 已恢复 src/pages/" + rel);
			}
		}
		removeFallbackRobots();
	} else {
		for (const rel of DYNAMIC_ROUTES) {
			const targetFile = path.join(pagesDir, rel);
			if (fs.existsSync(targetFile)) {
				const backupFile = path.join(backupDir, rel);
				ensureDir(path.dirname(backupFile));
				fs.copyFileSync(targetFile, backupFile);
				fs.rmSync(targetFile, { force: true });
				console.log(
					"[static-build] 🗑️  已暂移 src/pages/" + rel + "（纯静态构建）",
				);
			}
		}
		writeFallbackRobots();
	}
} catch (err) {
	console.error("[static-build] ❌ 执行失败:", err.message);
	process.exit(1);
}
