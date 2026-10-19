import type { SiteConfig } from "@/types/config";

// 定义站点语言
// 语言代码，例如：'zh_CN', 'zh_TW', 'en', 'ja', 'ru'。
const SITE_LANG = "zh_CN";

export const siteConfig: SiteConfig = {
	// 站点标题
	title: "LegspCpd Blog",

	// 站点副标题
	// 会出现在：首页标题后缀「主标题 | 副标题」、JSON-LD 的 alternateName、RSS/Atom 的 feed 描述
	subtitle: "记录技术折腾与生活点滴",

	// 站点 URL
	site_url: "https://blog.legspcpd.top",

	// 站点描述
	description:
		"LegspCpd 的个人博客，记录我的学习和生活点滴,分享我的技术经验和见解。",

	// 站点关键词
	keywords: [
		"Firefly",
		"Fuwari",
		"Astro",
		"ACGN",
		"博客",
		"技术博客",
		"静态博客",
		"个人博客",
		"编程",
		"生活",
		"LegspCpd",
		"LegspCpd Blog",
		"LegspCpd 的个人博客",
		"LegspCpd's Blog",
		"LegspCpd's Personal Blog",
		"和顺一中",
		"hsyz",
		"和顺第一初级中学",
		"Heshun No.1 Junior High School",
		"Heshun Yizhong",
		"Bilibili LegspCpd",
		"B站 LegspCpd",
		"B站 LegspCpd 的个人博客",
		"技术分享",
		"科技",
		"Cloudflare",
	],

	// 主题色
	themeColor: {
		// 主题色的默认色相，范围从 0 到 360。
		hue: 165,
		// 默认模式："light" 亮色，"dark" 暗色，"system" 跟随系统
		defaultMode: "dark",
	},

	// 页面整体宽度（单位：rem）
	pageWidth: 100,

	// 网站 Card 样式配置
	card: {
		border: true,
		followTheme: false,
	},

	// Favicon 配置
	// 站点图标直接用头像（站主指定）。
	// 注意：不要指向 public 下不存在的文件（曾经指向 /favicon/favicon.ico，
	// 那里只有 PNG，导致标签图标 404、OG 图只能拿透明图兜底）。
	favicon: [
		{ src: "https://hub.legspcpd.top/file/1787274091485_ico.png" },
	],

	// 导航栏配置
	navbar: {
		logo: {
			type: "url",
			value: "https://hub.legspcpd.top/file/1787274091485_ico.png",
			alt: "Logo",
		},
		title: "LegspCpd Blog",
		widthFull: false,
		menuAlign: "center",
		followTheme: false,
		stickyNavbar: true,
	},

	// 站点开始日期，用于统计运行天数
	siteStartDate: "2025-07-11",

	// 站点时区（IANA 时区字符串）
	timezone: "Asia/Shanghai",

	// 页面开关配置 - 控制特定页面的访问权限，设为 false 会返回 404
	pages: {
		// 书签导航页面开关
		booknav: false,
		// 友链页面开关
		friends: true,
		// 打赏页面开关
		sponsor: false,
		// 留言板页面开关，需要配置评论系统
		guestbook: true,
		// 番组计划页面开关
		bangumi: false,
		// VNDB 页面开关
		vndb: false,
		// MyAnimeList 页面开关
		mal: false,
		// 相册页面开关
		gallery: false,
		// 哔哩哔哩追番页面开关
		bilibili: false,
		// 动态（微博客）页面开关
		dynamic: false,
		// 项目展示页开关
		projects: false,
	},

	// 分类导航栏开关，在首页和归档页顶部显示分类快捷导航
	categoryBar: true,

	// 文章列表布局配置
	postListLayout: {
		// 默认布局模式："list" 列表模式，"grid" 网格模式
		defaultMode: "list",
		// 移动端默认布局模式
		mobileDefaultMode: "list",
		// 文章简介显示行数，设为 0 则不截断
		descriptionLines: 2,
		// 网格布局配置
		grid: {
			masonry: false,
			columnWidth: 320,
		},
	},

	// 文章内容页配置
	post: {
		// 提醒框（Admonitions）配置，主题：'github' | 'obsidian' | 'vitepress' | 'docusaurus'
		rehypeCallouts: {
			theme: "github",
		},
		// 文章页底部"上次编辑时间"卡片开关
		showLastModified: true,
		// 文章过期阈值（天数）
		outdatedThreshold: 30,
		// 是否显示文章页的分享按钮（本地原有的分享海报功能）
		share: true,
		// 上一篇/下一篇文章导航
		postNavigation: true,
		// 相关文章推荐
		relatedPosts: true,
		// 随机文章推荐
		randomPosts: false,
		// OpenGraph 图片功能，开启后构建时间较长，不建议本地调试时开启
		generateOgImages: true,
	},

	// bangumi 配置
	bangumi: {
		userId: "1143164",
		categoryOrder: ["anime", "book", "music", "game"],
	},

	// 分页配置
	pagination: {
		postsPerPage: 10,
	},

	// 图像优化及响应式配置
	imageOptimization: {
		formats: "webp",
		quality: 85,
		noReferrerDomains: [],
	},

	// ========== 以下为本地定制扩展字段 ==========

	// IndexNow 配置：内容变更时快速通知搜索引擎
	// 生成 key 后请放置在 public/{key}.txt 以便搜索引擎验证
	indexnow: {
		key: "5f124721eb672b47360d00676083cecb",
	},

	// 搜索引擎站长验证（网站所有权验证）
	webmasterVerification: {
		bing: "",
		google: "",
		baidu: "Sy4nL3Xd5VtjwSqy",
		yandex: "afca2c66e14b9ced",
		// 文件验证: key=文件名, value=文件内容, 自动在 /{key}.html 路由输出
		files: {
			"baidu_verify_codeva-c6BGWLznvm": "6e88638317ee7601beb7322f583b149d",
			"baidu_verify_codeva-lvaCPPAXmk": "6afe8bc6bdd87aa34a69ce3b3cbeb5aa",
			yandex_8100d571090b9d7d: "Verification: 8100d571090b9d7d",
		},
	},

	// 默认 OG 分享图（本地定制）
	// 注：当前为 640×640，可满足基本分享需求；
	// 若要最佳效果建议替换为 1200×630 的专用图，否则部分平台会退化为小尺寸卡片
	defaultOgImage: "/og/site.png",

	// 站点语言
	lang: SITE_LANG,
};