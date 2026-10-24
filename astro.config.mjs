import { setMaxListeners } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import grayMatter from "gray-matter";
import cloudflare from "@astrojs/cloudflare";
import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import { pluginCollapsibleSections } from "@expressive-code/plugin-collapsible-sections";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";
import swup from "@swup/astro";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders } from "astro/config";
import expressiveCode from "astro-expressive-code";
import icon from "astro-icon";
import { pluginLanguageLogo } from "ec-lang-logo"; /* Language Logo */
import { pluginCollapsible } from "expressive-code-collapsible"; /* Collapsible */
import { pluginLanguageBadge } from "expressive-code-language-badge"; /* Language Badge */
import katex from "katex";
import "katex/dist/contrib/mhchem.mjs"; // 加载 mhchem 扩展
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeCallouts from "rehype-callouts";
import rehypeCodeGroup from "rehype-code-group"; /* Tab 代码块 */
import rehypeComponents from "rehype-components"; /* Render the custom directive content */
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkAdmonitionToBlockquoteCallout from "remark-admonition-to-blockquote-callout";
import remarkDirective from "remark-directive"; /* Handle directives */
import remarkMath from "remark-math";
import remarkSectionize from "remark-sectionize";
import {
	commentConfig,
	dynamicConfig,
	expressiveCodeConfig,
	fontConfig,
	fontsList,
	mermaidConfig,
	plantumlConfig,
	siteConfig,
} from "./src/config";
import I18nKey from "./src/i18n/i18nKey";
import { i18n } from "./src/i18n/translation";
import { GithubCardComponent } from "./src/plugins/rehype-component-github-card.mjs";
import { rehypeDiagramPanZoom } from "./src/plugins/rehype-diagram-panzoom.mjs";
import rehypeEmailProtection from "./src/plugins/rehype-email-protection.mjs";
import rehypeExternalLinks from "./src/plugins/rehype-external-links.mjs";
import rehypeFigure from "./src/plugins/rehype-figure.mjs";
import rehypeImageReferrerPolicy from "./src/plugins/rehype-image-referrerpolicy.mjs";
import { rehypeMermaid } from "./src/plugins/rehype-mermaid.mjs";
import { rehypePlantuml } from "./src/plugins/rehype-plantuml.mjs";
import { parseDirectiveNode } from "./src/plugins/remark-directive-rehype.js";
import { remarkExcerpt } from "./src/plugins/remark-excerpt.js";
import { remarkImageGrid } from "./src/plugins/remark-image-grid.js";
import { remarkMermaid } from "./src/plugins/remark-mermaid.js";
import { remarkPlantuml } from "./src/plugins/remark-plantuml.js";
import { remarkReadingTime } from "./src/plugins/remark-reading-time.mjs";
import { remarkWikiLink } from "./src/plugins/remark-wiki-link.js";
import { collectUsedFontCssVars } from "./src/utils/fontHelper";

if (process.env.NODE_ENV === "development") {
	setMaxListeners(20);
}

// 多平台部署：按 DEPLOY_TARGET 切换 adapter（本地定制；同时兼容上游的 CF_WORKERS 开关）
// 可选值：vercel（默认）| cloudflare | static / edgeone
// - vercel          -> @astrojs/vercel（serverless，保留全部动态接口）
// - cloudflare      -> @astrojs/cloudflare，供 Cloudflare **Pages** 使用。
//                      注意：该 adapter 自 v12 起只面向 Cloudflare Workers，
//                      **不再生成 Pages 版 _worker.js / _routes.json**，产物为
//                      dist/client（静态站，Pages 直接托管它）+ dist/server（Workers 包，Pages 用不到）。
//                      所以 CF Pages 后台的 Build output directory 必须是 dist/client，
//                      仓库根 wrangler.jsonc 的 pages_build_output_dir 已同步指向它。详见 docs/DEPLOY.md。
// - static/edgeone  -> 无 adapter，纯静态输出到 dist 根（EdgeOne Pages / 任意静态托管）
const DEPLOY_TARGET = (
	process.env.DEPLOY_TARGET || (process.env.CF_WORKERS ? "cloudflare" : "vercel")
).toLowerCase();

