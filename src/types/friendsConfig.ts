// 友链条目 —— 字段与 LegspCpd/friends 仓库保持一致（每条一个 JSON 文件，聚合为 friends.json）
export type FriendLink = {
	name: string; // 站点名
	avatar: string | null; // 头像 URL；null 时页面用占位图标
	description?: string; // 简介，最多 100 字
	url: string; // 站点地址
	backlink?: string; // 对方放置本站链接的页面（供回链检查用，页面不渲染）
	tags?: string[]; // 标签（本站扩展字段，用于筛选）
};

export type FriendsPageConfig = {
	title?: string; // 页面标题，留空则使用 i18n 中的翻译
	description?: string; // 页面描述，留空则使用 i18n 中的翻译
	showCustomContent?: boolean; // 是否显示自定义内容（friends.mdx）
	showComment?: boolean; // 是否显示评论区，默认 true
	randomizeSort?: boolean; // 是否打乱排序
};
