import rss, { type RSSFeedItem } from "@astrojs/rss";
import { getSortedPosts } from "@utils/content-utils";
import { formatDateI18nWithTime } from "@utils/date-utils";
import { renderFeedEntries } from "@utils/feed-utils";
import type { APIContext } from "astro";
import { profileConfig, siteConfig } from "@/config";
import { processCoverImageSync } from "@/utils/image-utils";
import pkg from "../../package.json";

// 本地定制：生成完整的文章封面 URL
function getPostImageUrl(imagePath: string): string | undefined {
	if (!imagePath) return undefined;
	if (imagePath.startsWith("http")) return imagePath;
	if (imagePath.startsWith("/")) return `${siteConfig.site_url}${imagePath}`;
	return `${siteConfig.site_url}/${imagePath}`;
}

export const prerender = true;

export async function GET(context: APIContext): Promise<Response> {
	const includeContent = (siteConfig.feed?.contentMode ?? "full") === "full";
	const blog = await getSortedPosts();
	const entries = await renderFeedEntries(blog, { includeContent });
	const feedItems: RSSFeedItem[] = entries.map((entry) => {
		// 本地定制：分类 / 标签写入 <category>
		const categories = [
			entry.post.data.category,
			...entry.post.data.tags,
		].filter(Boolean) as string[];
		const item: RSSFeedItem = {
			title: entry.title,
			pubDate: entry.published,
			description: entry.description,
			link: entry.link,
			...(includeContent ? { content: entry.content } : {}),
			categories,
			author: entry.post.data.author?.trim() || profileConfig.name,
		};
		// 本地定制：封面图写入 MRSS media:content
		const postImage = processCoverImageSync(
			entry.post.data.image,
			entry.post.id,
		);
		if (postImage) {
			item.customData = `<media:content xmlns:media="http://search.yahoo.com/mrss/" url="${getPostImageUrl(postImage) || ""}" medium="image"/>`;
		}
		return item;
	});
	return rss({
		title: siteConfig.title,
		description: siteConfig.subtitle || "No description",
		site: context.site ?? "https://firefly.cuteleaf.cn",
		customData: `<language>${siteConfig.lang?.replace("_", "-") || "zh-CN"}</language>
		<templateTheme>Firefly</templateTheme>
		<templateThemeVersion>${pkg.version}</templateThemeVersion>
		<templateThemeUrl>https://github.com/CuteLeaf/Firefly</templateThemeUrl>
		<lastBuildDate>${formatDateI18nWithTime(new Date())}</lastBuildDate>
		<managingEditor>${profileConfig.name}</managingEditor>
		<webMaster>${profileConfig.name}</webMaster>`,
		items: feedItems,
	});
}
