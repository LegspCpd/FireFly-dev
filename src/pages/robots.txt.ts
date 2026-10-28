import type { APIRoute } from "astro";

// 站点 origin 从配置派生（astro.config.mjs 的 site: siteConfig.site_url）。
// 换域名时只改 siteConfig.site_url，这里跟着走，不再留一份写死的域名。
const SITE_ORIGIN = new URL(import.meta.env.SITE).origin;
const SITEMAP_URL = new URL("sitemap-index.xml", import.meta.env.SITE).href;

// robots.txt - LegspCpd Blog
// 依据 Google 搜索要素与 Bing 网站管理员指南：
//   1) 绝不能屏蔽 Google 渲染页面所需的 CSS/JS（/_astro/），否则会被当成未渲染的空白页；
//   2) 已声明 SearchAction（站内搜索框）时搜索页必须可抓取，改用 noindex 阻止收录；
//   3) Google 不支持 Crawl-delay（声明无效）；Bingbot / Baiduspider 支持，保留。
const rules = [
	"# robots.txt - LegspCpd Blog",
	"# " + SITE_ORIGIN,
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
	"# 管理面板：纯前端后台，不收录、不入 sitemap",
	"Disallow: /admin/",
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
	"# Sitemap",
	"# ============================================",
	"Sitemap: " + SITEMAP_URL,
	"",
].join("\n");

export const GET: APIRoute = () => {
	return new Response(rules, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
};
