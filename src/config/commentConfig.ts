import type { CommentConfig } from "../types/commentConfig";

/**
 * 自建评论系统配置（终末地风格：官网图标 + 自有样式，无 iframe、无第三方脚本）。
 *
 * 为什么不挤进 commentConfig.type：那个联合类型在 src/types/commentConfig.ts，
 * 本轮改动范围不含它，所以自建系统用独立开关表达。
 *
 * 后端是**平台无关**的外部 API 服务：本站同时部署在 Cloudflare Pages / Vercel /
 * EdgeOne Pages，三边都只是静态页面，评论读写全靠这个地址。
 * （也正因如此，代码里不会出现 functions/api/** 这类只在 CF Pages 生效的绑定。）
 *
 * 地址解析优先级：
 *   window.__COMMENT_API_BASE__ > COMMENT_API_BASE / PUBLIC_COMMENT_API_BASE 环境变量
 *   > 下面的 apiBase。
 * 三者都为空 = 未配置 → 组件进入「演示态」（可输入、可预览、不落库、明确提示未配置）。
 *
 * 契约与后端选型（Supabase 建表 SQL / 现成 Worker 端点约定）见 docs/comment-api.md。
 *
 * 现在选的落地是 **Neon Data API**（PostgREST 风格托管 REST，无自建服务端）：
 * 地址形如 https://<endpoint-id>.apirest.<region>.aws.neon.tech/<database>/rest/v1，
 * 建表 SQL / 控制台开启步骤 / 排查见 docs/neon-data-api.md。
 * 客户端按地址自动识别方言（以 /rest/v1 结尾 = Data API，字段用 nickname、
 * 需要 Prefer: return=representation），组件不用改。
 * **地址为空时依旧是演示态**，所以启用 Data API 之前这里就保持空串。
 */
export type EfCommentConfig = {
	/** true = 用自建评论组件；false = 回落到 commentConfig.type 指定的第三方评论。 */
	enabled: boolean;
	/** 外部 API 根地址的兜底值（Data API 时以 /rest/v1 结尾）。优先级最低，建议用环境变量。 */
	apiBase: string;
	/** 线程键前缀：一个 API 服务多个站点时用来分区，例如 "/blog"。 */
	pathPrefix: string;
	/** 单条评论长度上限（前后端应一致，后端也要校验）。 */
	maxLength: number;
};

export const efCommentConfig: EfCommentConfig = {
	enabled: true,
	// Neon Data API 的公开地址（不含密码；Data API 已启用，匿名 token 由客户端自取）。
	apiBase: "https://ep-mute-term-a1vyn73h.apirest.ap-southeast-1.aws.neon.tech/neondb/rest/v1",
	pathPrefix: "",
	maxLength: 1000,
};

export const commentConfig: CommentConfig = {
	// 评论系统类型: none, twikoo, waline, giscus, disqus, artalk，默认为none，即不启用评论系统
	type: "giscus",

	//twikoo评论系统配置
	twikoo: {
		envId: "https://twikoo.vercel.app",
		// 设置 Twikoo 评论系统语言
		lang: "zh-CN",
		// 是否启用文章访问量统计功能
		visitorCount: true,
		// Twikoo JS 文件地址，支持 CDN 链接
		// 中国推荐1: https://registry.npmmirror.com/twikoo/1.7.14/files/dist/twikoo.min.js
		// 中国推荐2: https://s4.zstatic.net/npm/twikoo@1.7.14/dist/twikoo.min.js
		// 国际推荐: https://cdn.jsdelivr.net/npm/twikoo@1.7.14/dist/twikoo.min.js
		jsUrl: "https://cdn.jsdelivr.net/npm/twikoo@1.7.14/dist/twikoo.min.js",
		// Twikoo 自定义 CSS 文件地址，为空则不加载
		cssUrl: "/assets/css/twikoo-custom.css",
	},

	//waline评论系统配置
	waline: {
		// waline 后端服务地址
		serverURL: "https://waline.vercel.app",
		// 设置 Waline 评论系统语言
		lang: "zh-CN",
		// 设置 Waline 评论系统表情地址
		emoji: [
			"https://unpkg.com/@waline/emojis@1.4.0/weibo",
			"https://unpkg.com/@waline/emojis@1.4.0/bilibili",
			"https://unpkg.com/@waline/emojis@1.4.0/bmoji",
		],
		// 评论登录模式。可选值如下：
		//   'enable'   —— 默认，允许访客匿名评论和用第三方 OAuth 登录评论，兼容性最佳。
		//   'force'    —— 强制必须登录后才能评论，适合严格社区，关闭匿名评论。
		//   'disable'  —— 禁止所有登录和 OAuth，仅允许匿名评论（填写昵称/邮箱），适用于极简留言。
		login: "enable",
		// 是否启用文章访问量统计功能
		visitorCount: true,
	},

	// artalk评论系统配置
	artalk: {
		// artalk后端程序 API 地址
		server: "https://artalk.example.com/",
		// 设置 Artalk 语言
		locale: "zh-CN",
		// 是否启用文章访问量统计功能
		visitorCount: true,
	},

	//giscus评论系统配置
	giscus: {
		// 设置 Giscus 评论系统仓库
		repo: "LegspCpd/Blog-giscus",
		// 设置 Giscus 评论系统仓库ID
		repoId: "R_kgDOTr-MDg",
		// 设置 Giscus 评论系统分类
		category: "Announcements",
		// 获取 Giscus 评论系统分类ID
		categoryId: "DIC_kwDOTr-MDs4DCjQA",
		// 获取 Giscus 评论系统映射方式
		mapping: "pathname",
		// 获取 Giscus 评论系统严格模式
		strict: "0",
		// 获取 Giscus 评论系统反应功能
		reactionsEnabled: "1",
		// 获取 Giscus 评论系统元数据功能
		emitMetadata: "1",
		// 获取 Giscus 评论系统输入位置
		inputPosition: "top",
		// 获取 Giscus 评论系统语言
		lang: "zh-CN",
		// 获取 Giscus 评论系统加载方式
		loading: "lazy",
	},

	//disqus评论系统配置
	disqus: {
		// 获取 Disqus 评论系统
		shortname: "firefly",
	},
};
