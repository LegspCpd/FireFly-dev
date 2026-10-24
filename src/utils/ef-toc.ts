import type { MarkdownHeading } from "astro";

/**
 * 文章目录的收录规则（单一 owner：文章页决定是否开右栏、EfToc 渲染目录，
 * 两处都用这一份，避免各写一套过滤条件）。
 *   · 只收二级 / 三级标题 —— 一级就是文章标题，再细的层级太碎
 *   · 去掉「目录」这类自指标题（有些文章正文里自己写了一段目录）
 *   · 最多 24 条，长文目录不至于比正文还长
 */
export function efTocHeadings(headings: MarkdownHeading[] = []): MarkdownHeading[] {
	return headings
		.filter((h) => h.depth === 2 || h.depth === 3)
		.filter((h) => !/^(目录|目錄|contents?|toc)$/i.test(h.text.trim()))
		.slice(0, 24);
}
