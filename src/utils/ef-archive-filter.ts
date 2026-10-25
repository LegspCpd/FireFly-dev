/**
 * 归档页（/archive/）的两个客户端行为，做成站点级工具：
 *   ① 年份页签的 active 跟随 URL hash；
 *   ② 查询串筛选：?tag= / ?category= / ?uncategorized= / ?year=
 *
 * 筛选为什么在客户端：本站是静态预渲染（astro.config.mjs 默认 output:static，
 * Cloudflare Pages 只托管 dist/client），/archive/ 构建出来只有一份 HTML，
 * 构建期 Astro.url.searchParams 恒为空 —— 服务端算不出 ?tag= 这些。
 * 所以走「服务端渲染全量 + 客户端就地过滤」：卡片仍是 Astro 渲染的 .ef-card
 * （官网 CSS 一个字没动），这里只改可见性与区块标题里的计数。
 *
 * 为什么这段代码挂在 EndfieldLayout 而不是 archive.astro 里：
 * swup 换页插入的新 DOM 不会执行其中的 <script>，而
 * 「/tags/ 点标签 → /archive/?tag=x」正是最常见的入口路径。
 * 逻辑若写在归档页里，那条路径上没有任何脚本会跑（实测：直接打开
 * /archive/?tag=x 能筛，站内点过去不能筛 —— 页签 hash 同步同理）。
 * 放在站点外壳（每个文档都加载、且位于 swup 容器之外）后，
 * 每个文档只挂一次监听，换页时重算；不在归档页时 querySelector 落空即返回。
 */

/** 与 url-utils.ts 的 getTagUrl / getCategoryUrl 一一对应的参数名 */
const LABEL: Record<string, string> = {
	tag: "标签",
	category: "分类",
	uncategorized: "未分类",
	year: "年份",
};

interface Term {
	kind: "tag" | "category" | "uncategorized" | "year";
	value: string;
}

interface Meta {
	tags: string[];
	category: string;
	year: string;
}

function readTerms(): Term[] {
	const sp = new URLSearchParams(location.search);
	const terms: Term[] = [];
	const tag = sp.get("tag");
	if (tag?.trim()) terms.push({ kind: "tag", value: tag.trim() });
	const category = sp.get("category");
	if (category?.trim())
		terms.push({ kind: "category", value: category.trim() });
	// url-utils.ts 的 getCategoryUrl 对空分类给的是 ?uncategorized=true；=1 也认
	const unc = sp.get("uncategorized");
	if (unc !== null && unc !== "0" && unc.toLowerCase() !== "false")
		terms.push({ kind: "uncategorized", value: "" });
	const year = sp.get("year");
	if (year && /^\d{4}$/.test(year.trim()))
		terms.push({ kind: "year", value: year.trim() });
	return terms;
}

function parseTags(raw: string | null): string[] {
	try {
		const arr = JSON.parse(raw || "[]") as unknown[];
		return arr.map((t) => String(t).trim());
	} catch {
		return [];
	}
}

function matched(meta: Meta, terms: Term[]): boolean {
	for (const t of terms) {
		if (t.kind === "tag") {
			if (!meta.tags.includes(t.value)) return false;
		} else if (t.kind === "category") {
			if (meta.category !== t.value) return false;
		} else if (t.kind === "uncategorized") {
			if (meta.category) return false;
		} else if (t.kind === "year") {
			if (meta.year !== t.value) return false;
		}
	}
	return true;
}

function buildLabel(terms: Term[]): string {
	return terms
		.map((t) => LABEL[t.kind] + (t.value ? `：${t.value}` : ""))
		.join(" · ");
}

/** 年份页签 active 跟随 hash（只在归档页的页签行里找，筛选条用的是同一个组件） */
function syncYearTabs(): void {
	const hash = location.hash;
	if (!hash) return;
	const tabs = document.querySelectorAll<HTMLAnchorElement>(
		"[data-ef-archive-tabs] [data-ef-tab]",
	);
	for (const tab of tabs) {
		const hit = tab.getAttribute("href") === hash;
		tab.classList.toggle("SubpageTab_active__fHDLL", hit);
		if (hit) tab.setAttribute("aria-current", "page");
		else tab.removeAttribute("aria-current");
	}
}

/** 按当前 URL 重算归档页的可见性；不在归档页时是空操作 */
export function applyArchiveFilter(): void {
	const root = document.querySelector("[data-ef-archive]");
	if (!root) return;
	const terms = readTerms();
	const filtering = terms.length > 0;

	for (const el of root.querySelectorAll<HTMLElement>(".ef-card")) {
		const section = el.closest("[data-ef-year]");
		const meta: Meta = {
			tags: parseTags(el.getAttribute("data-post-tags")),
			category: el.getAttribute("data-post-category") || "",
			year: section?.getAttribute("data-ef-year") || "",
		};
		if (!filtering || matched(meta, terms)) el.removeAttribute("data-ef-out");
		else el.setAttribute("data-ef-out", "");
	}

	// 年份区块：没命中的整块收起来；标题里的计数跟着命中数走
	//（构建期写死的是全量数，筛选后不改就和卡片对不上）
	let total = 0;
	for (const sec of root.querySelectorAll<HTMLElement>("[data-ef-year]")) {
		const cards = sec.querySelectorAll(".ef-card");
		let n = 0;
		for (const card of cards) {
			if (!card.hasAttribute("data-ef-out")) n++;
		}
		sec.hidden = filtering && n === 0;
		total += n;
		const count = sec.querySelector('[class*="SectionTitle_titleEn"]');
		if (count) count.textContent = `${n} Posts`;
	}

	// 顶部：筛选时藏年份页签、换成筛选条（当前筛选 + 清除筛选）
	const tabRow = root.querySelector<HTMLElement>("[data-ef-archive-tabs]");
	if (tabRow) tabRow.hidden = filtering;
	const bar = root.querySelector<HTMLElement>("[data-ef-filterbar]");
	if (bar) {
		bar.hidden = !filtering;
		if (filtering) {
			const current = bar.querySelector<HTMLAnchorElement>("[data-ef-tab]");
			if (current) {
				const text = current.querySelector('[class*="SubpageTab_text"]');
				if (text) text.textContent = buildLabel(terms);
				// 自指：当前筛选这一项点下去不换页、也不加 hash
				current.setAttribute("href", location.pathname + location.search);
			}
		}
	}

	const emptyBox = root.querySelector<HTMLElement>("[data-ef-filter-empty]");
	if (emptyBox) emptyBox.hidden = !(filtering && total === 0);
}

function boot(): void {
	syncYearTabs();
	applyArchiveFilter();
}

/** 在 EndfieldLayout 里调用一次；重复调用无副作用 */
export function initArchiveFilter(): void {
	boot();
	if (typeof window === "undefined") return;
	if (
		(window as unknown as { __efArchiveFilterWired?: boolean })
			.__efArchiveFilterWired
	)
		return;
	(
		window as unknown as { __efArchiveFilterWired?: boolean }
	).__efArchiveFilterWired = true;
	// URL 每次变化都重算：popstate（前进后退）、hashchange、
	// swup 的 page:view / contentReplaced（站内跳转与 swup 自己的历史处理）
	window.addEventListener("popstate", applyArchiveFilter);
	window.addEventListener("hashchange", syncYearTabs);
	document.addEventListener("swup:page:view", () => {
		setTimeout(boot, 60);
	});
	document.addEventListener("swup:contentReplaced", () => {
		setTimeout(boot, 60);
	});
}
