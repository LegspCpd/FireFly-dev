import type { APIRoute } from "astro";
import { siteConfig } from "@/config";

// 按 Host 动态判定是否允许搜索引擎抓取：
//   - 白名单内的主机（legspcpd.top / www.legspcpd.top / blog.legspcpd.top）→ 正常放行
//   - 其它主机（平台自带的 *.pages.dev、*.vercel.app、*.dnsoe5.com 等镜像域名）→ 整站 Disallow
// 由于是静态站点，只有 robots.txt 这个"每个主机都会拉取"的文件能按请求返回不同内容，
// 因此这里必须动态渲染（prerender = false）。纯静态构建时由
// scripts/prepare-static-build.js 暂移本路由，并在 public/ 写一份允许放行的兜底版本。
export const prerender = false;

const SITEMAP_URL = new URL("sitemap-index.xml", import.meta.env.SITE).href;

const DEFAULT_INDEX_HOSTS = [
	"legspcpd.top",
	"www.legspcpd.top",
	"blog.legspcpd.top",
];

// 依据 Google 搜索要素与 Bing 网站管理员指南：
//   1) 不能屏蔽渲染页面所需的 CSS/JS（/_astro/），否则会被当成未渲染的空白页；
//   2) 已声明 SearchAction（站内搜索框）时搜索页必须可抓取，收录由 noindex 阻止；
//   3) Google 不支持 Crawl-delay（声明无效）；Bingbot / Baiduspider 支持。
const allowRules = (): string =>
	[
		"# robots.txt - LegspCpd Blog",
		"# 允许收录的主机：legspcpd.top / www.legspcpd.top / blog.legspcpd.top",
		"",
		"# ============================================",
		"# 通用规则 - 适用于所有爬虫",
		"# ============================================",
		"User-agent: *",
		"",
		"Allow: /",
		"",
		"# 屏蔽无需收录的内部路径（刻意不含 /_astro/ 与 /search/）",
		"Disallow: /api/",
		"Disallow: /og/",
		"Disallow: /gh/",
		"Disallow: /ftp/",
		"Disallow: /yandex_",
		"Disallow: /baidu_verify_",
		"Disallow: /404",
		"",
		"# 屏蔽会产出重复内容的分页与筛选参数",
		"Disallow: /*?page=",
		"Disallow: /*?tag=",
		"Disallow: /*?category=",
		"",
		"# ============================================",
		"# 特定爬虫优化",
		"# ============================================",
		"",
		"# Bingbot 支持并遵循 Crawl-delay",
		"User-agent: Bingbot",
		"Crawl-delay: 1",
		"Allow: /",
		"",
		"User-agent: Baiduspider",
		"Crawl-delay: 2",
		"Allow: /",
		"",
		"# ============================================",
		"# 屏蔽体积型文件，节省爬虫带宽",
		"# ============================================",
		"",
		"User-agent: *",
		"Disallow: /*.pdf$",
		"Disallow: /*.zip$",
		"Disallow: /*.gz$",
		"Disallow: /*.7z$",
		"Disallow: /*.rar$",
		"Disallow: /*.tar$",
		"",
		"# ============================================",
		"# Sitemap（始终指向规范主机）",
		"# ============================================",
		"Sitemap: " + SITEMAP_URL,
		"",
	].join("\n");

const denyRules = (host: string): string =>
	[
		"# 本站的规范域名是 blog.legspcpd.top / www.legspcpd.top / legspcpd.top。",
		"# 当前访问所用的主机不在允许收录的清单内，属于同一份内容的镜像域名，",
		"# 因此整站禁止抓取，避免搜索引擎收录重复内容。",
		"#",
		"# The canonical domains of this site are blog.legspcpd.top / www.legspcpd.top / legspcpd.top.",
		"# The host below is NOT in the index allowlist (it is a mirror of the same content),",
		"# so crawling is disallowed site-wide.",
		"#",
		"# 如需增删允许收录的域名，请修改 src/config/siteConfig.ts 的 seoIndexHosts。",
		"",
		"User-agent: *",
		"Disallow: /",
		"",
		"# matched-host: " + host,
		"",
		"# 规范站点与站点地图（供爬虫参考）",
		"Sitemap: " + SITEMAP_URL,
		"",
	].join("\n");

export const GET: APIRoute = ({ request, url }) => {
	const rawHost = request.headers.get("host") || url.host || "";
	const host = rawHost.toLowerCase().split(":")[0];

	const configured =
		siteConfig.seoIndexHosts && siteConfig.seoIndexHosts.length > 0
			? siteConfig.seoIndexHosts
			: DEFAULT_INDEX_HOSTS;
	const allowlist = configured.map((h) => h.toLowerCase().trim());

	const isLocalHost =
		host === "localhost" ||
		host === "127.0.0.1" ||
		host === "[::1]" ||
		host.endsWith(".local");
	const allowed = isLocalHost || allowlist.includes(host);

	return new Response(allowed ? allowRules() : denyRules(host), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
};
