/**
 * IndexNow 自动提交脚本
 *
 * 构建完成后自动通知 Bing 索引更新。
 * 在 package.json 的 build 脚本中调用：
 *   "build": "astro build && node scripts/ping-indexnow.js"
 *
 * 使用方法：
 *   node scripts/ping-indexnow.js [sitemap-url]
 *
 * 默认使用 siteConfig 中的站点 URL 拼接 sitemap 地址。
 * 也可以手动指定 sitemap URL：
 *   node scripts/ping-indexnow.js https://blog.legspcpd.top/sitemap-index.xml
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BING_INDEXNOW_URL = "https://www.bing.com/indexnow";
const SITE_URL = process.env.SITE_URL || "https://blog.legspcpd.top";

/** 从 public 目录中查找 IndexNow key 文件 */
function discoverIndexNowKey() {
	// 1. 优先使用环境变量
	if (process.env.INDEXNOW_KEY) {
		return process.env.INDEXNOW_KEY.trim();
	}

	// 2. 从 public 目录扫描 {32位hex}.txt 文件
	const scriptDir = path.dirname(fileURLToPath(import.meta.url));
	const publicDir = path.join(scriptDir, "..", "public");
	try {
		const files = fs.readdirSync(publicDir);
		const keyFile = files.find(
			(file) => /^[0-9a-f]{32}\.txt$/i.test(file) && !file.startsWith("."),
		);
		if (keyFile) {
			const key = fs.readFileSync(path.join(publicDir, keyFile), "utf8").trim();
			if (key) {
				console.log(`[IndexNow] 🔑 从 public/${keyFile} 读取 key`);
				return key;
			}
		}
	} catch (err) {
		console.log(`[IndexNow] ⚠️  读取 public 目录失败: ${err.message}`);
	}

	return "";
}

async function main() {
	const sitemapUrl =
		process.argv[2] || `${SITE_URL}/sitemap-index.xml`;

	// 从环境变量或 public 目录中的 key 文件读取 IndexNow key
	const indexnowKey = discoverIndexNowKey();

	if (!indexnowKey) {
		console.log(
			"[IndexNow] ⚠️  未找到 IndexNow key（缺少 INDEXNOW_KEY 环境变量或 public/{key}.txt 文件），跳过 IndexNow 推送。",
		);
		process.exit(0);
	}

	console.log(`[IndexNow] 🔔 正在从 sitemap 读取 URL: ${sitemapUrl}`);

	try {
		// 获取 sitemap 内容
		const response = await fetch(sitemapUrl);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		const xml = await response.text();

		// 解析 sitemap 中的所有 URL
		const urlRegex = /<loc>([^<]+)<\/loc>/g;
		let match;
		const urls = [];
		while ((match = urlRegex.exec(xml)) !== null) {
			urls.push(match[1]);
		}

		if (urls.length === 0) {
			console.log("[IndexNow] ⚠️  Sitemap 中未找到 URL");
			process.exit(0);
		}

		console.log(`[IndexNow] 📄 找到 ${urls.length} 个 URL，正在提交到 Bing...`);

		// 批量提交（每次最多 10 个）
		const batchSize = 10;
		let submitted = 0;
		for (let i = 0; i < urls.length; i += batchSize) {
			const batch = urls.slice(i, i + batchSize);
			for (const url of batch) {
				try {
					const indexNowUrl = new URL(BING_INDEXNOW_URL);
					indexNowUrl.searchParams.set("url", url);
					indexNowUrl.searchParams.set("key", indexnowKey);
					const res = await fetch(indexNowUrl.toString());
					if (res.ok) {
						submitted++;
					} else {
						console.warn(
							`[IndexNow] ⚠️  提交失败 (${res.status}): ${url}`,
						);
					}
				} catch (err) {
					console.warn(`[IndexNow] ⚠️  提交出错: ${url}`, err.message);
				}
			}
		}

		console.log(
			`[IndexNow] ✅ 成功提交 ${submitted}/${urls.length} 个 URL 到 Bing IndexNow`,
		);
	} catch (error) {
		// A failed notification must never fail the build.
		//
		// The site is already built by this point and IndexNow only asks Bing to
		// re-crawl, so a network hiccup here should cost one notification, not
		// the whole deployment. This used to exit(1), which took the Vercel
		// build down whenever the sitemap could not be fetched, leaving the
		// previous deployment serving.
		console.warn(
			`[IndexNow] ⚠️  提交失败，跳过（不影响构建）: ${error.message}`,
		);
		process.exit(0);
	}
}

main();
