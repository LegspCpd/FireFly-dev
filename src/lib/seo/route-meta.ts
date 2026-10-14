/**
 * 集中式路由元数据表
 *
 * 核心思想（来自 SEO 自救指南）：
 * 客户端和构建端共用同一份路由元数据，title/description/robots 等
 * 统一写在一个地方，永不漂移。
 *
 * 新增页面时，只需在此表加一条记录，sitemap、meta 标签自动跟进。
 */

export interface RouteMeta {
	/** 页面标题（纯标题，不含站点名称后缀） */
	title: string;
	/** 页面描述 */
	description: string;
	/** 是否允许搜索引擎索引 */
	indexable?: boolean;
	/** OG 类型 */
	ogType?: "website" | "article";
	/** 规范路径（用于覆盖默认路径） */
	canonicalPath?: string;
}

/**
 * 静态路由元数据表
 * 客户端路由切换和构建时渲染都依赖这张表
 */
export const STATIC_ROUTE_META: Record<string, RouteMeta> = {
	"/": {
		title: "首页",
		description:
			"LegspCpd 的个人博客，记录我的学习和生活点滴，分享技术经验和见解。",
		ogType: "website",
	},
	"/archive/": {
		title: "归档",
		description: "博客文章归档 - 按时间线浏览所有文章",
		ogType: "website",
	},
	"/posts/": {
		title: "博客文章",
		description: "浏览所有博客文章，涵盖技术、生活、学习等内容",
		ogType: "website",
	},
	"/about/": {
		title: "关于",
		description: "关于 LegspCpd 以及这个博客的故事",
		ogType: "website",
	},
	"/friends/": {
		title: "友链",
		description: "我的朋友们 - 友情链接",
		ogType: "website",
	},
	"/sponsor/": {
		title: "赞助",
		description: "赞助支持本站，让创作更有动力",
		ogType: "website",
	},
	"/guestbook/": {
		title: "留言板",
		description: "欢迎留言，留下你的想法和建议",
		ogType: "website",
	},
	"/search/": {
		title: "搜索",
		description: "搜索博客文章内容",
		ogType: "website",
		indexable: false,
	},
	"/bangumi/": {
		title: "番组计划",
		description: "我的追番、游戏、书籍和音乐记录",
		ogType: "website",
	},
	"/gallery/": {
		title: "相册",
		description: "个人摄影与图片集",
		ogType: "website",
	},
	"/tags/": {
		title: "标签",
		description: "按标签浏览所有文章",
		ogType: "website",
	},
	"/categories/": {
		title: "分类",
		description: "按分类浏览所有文章",
		ogType: "website",
	},
};

/**
 * 不可索引的路径模式前缀
 * 匹配这些前缀的路径自动设置 noindex
 */
export const NOINDEX_PREFIXES: string[] = [
	"/api/",
	"/og/",
	"/gh/",
	"/ftp/",
	"/yandex_",
	"/baidu_verify_",
	"/404",
];

/**
 * 根据路径解析路由元数据
 * 支持精确匹配和前缀匹配（如 /posts/some-article 匹配 /posts/ 的元数据）
 */
export function resolveRouteMeta(pathname: string): RouteMeta {
	const normalized = normalizePath(pathname);

	// 1. 精确匹配
	const exact = STATIC_ROUTE_META[normalized];
	if (exact) return exact;

	// 2. 前缀匹配（博客文章详情页）
	for (const [prefix, meta] of Object.entries(STATIC_ROUTE_META)) {
		if (normalized.startsWith(prefix) && prefix !== "/") {
			return meta;
		}
	}

	// 3. 是否匹配 noindex 前缀
	if (NOINDEX_PREFIXES.some((p) => normalized.startsWith(p))) {
		return {
			title: "",
			description: "",
			indexable: false,
		};
	}

	// 4. 兜底 - 根路径
	return STATIC_ROUTE_META["/"];
}

/**
 * 获取所有允许索引的静态路径列表
 * 用于 sitemap 生成
 */
export function indexableStaticPaths(): string[] {
	return Object.entries(STATIC_ROUTE_META)
		.filter(([, meta]) => meta.indexable !== false)
		.map(([path]) => path);
}

/**
 * 标准化路径：确保以 / 开头、无重复斜杠、保留尾斜杠
 */
function normalizePath(pathname: string): string {
	let p = pathname;
	// 确保以 / 开头
	if (!p.startsWith("/")) p = `/${p}`;
	// 移除重复斜杠
	p = p.replace(/\/{2,}/g, "/");
	// 移除查询参数
	p = p.split("?")[0];
	// 移除 hash
	p = p.split("#")[0];
	// 确保以 / 结尾（除了根路径）
	if (p !== "/" && !p.endsWith("/")) p = `${p}/`;
	return p;
}
