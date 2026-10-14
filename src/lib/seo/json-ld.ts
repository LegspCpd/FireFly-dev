/**
 * JSON-LD 结构化数据生成工具
 *
 * 提供站点级和页面级结构化数据的统一生成函数。
 * 覆盖以下 Schema.org 类型：
 * - WebSite：站点品牌搜索
 * - Person：作者信息（知识图谱）
 * - BreadcrumbList：面包屑导航（Google 搜索结果路径）
 * - BlogPosting：博客文章富媒体卡片
 * - DiscussionForumPosting：论坛帖子富媒体结果
 */

import { profileConfig } from "@/config/profileConfig";
import { siteConfig } from "@/config/siteConfig";

const SITE_URL = siteConfig.site_url.replace(/\/+$/, "");
const SITE_NAME = siteConfig.title;
const AUTHOR_NAME = profileConfig.name;
const AUTHOR_AVATAR = profileConfig.avatar;

/**
 * WebSite + Person + WebPage 结构化数据
 * 用于整站布局，帮助搜索引擎建立品牌知识图谱
 *
 * 根据 Bing Webmaster Guidelines 建议:
 * - 清晰定义实体（人、组织、网站）
 * - 使用规范的 @id 引用关系
 * - 保持结构化数据与可见内容一致
 */
export function getSiteStructuredData(): string {
	const website = {
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "WebSite",
				"@id": `${SITE_URL}/#website`,
				url: SITE_URL,
				name: SITE_NAME,
				alternateName: siteConfig.subtitle || undefined,
				description: siteConfig.description,
				inLanguage: siteConfig.lang?.replace("_", "-") || "zh-CN",
				publisher: {
					"@id": `${SITE_URL}/#person`,
				},
				potentialAction: {
					"@type": "SearchAction",
					target: {
						"@type": "EntryPoint",
						urlTemplate: `${SITE_URL}/search/?q={search_term_string}`,
					},
					"query-input": "required name=search_term_string",
				},
			},
			{
				"@type": "Person",
				"@id": `${SITE_URL}/#person`,
				url: SITE_URL,
				name: AUTHOR_NAME,
				image: AUTHOR_AVATAR?.startsWith("http")
					? AUTHOR_AVATAR
					: `${SITE_URL}/${AUTHOR_AVATAR}`,
				description: profileConfig.bio,
				sameAs:
					profileConfig.links
						?.filter((link: { url: string; external?: boolean }) => {
							try {
								const parsed = new URL(link.url);
								return (
									parsed.protocol === "http:" || parsed.protocol === "https:"
								);
							} catch {
								return false;
							}
						})
						.map((link: { url: string }) => link.url)
						.filter(Boolean) || undefined,
			},
		],
	};
	return JSON.stringify(website);
}

/**
 * BreadcrumbList 结构化数据
 * 根据当前路径自动生成面包屑层级
 *
 * 例如 /posts/some-article → [首页, 博客文章, some-article]
 */
export function getBreadcrumbStructuredData(pathname: string): string {
	const segments = pathname
		.replace(/\/+/g, "/")
		.replace(/^\/|\/$/g, "")
		.split("/")
		.filter(Boolean);

	if (segments.length === 0) {
		// 首页面包屑
		const breadcrumb = {
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			itemListElement: [
				{
					"@type": "ListItem",
					position: 1,
					name: SITE_NAME,
					item: SITE_URL,
				},
			],
		};
		return JSON.stringify(breadcrumb);
	}

	const itemListElement = segments.map((segment, index) => {
		const position = index + 1;
		const path = `/${segments.slice(0, index + 1).join("/")}`;
		const name = decodeURIComponent(segment)
			.replace(/-/g, " ")
			.replace(/\b\w/g, (c) => c.toUpperCase());

		return {
			"@type": "ListItem",
			position,
			name,
			item: `${SITE_URL}${path}/`,
		};
	});

	// 在开头插入首页
	itemListElement.unshift({
		"@type": "ListItem",
		position: 1,
		name: "首页",
		item: SITE_URL,
	});

	// 重新编号
	itemListElement.forEach((item, index) => {
		item.position = index + 1;
	});

	const breadcrumb = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement,
	};

	return JSON.stringify(breadcrumb);
}

/**
 * BlogPosting 结构化数据
 * 用于博客文章详情页，支持富媒体搜索结果
 */
export function getBlogPostStructuredData(params: {
	title: string;
	description: string;
	publishedDate: string;
	updatedDate?: string;
	slug: string;
	tags?: string[];
	coverImage?: string;
	authorName?: string;
	inLanguage?: string;
}): string {
	const postUrl = `${SITE_URL}/posts/${params.slug}/`;

	const blogPosting: Record<string, unknown> = {
		"@context": "https://schema.org",
		"@type": ["BlogPosting", "Article"],
		"@id": `${postUrl}#article`,
		headline: params.title,
		description: params.description || params.title,
		url: postUrl,
		mainEntityOfPage: {
			"@type": "WebPage",
			"@id": postUrl,
		},
		datePublished: params.publishedDate,
		author: {
			"@type": "Person",
			"@id": `${SITE_URL}/#person`,
			name: params.authorName || AUTHOR_NAME,
			url: SITE_URL,
		},
		publisher: {
			"@type": "Person",
			"@id": `${SITE_URL}/#person`,
			name: AUTHOR_NAME,
			url: SITE_URL,
		},
		inLanguage: params.inLanguage || "zh-CN",
		// 明确引用站点知识图谱中定义的实体
		isPartOf: {
			"@type": "WebSite",
			"@id": `${SITE_URL}/#website`,
		},
	};

	if (params.updatedDate) {
		blogPosting.dateModified = params.updatedDate;
	}

	if (params.tags && params.tags.length > 0) {
		blogPosting.keywords = params.tags.join(", ");
		blogPosting.articleSection = params.tags[0];
	}

	if (params.coverImage) {
		const imageUrl = params.coverImage.startsWith("http")
			? params.coverImage
			: `${SITE_URL}${params.coverImage}`;
		blogPosting.image = {
			"@type": "ImageObject",
			url: imageUrl,
			// 图片作为文章的主要内容之一
			representativeOfPage: true,
		};
	}

	return JSON.stringify(blogPosting);
}

/**
 * 获取规范化的规范 URL
 * 保持与站点 trailingSlash 设置一致（当前为 always，即所有 URL 以 / 结尾）
 * 确保同一页面只有一个 URL，不会被重复收录
 */
export function getCanonicalUrl(pathname: string): string {
	const cleanPath = pathname.replace(/\/{2,}/g, "/");
	// 确保以 / 结尾（除了根路径 /）
	const normalizedPath =
		cleanPath !== "/" && !cleanPath.endsWith("/") ? `${cleanPath}/` : cleanPath;
	return `${SITE_URL}${normalizedPath}`;
}
