import friendsData from "@/data/friends.json";
import type { FriendLink, FriendsPageConfig } from "../types/friendsConfig";

// 友链列表数据来源：LegspCpd/friends 仓库。
// 构建前由 scripts/sync-friends.mjs 拉取到 src/data/friends.json。
// 这里不再硬编码任何友链条目 —— 要加友链请到 https://github.com/LegspCpd/friends 提 PR。

// 可以在 src/content/spec/friends.md 中编写友链页面下方的自定义内容

// 友链页面配置
export const friendsPageConfig: FriendsPageConfig = {
	// 页面标题，如果留空则使用 i18n 中的翻译
	title: "",

	// 页面描述文本，如果留空则使用 i18n 中的翻译
	description: "",

	// 是否显示底部自定义内容（friends.md 中的内容）
	showCustomContent: true,

	// 是否显示评论区，需要先在 commentConfig.ts 启用评论系统
	showComment: true,

	// 是否开启随机排序
	randomizeSort: false,
};

// 友链配置（来自外部数据源，已由友链仓按名称排好序）
export const friendsConfig: FriendLink[] = friendsData as FriendLink[];

// 获取友链（开启 randomizeSort 时打乱）
export const getEnabledFriends = (): FriendLink[] => {
	const list = [...friendsConfig];
	if (friendsPageConfig.randomizeSort) {
		list.sort(() => Math.random() - 0.5);
	}

	return list;
};
