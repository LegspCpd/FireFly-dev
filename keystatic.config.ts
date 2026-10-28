import { collection, config, fields } from "@keystatic/core";

/**
 * Keystatic 管理面板配置（本地定制）
 *
 * 只在本机开发时使用：ENABLE_KEYSTASTIC=1 pnpm dev（或 pnpm admin）后访问 /keystatic。
 * 默认不挂集成，因此生产构建里不会出现任何面板代码。
 *
 * 字段映射严格对应 src/content.config.ts 的 zod schema，字段名一个不改。
 * 三处刻意保留的差异（都是为了避免破坏现有文件）：
 *   1. prevTitle / prevSlug / nextTitle / nextSlug 未纳入面板：schema 注释写明是内部字段
 *      （"For internal use"），一旦纳入，任何一次保存都会往每篇文章里塞 4 个空键。
 *   2. image / cover 用 fields.text 而不是 fields.image：现有值形如 "images/firefly.avif"，
 *      是相对条目目录的裸路径；fields.image 会按 directory + publicPath 重算路径，会改写现有值。
 *   3. spec 集合不在此文件中：src/content/spec/{about,guestbook,friends.mdx} 没有 frontmatter
 *      （schema 为 z.object({})），Keystatic 的条目集合强制要求 slugField + 至少一个字段，
 *      强行接入会在正文前插入 title 等键。所以 spec 只读，请在编辑器里改。
 */

const postFields = {
	title: fields.text({ label: "标题", validation: { isRequired: true } }),
	published: fields.date({ label: "发布日期", validation: { isRequired: true } }),
	updated: fields.date({ label: "更新日期", description: "可选；不填则不写这个键" }),
	draft: fields.checkbox({ label: "草稿（不发布）", defaultValue: false }),
	description: fields.text({ label: "摘要", multiline: true }),
	image: fields.text({
		label: "封面图路径",
		description: '原样保存字符串，例如 "images/cover.avif" 或站内绝对路径',
	}),
	tags: fields.array(fields.text({ label: "标签" }), {
		label: "标签",
		itemLabel: (props) => props.value || "空标签",
	}),
	category: fields.text({ label: "分类" }),
	lang: fields.text({ label: "语言", description: "留空即站点默认语言" }),
	pinned: fields.checkbox({ label: "置顶", defaultValue: false }),
	author: fields.text({ label: "作者" }),
	sourceLink: fields.text({ label: "原文链接" }),
	licenseName: fields.text({ label: "许可名称" }),
	licenseUrl: fields.text({ label: "许可链接" }),
	comment: fields.checkbox({ label: "允许评论", defaultValue: true }),
	password: fields.text({ label: "访问密码", description: "非空即视为加密文章" }),
	passwordHint: fields.text({ label: "密码提示" }),
	series: fields.text({ label: "系列名" }),
	seriesOrder: fields.integer({ label: "系列序号" }),
	content: fields.markdoc({ label: "正文（Markdown）", extension: "md" }),
};

export default config({
	storage: { kind: "local" },
	ui: {
		brand: { name: "Firefly 管理面板" },
		navigation: {
			内容: ["posts", "dynamic", "projects"],
		},
	},
	collections: {
		posts: collection({
			label: "博客文章",
			slugField: "title",
			path: "src/content/posts/**",
			format: { contentField: "content" },
			columns: ["title", "published", "category", "draft"],
			schema: postFields,
		}),

		dynamic: collection({
			label: "动态 / 说说",
			// 动态没有标题字段：文件名就是 slug（2026-07-15-010756.md 这种时间戳）。
			// keystatic 要求必须有 slugField，这里用已有字段 location 顶替，
			// 保存已有条目时不会改名；新建条目请优先用 pnpm new-dynamic 生成时间戳文件名。
			slugField: "location",
			path: "src/content/dynamic/*",
			format: { contentField: "content" },
			columns: ["published", "pinned", "location"],
			schema: {
				location: fields.text({ label: "位置" }),
				published: fields.datetime({ label: "发布时间", validation: { isRequired: true } }),
				pinned: fields.checkbox({ label: "置顶", defaultValue: false }),
				content: fields.markdoc({ label: "正文（Markdown）", extension: "md" }),
			},
		}),

		projects: collection({
			label: "项目",
			slugField: "slug",
			path: "src/content/projects/*",
			format: { contentField: "content" },
			columns: ["title", "status", "order", "draft"],
			schema: {
				slug: fields.text({
					label: "slug（= 文件名）",
					description: "现有项目里已有该键，改它等于改文件名",
				}),
				title: fields.text({ label: "名称", validation: { isRequired: true } }),
				published: fields.date({ label: "发布日期", validation: { isRequired: true } }),
				draft: fields.checkbox({ label: "草稿", defaultValue: false }),
				order: fields.integer({ label: "排序权重" }),
				description: fields.text({ label: "简介", multiline: true }),
				image: fields.text({
					label: "配图路径",
					description: '原样保存，例如 "images/firefly.avif"',
				}),
				tags: fields.array(fields.text({ label: "标签" }), {
					label: "标签",
					itemLabel: (props) => props.value || "空标签",
				}),
				link: fields.array(
					fields.object({
						label: fields.text({ label: "名称" }),
						icon: fields.text({ label: "图标", description: "astro-icon 名，例如 fa7-brands:github" }),
						value: fields.text({ label: "链接" }),
					}),
					{
						label: "相关链接",
						itemLabel: (props) => props.fields.label.value || "新链接",
					},
				),
				status: fields.text({ label: "状态" }),
				lang: fields.text({ label: "语言" }),
				content: fields.markdoc({ label: "正文（Markdown）", extension: "md" }),
			},
		}),
	},
});