let adapter;
let outputHint;
if (DEPLOY_TARGET === "cloudflare") {
	adapter = cloudflare({
		// workerd 预渲染环境没有 node:fs / node:path，而 gallery / OG 图等构建期逻辑需要它们
		prerenderEnvironment: "node",
	});
	outputHint = "dist/client（CF Pages 的 Build output directory 请填 dist/client）";
} else if (DEPLOY_TARGET === "static" || DEPLOY_TARGET === "edgeone") {
	adapter = undefined;
	outputHint = "dist（纯静态，dist 根目录下直接有 index.html）";
} else {
	const { default: vercel } = await import("@astrojs/vercel");
	adapter = vercel();
	outputHint = ".vercel/output（Vercel 自动识别）";
}

// 自证日志：部署异常时先看构建日志里选中的 adapter 与产物目录，是否和平台后台填的一致
console.log(
	`[deploy] DEPLOY_TARGET=${DEPLOY_TARGET} → adapter=${adapter?.name ?? "none"}；产物目录：${outputHint}`,
);

// ========== SEO: 构建文章 URL -> lastmod 映射（用于 sitemap 新鲜度信号，本地定制） ==========
const postLastmodMap = new Map();
(function buildPostLastmodMap() {
	const configDir = path.dirname(fileURLToPath(import.meta.url));
	const postsDir = path.join(configDir, "src/content/posts");
	if (!fs.existsSync(postsDir)) return;
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (/\.(md|mdx)$/.test(entry.name)) {
				try {
					const { data } = grayMatter(fs.readFileSync(full, "utf8"));
					if (data.draft === true) continue;
					const rel = path
						.relative(postsDir, full)
						.replace(/\\/g, "/")
						.replace(/\.(md|mdx)$/i, "");
					const lastmod = data.updated || data.published;
					if (lastmod) {
						postLastmodMap.set(`/posts/${rel}/`, new Date(lastmod).toISOString());
					}
				} catch {
					/* 忽略无法解析的文件 */
				}
			}
		}
	};
	walk(postsDir);
})();

// https://astro.build/config
export default defineConfig({
	site: siteConfig.site_url,

	base: "/",
	trailingSlash: "always",

	// 输出目录：默认 dist，可用 OUT_DIR 覆盖（EdgeOne / 无痛验证）
	outDir: process.env.OUT_DIR || "dist",

	// 字体配置 - 只加载实际使用的字体，跳过未引用的以加快构建
	fonts: (() => {
		// 禁用字体功能时直接返回空数组，跳过 Astro Font API 集成
		if (!fontConfig.enable) return [];

		const used = collectUsedFontCssVars(fontConfig);
		return fontsList
			.filter((f) => used.has(f.cssVariable))
			.map((f) => {
				let provider;
				switch (f.provider) {
					case "google":
						provider = fontProviders.google();
						break;
					case "fontsource":
						provider = fontProviders.fontsource();
						break;
					case "local":
						provider = fontProviders.local();
						break;
					case "bunny":
						provider = fontProviders.bunny();
						break;
					case "fontshare":
						provider = fontProviders.fontshare();
						break;
					case "npm":
						provider = fontProviders.npm();
						break;
					default:
						provider = f.provider;
				}
				return { ...f, provider };
			});
	})(),

	adapter,

	// 图像优化配置
	image: {
		// 组件可自行传入 layout/widths；这里只控制 Markdown 正文图片
		layout: "none",
	},

	integrations: [
		swup({
			theme: false,
			animationClass: "transition-swup-", // see https://swup.js.org/options/#animationselector
			// the default value `transition-` cause transition delay
			// when the Tailwind class `transition-all` is used
			containers: [
				"#banner-overlay-container",
				"#banner-dim-container",
				"#swup-container",
				"#floating-toc-wrapper",
			],
			smoothScrolling: false,
			cache: true,
			preload: {
				hover: true,
				visible: true,
			},
			accessibility: true,
			updateHead: true,
			updateBodyClass: false,
			globalInstance: true,
			// 滚动相关配置优化
			resolveUrl: (url) => url,
			animateHistoryBrowsing: false,
			skipPopStateHandling: (event) => {
				// 跳过锚点链接的处理，让浏览器原生处理
				return event.state?.url?.includes("#");
			},
		}),
		icon({
			include: {
				"material-symbols": ["*"],
				"fa7-brands": ["*"],
				"fa7-regular": ["*"],
				"fa7-solid": ["*"],
				"simple-icons": ["*"],
				mdi: ["*"],
				mingcute: ["*"],
				// 本地定制：profileConfig 的社交图标使用这两个集合
				ic: ["*"],
				ri: ["*"],
			},
		}),
		expressiveCode({
			themes: [expressiveCodeConfig.darkTheme, expressiveCodeConfig.lightTheme],
			useDarkModeMediaQuery: false,
			themeCssSelector: (theme) => `[data-theme='${theme.name}']`,
			plugins: [
				// pluginLanguageBadge 配置 - 从expressiveCodeConfig读取设置
				...(expressiveCodeConfig.pluginLanguageBadge?.enable === true
					? [pluginLanguageBadge()]
					: []),
				// pluginLanguageLogo 配置 - 从expressiveCodeConfig读取设置
				...(expressiveCodeConfig.pluginLanguageLogo?.enable === true
					? [
							pluginLanguageLogo({
								color: expressiveCodeConfig.pluginLanguageLogo.color ?? "mono",
								excludedLangs:
									expressiveCodeConfig.pluginLanguageLogo.excludedLangs ?? [],
							}),
						]
					: []),
				pluginCollapsibleSections(),
				pluginLineNumbers(),
				// pluginCollapsible 配置 - 从expressiveCodeConfig读取设置，使用i18n文本
				...(expressiveCodeConfig.pluginCollapsible?.enable === true
					? [
							pluginCollapsible({
								lineThreshold:
									expressiveCodeConfig.pluginCollapsible.lineThreshold || 15,
								previewLines:
									expressiveCodeConfig.pluginCollapsible.previewLines || 8,
								defaultCollapsed:
									expressiveCodeConfig.pluginCollapsible.defaultCollapsed ??
									true,
								expandButtonText: i18n(I18nKey.codeCollapsibleShowMore),
								collapseButtonText: i18n(I18nKey.codeCollapsibleShowLess),
								expandedAnnouncement: i18n(I18nKey.codeCollapsibleExpanded),
								collapsedAnnouncement: i18n(I18nKey.codeCollapsibleCollapsed),
							}),
						]
					: []),
			],
			defaultProps: {
				wrap: false,
				overridesByLang: {
					shellsession: {
						showLineNumbers: false,
					},
				},
			},
			styleOverrides: {
				borderRadius: "0.75rem",
				codeFontSize: "0.875rem",
				codeFontFamily:
					"var(--font-code, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace)",
				codeLineHeight: "1.5rem",
				frames: {},
				textMarkers: {
					delHue: 0,
					insHue: 180,
					markHue: 250,
				},
				languageBadge: {
					fontSize: "0.75rem",
					fontWeight: "bold",
					borderRadius: "0.25rem",
					opacity: "1",
					borderWidth: "0px",
					borderColor: "transparent",
				},
			},
			frames: {
				// 保留原生复制按钮，外观由 src/styles/expressive-code.css 覆盖成主题风格
				showCopyToClipboardButton: true,
			},
		}),
		svelte(),
		sitemap({
			filter: (page) => {
				// 根据页面开关配置过滤sitemap
				const url = new URL(page);
				const pathname = url.pathname;
				if (pathname === "/dynamic/" && !siteConfig.pages.dynamic) {
					return false;
				}
				if (pathname.startsWith("/gallery/") && !siteConfig.pages.gallery) {
					return false;
				}
				if (pathname === "/friends/" && !siteConfig.pages.friends) {
					return false;
				}
				if (pathname === "/guestbook/" && !siteConfig.pages.guestbook) {
					return false;
				}
				if (pathname === "/booknav/" && !siteConfig.pages.booknav) {
					return false;
				}
				if (pathname === "/bilibili/" && !siteConfig.pages.bilibili) {
					return false;
				}
				if (pathname === "/bangumi/" && !siteConfig.pages.bangumi) {
					return false;
				}
				if (pathname === "/vndb/" && !siteConfig.pages.vndb) {
					return false;
				}
				if (pathname === "/myanimelist/" && !siteConfig.pages.mal) {
					return false;
				}
				// 动态页评论嵌入页：评论关闭时重定向到 /404/，不应进 sitemap
				if (
					pathname === "/dynamic/comments/" &&
					(dynamicConfig.showComment === false ||
						!commentConfig.type ||
						commentConfig.type === "none")
				) {
					return false;
				}
				if (pathname === "/sponsor/" && !siteConfig.pages.sponsor) {
					return false;
				}
				// 排除无需索引的页面（本地定制）
				if (
					pathname.startsWith("/api/") ||
					pathname.startsWith("/og/") ||
					pathname.startsWith("/gh/") ||
					pathname.startsWith("/ftp/") ||
					pathname.startsWith("/yandex_") ||
					pathname.startsWith("/baidu_verify_") ||
					pathname === "/search/" ||
					pathname === "/404"
				) {
					return false;
				}
				return true;
			},
			// 自定义 sitemap 条目，为关键页面设置更高优先级与更新频率（本地定制）
			serialize: (item) => {
				const pathname = new URL(item.url).pathname;

				if (pathname === "/" || pathname === "") {
					return {
						...item,
						changefreq: "daily",
						priority: 1.0,
						lastmod: new Date().toISOString(),
					};
				}
				if (pathname === "/posts/" || pathname === "/archive/") {
					return { ...item, changefreq: "daily", priority: 0.9 };
				}
				if (pathname.startsWith("/posts/") && pathname !== "/posts/") {
					const postLastmod = postLastmodMap.get(pathname);
					return {
						...item,
						changefreq: "weekly",
						priority: 0.8,
						...(postLastmod ? { lastmod: postLastmod } : {}),
					};
				}
				if (["/about/", "/friends/", "/sponsor/", "/guestbook/"].includes(pathname)) {
					return { ...item, changefreq: "monthly", priority: 0.6 };
				}
				if (/\/\d+\/$/.test(pathname)) {
					return { ...item, changefreq: "weekly", priority: 0.5 };
				}
				return item;
			},
		}),
		mdx(),
	],
	markdown: {
		processor: unified({
			remarkPlugins: [
				...(siteConfig.post.rehypeCallouts.enablePythonMarkdownAdmonitions !==
				false
					? [remarkAdmonitionToBlockquoteCallout]
					: []),
				remarkMath,
				remarkReadingTime,
				remarkWikiLink,
				remarkImageGrid,
				remarkExcerpt,
				remarkDirective,
				remarkSectionize,
				parseDirectiveNode,
				remarkMermaid,
				[remarkPlantuml, plantumlConfig],
			],
			rehypePlugins: [
				[rehypeKatex, { katex }],
				[rehypeCallouts, { theme: siteConfig.post.rehypeCallouts.theme }],
				rehypeSlug,
				rehypeCodeGroup,
				[rehypeMermaid, mermaidConfig],
				rehypePlantuml,
				rehypeDiagramPanZoom,
				rehypeFigure,
				[
					rehypeImageReferrerPolicy,
					{ domains: siteConfig.imageOptimization?.noReferrerDomains || [] },
				],
				[rehypeExternalLinks, { siteUrl: siteConfig.site_url }],
				[rehypeEmailProtection, { method: "base64" }], // 邮箱保护插件，支持 'base64' 或 'rot13'
				[
					rehypeComponents,
					{
						components: {
							github: GithubCardComponent,
						},
					},
				],
				[
					rehypeAutolinkHeadings,
					{
						behavior: "append",
						properties: {
							className: ["anchor"],
						},
						content: {
							type: "element",
							tagName: "span",
							properties: {
								className: ["anchor-icon"],
								"data-pagefind-ignore": true,
							},
							children: [
								{
									type: "text",
									value: "#",
								},
							],
						},
					},
				],
			],
		}),
	},
	vite: {
		plugins: [tailwindcss()],
		server: {
			watch: {
				ignored: ["**/package/**", "**/Firefly-docs/**"],
			},
		},
		resolve: {
			alias: {
				"@rehype-callouts-theme": `rehype-callouts/theme/${siteConfig.post.rehypeCallouts.theme}`,
			},
		},
		build: {
			minify: "esbuild",
			esbuildOptions: {
				minify: true,
				// 删除 debugger 语句；console.log / console.debug 无副作用，未使用返回值时会被 dead code elimination 移除，
				// console.warn / console.error 保留，确保生产环境出错时仍有日志可查
				drop: ["debugger"],
				pure: ["console.log", "console.debug"],
			},
			rollupOptions: {
				onwarn(warning, warn) {
					// temporarily suppress this warning
					if (
						warning.message.includes("is dynamically imported by") &&
						warning.message.includes("but also statically imported by")
					) {
						return;
					}
					warn(warning);
				},
			},
			// CSS 优化
			cssCodeSplit: true,
			cssMinify: "esbuild",
			assetsInlineLimit: 4096,
		},
	},
});
