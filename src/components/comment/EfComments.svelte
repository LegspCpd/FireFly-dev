<script lang="ts">
/**
 * 自建评论组件（终末地风格自建版，无 iframe、无第三方脚本）。
 *
 * 平台无关：本组件只通过 @/utils/comment-api 的纯 fetch 客户端访问
 * COMMENT_API_BASE 指向的**外部**服务，因此 Cloudflare Pages / Vercel /
 * EdgeOne Pages 三个平台的静态产物都能用同一份代码。
 *
 * 降级（重要）：COMMENT_API_BASE 没配时进入「演示态」—— 表单可用、能预览自己的
 * 评论、明确显示「评论服务未配置」，不落库、不白屏、不刷屏报错。
 *
 * 本轮补的能力（数据库侧已就绪，前端只是用上）：
 *   - keyset 分页：首屏 20 条 + 「加载更多」，游标是上一条的 (created_at, id)；
 *   - 楼中楼：回复带 parent_id，只渲染两层（见下面的结构保证）；
 *   - website：昵称带网站时渲染成 nofollow ugc noopener 外链；
 *   - 自动刷新：每 30s 后台探一次首屏，只挂「有新评论」提示条，点了才刷（理由见 checkForNew）；
 *   - 举报：POST comment_reports，成功后本地标灰 + localStorage 记住，避免重复提交。
 */
import { onMount, tick } from "svelte";
import EfIcon from "@/components/common/EfIcon.svelte";
import {
	type CommentApiError,
	type CommentCursor,
	type CommentItem,
	type CommentReportReason,
	COMMENT_NAME_MAX,
	COMMENT_PAGE_SIZE,
	COMMENT_WEBSITE_MAX,
	commentVisitorHash,
	fetchComments,
	fetchReplies,
	isCommentApiConfigured,
	isDataApiBase,
	normalizeApiBase,
	postComment,
	reportComment,
	resolveCommentApiBase,
} from "@/utils/comment-api";
import { formatCommentTime, getCommentLabels } from "./comment-labels";

interface Props {
	/** 线程键：后端用它区分文章 / 留言板，例如 /posts/hello。 */
	path: string;
	/** 构建期解析出的 API 根地址；空串 = 未配置 → 演示态。 */
	apiBase?: string;
	/** 站点语言（siteConfig.lang）。 */
	locale?: string;
	/** 单条评论长度上限。 */
	maxLength?: number;
}

const {
	path,
	apiBase = "",
	locale = "zh_CN",
	maxLength = 1000,
}: Props = $props();

const labels = getCommentLabels(locale);
const nameId = "ef-comment-author";
const websiteId = "ef-comment-website";
const contentId = "ef-comment-content";
const storageKey = "ef:comment:author";
const reportedKey = "ef:comment:reported";
/** 已举报 id 的本地记忆上限：防止长年累月把 localStorage 撑爆。 */
const reportedCap = 500;
/** 输入框自身留点余量，让超限提示由我们给，而不是被 maxlength 直接吞掉。 */
const textareaLimit = maxLength + 200;
/**
 * 自动刷新轮询间隔。页面隐藏时定时器会被清掉（见 handleVisibility），
 * 不会在后台标签页里空转。
 */
const pollMs = 30_000;

/**
 * 首屏初值只用 prop：这样 SSR 与客户端首次渲染完全一致。
 * onMount 里再用 resolveCommentApiBase 允许 window.__COMMENT_API_BASE__
 * 这类运行时注入覆盖，避免 hydration 不一致。
 */
const initialBase = normalizeApiBase(apiBase);
let base = $state(initialBase);
let status = $state<"loading" | "ready" | "error">(
	isCommentApiConfigured(initialBase) ? "loading" : "ready",
);

/**
 * 单表存全部已加载的条目（顶层 + 子），渲染时按 parentId 分组。
 * 分页只作用于**顶层**：子评论跟着所属楼一起取（见 loadRepliesFor）。
 */
let comments = $state<CommentItem[]>([]);
/** 下一页游标 = 已加载顶层里最后一条的 (created_at, id)；null = 没有下一页。 */
let cursor = $state<CommentCursor | null>(null);
let hasMore = $state(false);
let loadingMore = $state(false);
let moreError = $state("");
let listError = $state("");
let listErrorDetail = $state("");
let formError = $state("");
let formErrorDetail = $state("");
let formNotice = $state("");
/**
 * 读屏播报用的可见性隔离文案区（.efc-live 是视觉隐藏的）。
 * 与 formNotice 分开：formNotice 是给看得见的人看的那一行，播报要独立成区，
 * 才能「先清空、再写入」—— 同一句话重复提交时，读屏靠这个空态才会再念一次。
 */
let liveNotice = $state("");
let author = $state("");
let website = $state("");
let content = $state("");
let submitting = $state(false);
let formEl = $state<HTMLFormElement | null>(null);
/** 竞态保护：只有最后一次首屏请求的结果能落到界面上。 */
let requestSeq = 0;

/** 回复：replyOpenId 是「表单显示在哪条评论下面」，replyParentId 是「挂到哪条楼下」。 */
let replyOpenId = $state<string | null>(null);
let replyParentId = $state<string | null>(null);
let replyToName = $state("");
let replyContent = $state("");
let replySubmitting = $state(false);
let replyError = $state("");
/** 举报：同一时刻只展开一条；原因默认「垃圾」。 */
let reportOpenId = $state<string | null>(null);
let reportReason = $state<CommentReportReason>("spam");
let reportSubmitting = $state(false);
let reportError = $state("");
/** 已举报 id（localStorage 记忆，跨刷新保留）。 */
let reportedIds = $state<Set<string>>(new Set());
/** 后台探到的「还没显示在列表里的新评论」条数；> 0 时挂提示条。 */
let newCount = $state(0);
let visitorHash = $state("");
let pollTimer: ReturnType<typeof setInterval> | null = null;

const demo = $derived(!isCommentApiConfigured(base));
const counter = $derived(`${content.length} / ${maxLength}`);
const canSubmit = $derived(!submitting && content.trim().length > 0);
const hasPreview = $derived(comments.some((item) => item.preview));
const topLevel = $derived(comments.filter((item) => !item.parentId));
const hasLoadedList = $derived(comments.length > 0);
/** 举报端点只存在于 PostgREST 方言（public.comment_reports）。 */
const reportsSupported = $derived(isDataApiBase(base));
const reportReasons: readonly { value: CommentReportReason; label: string }[] = [
	{ value: "spam", label: labels.reportSpam },
	{ value: "offensive", label: labels.reportOffensive },
	{ value: "other", label: labels.reportOther },
];

function initialOf(name: string): string {
	const value = name.trim();
	if (!value) return "?";
	return Array.from(value)[0] ?? "?";
}

/**
 * 只把 http/https 渲染成外链。javascript: / data: / 相对路径一律退化成纯文本，
 * 免得用户填的 website 变成注入点。
 */
function authorHref(item: CommentItem): string {
	const value = item.website.trim();
	if (!value) return "";
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
	} catch {
		return "";
	}
}

/** 子评论按时间正序（老的在上）；同刻按 id 兜底，保证顺序稳定。 */
function childrenOf(parentId: string): CommentItem[] {
	return comments
		.filter((item) => item.parentId === parentId)
		.sort((a, b) =>
			(a.createdAt ?? "").localeCompare(b.createdAt ?? "") ||
			a.id.localeCompare(b.id),
		);
}

/** 本地预览 id（demo：preview-…；后端 204 兜底：local-…）不能拿去举报。 */
function isReportable(item: CommentItem): boolean {
	return /^\d+$/.test(item.id);
}

function describeError(
	error: CommentApiError,
	phase: "load" | "post" | "report",
): string {
	switch (error.kind) {
		case "rateLimit":
			// 实测：429 是站点级洪峰阀（60/min，跨所有客户端），用户可能什么都没做错
			return phase === "report" ? labels.reportFailed : labels.rateLimited;
		case "duplicate":
			return phase === "report" ? labels.reportFailed : labels.duplicate;
		case "network":
			if (phase === "load") return labels.networkLoadFailed;
			return phase === "report" ? labels.reportFailed : labels.networkPostFailed;
		case "timeout":
			return phase === "report" ? labels.reportFailed : labels.timeoutFailed;
		case "http":
			return phase === "report"
				? labels.reportFailed
				: labels.httpFailed(error.status);
		default:
			if (phase === "load") return labels.loadFailed;
			return phase === "report" ? labels.reportFailed : labels.postFailed;
	}
}

function readStoredAuthor(): string {
	try {
		return localStorage.getItem(storageKey) ?? "";
	} catch {
		return "";
	}
}

function rememberAuthor(name: string): void {
	if (!name) return;
	try {
		localStorage.setItem(storageKey, name);
	} catch {
		// 隐私模式下 localStorage 不可写，忽略即可
	}
}

function readReported(): Set<string> {
	try {
		const raw = localStorage.getItem(reportedKey);
		if (!raw) return new Set();
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return new Set();
		return new Set(
			parsed.filter((value): value is string => typeof value === "string"),
		);
	} catch {
		return new Set();
	}
}

/**
 * 记住「这条已经举报过」——评论举报表匿名**只可 INSERT 不可 SELECT**，
 * 服务端读不回来，所以只认本地这一份。只留最近 reportedCap 条。
 */
function rememberReported(id: string): void {
	const next = new Set(reportedIds);
	next.add(id);
	const trimmed = [...next].slice(-reportedCap);
	reportedIds = new Set(trimmed);
	try {
		localStorage.setItem(reportedKey, JSON.stringify(trimmed));
	} catch {
		// 隐私模式：本次会话内仍然有效
	}
}

/** 上一页最后一条 = 下一页的游标；时间缺失时无法做 keyset，返回 null 表示不翻页。 */
function cursorOf(items: CommentItem[]): CommentCursor | null {
	const last = items.at(-1);
	if (!last?.createdAt) return null;
	return { createdAt: last.createdAt, id: last.id };
}

/** 取这一页顶层评论的子评论（一批一次请求）；失败不抛，只是这一页没有子评论。 */
async function loadRepliesFor(
	page: CommentItem[],
	run: number,
): Promise<CommentItem[]> {
	const ids = page.filter((item) => !item.parentId).map((item) => item.id);
	if (ids.length === 0) return [];
	const result = await fetchReplies({ base, path }, ids);
	if (run !== requestSeq || !result.ok) return [];
	return result.replies;
}

/** 首屏（或点了「有新评论」提示条后的整表重载）——永远从第一页开始。 */
async function loadFirstPage(): Promise<void> {
	if (!isCommentApiConfigured(base)) {
		status = "ready";
		return;
	}
	const run = ++requestSeq;
	status = "loading";
	listError = "";
	listErrorDetail = "";
	moreError = "";
	const result = await fetchComments({
		base,
		path,
		pageSize: COMMENT_PAGE_SIZE,
		topLevelOnly: true,
	});
	if (run !== requestSeq) return;
	if (!result.ok) {
		listError = describeError(result.error, "load");
		listErrorDetail = result.error.detail;
		status = "error";
		return;
	}
	const page = result.comments;
	const replies = await loadRepliesFor(page, run);
	if (run !== requestSeq) return;
	comments = [...page, ...replies];
	const next = result.hasMore ? cursorOf(page) : null;
	cursor = next;
	hasMore = next !== null;
	newCount = 0;
	status = "ready";
}

/** 「加载更多」：拿最后一页的 (created_at, id) 当游标续取，不用 offset。 */
async function loadMore(): Promise<void> {
	if (loadingMore || !hasMore || !cursor) return;
	loadingMore = true;
	moreError = "";
	const run = requestSeq;
	const result = await fetchComments({
		base,
		path,
		pageSize: COMMENT_PAGE_SIZE,
		topLevelOnly: true,
		cursor,
	});
	if (run !== requestSeq) {
		loadingMore = false;
		return;
	}
	if (!result.ok) {
		loadingMore = false;
		moreError = describeError(result.error, "load");
		return;
	}
	// 翻页期间可能有人删/藏了行，按 id 去重，避免 keyed each 撞 key。
	const known = new Set(comments.map((item) => item.id));
	const page = result.comments.filter((item) => !known.has(item.id));
	const replies = await loadRepliesFor(page, run);
	if (run !== requestSeq) {
		loadingMore = false;
		return;
	}
	comments = [...comments, ...page, ...replies];
	const next = result.hasMore ? cursorOf(page) : null;
	cursor = next;
	hasMore = next !== null;
	loadingMore = false;
}

async function submit(event: SubmitEvent): Promise<void> {
	event.preventDefault();
	if (submitting) return;
	const text = content.trim();
	const name = author.trim();
	const site = website.trim().slice(0, COMMENT_WEBSITE_MAX);
	formError = "";
	formErrorDetail = "";
	formNotice = "";

	if (!text) {
		formError = labels.needContent;
		return;
	}
	if (text.length > maxLength) {
		formError = labels.tooLong(maxLength);
		return;
	}

	// 演示态：只在本页预览，不落库、不发请求。
	if (demo) {
		comments = [
			{
				id: `preview-${Date.now()}`,
				author: name,
				content: text,
				createdAt: new Date().toISOString(),
				avatar: "",
				preview: true,
				website: site,
				parentId: null,
			},
			...comments,
		];
		content = "";
		status = "ready";
		rememberAuthor(name);
		return;
	}

	submitting = true;
	const result = await postComment(
		{ base, path },
		{ author: name, content: text, website: site },
	);
	submitting = false;
	if (!result.ok) {
		// 失败保留草稿，只出一条内联提示。
		formError = describeError(result.error, "post");
		formErrorDetail = result.error.detail;
		return;
	}
	// 插到列表最前即可：游标是「最后一条」，往前插入不会让分页错位。
	comments = [
		result.comment,
		...comments.filter((item) => item.id !== result.comment.id),
	];
	content = "";
	formNotice = labels.posted;
	void announce(labels.posted);
	status = "ready";
	rememberAuthor(name);
}

/**
 * 发表回复。parent_id 一定是**顶层**评论 id —— 这是「最多两层」的结构保证：
 *   - 回复表单只会渲染在顶层评论的 actions 区（子评论那里给的是 replyTargetId）；
 *   - 子评论的「回复」把 rootId 一路传下来（见模板里 openReply(child, item.id)），
 *     所以回复子评论 = 回复它所在的那层楼，永不产生第三层节点。
 */
async function submitReply(event: SubmitEvent): Promise<void> {
	event.preventDefault();
	if (replySubmitting) return;
	const text = replyContent.trim();
	const parentId = replyParentId;
	if (!parentId) return;
	replyError = "";
	if (!text) {
		replyError = labels.needContent;
		return;
	}
	if (text.length > maxLength) {
		replyError = labels.tooLong(maxLength);
		return;
	}
	if (demo) {
		comments = [
			...comments,
			{
				id: `preview-${Date.now()}`,
				author: author.trim(),
				content: text,
				createdAt: new Date().toISOString(),
				avatar: "",
				preview: true,
				website: website.trim().slice(0, COMMENT_WEBSITE_MAX),
				parentId,
			},
		];
		replyContent = "";
		replyOpenId = null;
		replyParentId = null;
		formNotice = labels.replyPosted;
		void announce(labels.replyPosted);
		return;
	}
	replySubmitting = true;
	const result = await postComment(
		{ base, path },
		{
			author: author.trim(),
			content: text,
			website: website.trim().slice(0, COMMENT_WEBSITE_MAX),
			parentId,
		},
	);
	replySubmitting = false;
	if (!result.ok) {
		replyError = describeError(result.error, "post");
		return;
	}
	const child: CommentItem = {
		...result.comment,
		parentId: result.comment.parentId ?? parentId,
	};
	if (!comments.some((item) => item.id === child.id)) {
		comments = [...comments, child];
	}
	replyContent = "";
	replyOpenId = null;
	replyParentId = null;
	formNotice = labels.replyPosted;
	void announce(labels.replyPosted);
}

async function submitReport(event: SubmitEvent): Promise<void> {
	event.preventDefault();
	const id = reportOpenId;
	if (!id || reportSubmitting || reportedIds.has(id)) return;
	reportError = "";
	reportSubmitting = true;
	const result = await reportComment(
		{ base, path },
		{ commentId: id, reason: reportReason, visitorHash },
	);
	reportSubmitting = false;
	if (!result.ok) {
		// 409（外键不存在 / 重复）说明这条已经不用再报了：本地记下，别让用户反复点。
		if (result.error.status === 409) {
			rememberReported(id);
			reportOpenId = null;
			void announce(labels.reportPosted);
			return;
		}
		reportError = describeError(result.error, "report");
		return;
	}
	rememberReported(id);
	reportOpenId = null;
	void announce(labels.reportPosted);
}

/** 打开某条评论的回复表单；rootId 是这条评论所在楼的顶层 id（永远只有两层）。 */
function openReply(item: CommentItem, rootId: string): void {
	replyOpenId = replyOpenId === item.id ? null : item.id;
	replyParentId = rootId;
	replyToName = item.author;
	replyError = "";
	reportOpenId = null;
}

function closeReply(): void {
	replyOpenId = null;
	replyParentId = null;
	replyContent = "";
	replyError = "";
}

function openReport(id: string): void {
	reportOpenId = reportOpenId === id ? null : id;
	reportError = "";
	replyOpenId = null;
}

function closeReport(): void {
	reportOpenId = null;
	reportError = "";
}

function handleKeydown(event: KeyboardEvent): void {
	if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
		event.preventDefault();
		formEl?.requestSubmit();
	}
}

/** 回复框里的 Ctrl / ⌘ + Enter：直接提交自己所在的表单。 */
function submitOnModEnter(event: KeyboardEvent): void {
	if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
	event.preventDefault();
	const form = (event.currentTarget as HTMLElement | null)?.closest("form");
	form?.requestSubmit();
}

/**
 * 播报一句话。必须先 tick 到空态：读屏只在 live region 的文本**发生变化**时朗读，
 * 连着两次「已发布。」如果中间没有空态，第二次不会被读出来。
 */
async function announce(message: string): Promise<void> {
	liveNotice = "";
	await tick();
	liveNotice = message;
}

function refresh(): void {
	void loadFirstPage();
}

function submitForm(event: SubmitEvent): void {
	void submit(event);
}

function submitReplyForm(event: SubmitEvent): void {
	void submitReply(event);
}

function submitReportForm(event: SubmitEvent): void {
	void submitReport(event);
}

function loadMoreClick(): void {
	void loadMore();
}

/**
 * 自动刷新策略：**提示条**，不是静默重排。每 30s 只在后台探一次首屏
 * （顶层、一页），发现列表里没有的 id 就挂一条「有 N 条新评论，点击刷新」。
 *
 * 为什么选提示条：读者正在读 / 正在写回复时，静默把列表插到最前面会让内容在
 * 眼皮底下跳位（还可能把正在回复的那条挤出视野）；评论区在文章底部，
 * 用户对时间不敏感，但对「我读到哪了」很敏感。提示条把刷新时机交回用户，
 * 同时后台仍然在拉，新评论不会一直不出现。
 *
 * 探测失败一律静默：自动刷新不该在读者面前刷错误条（手动刷新才报错）。
 */
async function checkForNew(): Promise<void> {
	if (demo || status !== "ready" || pollTimer === null) return;
	if (typeof document !== "undefined" && document.hidden) return;
	const result = await fetchComments({
		base,
		path,
		pageSize: COMMENT_PAGE_SIZE,
		topLevelOnly: true,
	});
	if (!result.ok) return;
	const known = new Set(comments.map((item) => item.id));
	const fresh = result.comments.filter((item) => !known.has(item.id));
	if (fresh.length > 0) newCount = fresh.length;
}

function armPolling(): void {
	if (pollTimer !== null || demo) return;
	if (typeof document !== "undefined" && document.hidden) return;
	pollTimer = setInterval(() => {
		void checkForNew();
	}, pollMs);
}

function disarmPolling(): void {
	if (pollTimer === null) return;
	clearInterval(pollTimer);
	pollTimer = null;
}

/** 页面隐藏就停轮询（省电、省配额），回到前台立刻探一次再重新起表。 */
function handleVisibility(): void {
	if (document.hidden) {
		disarmPolling();
		return;
	}
	void checkForNew();
	armPolling();
}

onMount(() => {
	base = resolveCommentApiBase(apiBase);
	author = readStoredAuthor();
	reportedIds = readReported();
	visitorHash = commentVisitorHash();
	void loadFirstPage();
	armPolling();
	document.addEventListener("visibilitychange", handleVisibility);
	return () => {
		disarmPolling();
		document.removeEventListener("visibilitychange", handleVisibility);
	};
});
</script>

{#snippet replyForm()}
	<form class="efc-reply-form" onsubmit={submitReplyForm}>
		<p class="efc-reply-title">
			{labels.replyTo(replyToName || labels.anonymous)}
		</p>
		<textarea
			class="efc-reply-input"
			rows="3"
			maxlength={textareaLimit}
			placeholder={labels.replyPlaceholder}
			aria-label={labels.replyPlaceholder}
			bind:value={replyContent}
			onkeydown={submitOnModEnter}
		></textarea>
		<div class="efc-foot">
			<p class="efc-reply-note">{labels.replyFlattenNote}</p>
			<button class="ef-btn small" type="button" onclick={closeReply}>
				{labels.replyCancel}
			</button>
			<button
				class="ef-btn go"
				type="submit"
				disabled={replySubmitting || !replyContent.trim()}
			>
				<EfIcon name="arrowSmall" class="efc-go-icon" />
				<span>{replySubmitting ? labels.submitting : labels.replySubmit}</span>
			</button>
		</div>
		{#if replyError}
			<p class="efc-form-error" role="alert">{replyError}</p>
		{/if}
	</form>
{/snippet}

{#snippet reportForm(id: string)}
	<form class="efc-report-form" onsubmit={submitReportForm}>
		<fieldset class="efc-report-set">
			<legend class="efc-report-legend">{labels.reportReason}</legend>
			<div class="efc-radio-row">
				{#each reportReasons as reason (reason.value)}
					<label class="efc-radio">
						<input
							type="radio"
							name="efc-reason-{id}"
							value={reason.value}
							checked={reportReason === reason.value}
							onchange={() => (reportReason = reason.value)}
						/>
						<span>{reason.label}</span>
					</label>
				{/each}
			</div>
		</fieldset>
		<div class="efc-foot">
			<button class="ef-btn small" type="button" onclick={closeReport}>
				{labels.reportCancel}
			</button>
			<button class="ef-btn small" type="submit" disabled={reportSubmitting}>
				{labels.reportSubmit}
			</button>
		</div>
		{#if reportError}
			<p class="efc-form-error" role="alert">{reportError}</p>
		{/if}
	</form>
{/snippet}

<div class="efc">
	<!-- 键盘 / 读屏用户的发布回执：视觉隐藏，位置在根节点最前，朗读顺序先于列表 -->
	<p class="efc-live" role="status" aria-live="polite">{liveNotice}</p>

	{#if demo}
		<p class="ef-notice efc-notice" data-flag={labels.demoFlag}>
			<span>{labels.demoText}</span>
		</p>
	{/if}

	<form class="ef-form efc-form" bind:this={formEl} onsubmit={submitForm}>
		<div class="field">
			<label for={nameId}>{labels.nameLabel}</label>
			<input
				id={nameId}
				name="author"
				type="text"
				maxlength={COMMENT_NAME_MAX}
				autocomplete="nickname"
				placeholder={labels.namePlaceholder}
				bind:value={author}
			/>
		</div>
		<div class="field">
			<label for={websiteId}>{labels.websiteLabel}</label>
			<input
				id={websiteId}
				name="website"
				type="text"
				inputmode="url"
				maxlength={COMMENT_WEBSITE_MAX}
				autocomplete="url"
				placeholder={labels.websitePlaceholder}
				bind:value={website}
			/>
		</div>
		<div class="field">
			<label for={contentId}>{labels.contentLabel}</label>
			<textarea
				id={contentId}
				name="content"
				rows="4"
				maxlength={textareaLimit}
				placeholder={labels.contentPlaceholder}
				bind:value={content}
				onkeydown={handleKeydown}
			></textarea>
		</div>
		<div class="efc-foot">
			<span class="ef-field efc-counter" class:efc-over={content.length > maxLength}>
				{counter}
			</span>
			<button class="ef-btn go" type="submit" disabled={!canSubmit}>
				<EfIcon name="arrowSmall" class="efc-go-icon" />
				<span>{submitting ? labels.submitting : labels.submit}</span>
			</button>
		</div>
		{#if formError}
			<p class="efc-form-error" role="alert">{formError}</p>
		{/if}
		{#if formErrorDetail}
			<p class="efc-detail">{formErrorDetail}</p>
		{/if}
		{#if formNotice}
			<p class="efc-form-ok">{formNotice}</p>
		{/if}
	</form>

	<div class="efc-head">
		<span class="ef-eyebrow slash">{labels.eyebrow}</span>
		<span class="ef-tag">{comments.length}</span>
		<button
			class="ef-btn small efc-refresh"
			type="button"
			disabled={status === "loading"}
			onclick={refresh}
		>
			{status === "loading" ? labels.loading : labels.refresh}
		</button>
	</div>

	{#if newCount > 0}
		<button class="efc-newbar" type="button" onclick={refresh}>
			<EfIcon name="arrowSmall" class="efc-newbar-icon" />
			<span>{labels.newComments(newCount)}</span>
		</button>
	{/if}

	{#if !hasLoadedList}
		{#if status === "loading"}
			<div class="efc-skeleton" aria-hidden="true">
				<span class="ef-skeleton line efc-bar-wide"></span>
				<span class="ef-skeleton line efc-bar-mid"></span>
				<span class="ef-skeleton line efc-bar-wide"></span>
			</div>
			<!-- client:visible 的降级说明：hydrate 之前这里只会停在三根骨架条上，
			     给一句看得见的解释，免得长文章底部看着像坏了。 -->
			<p class="efc-pending" aria-hidden="true">{labels.pendingHint}</p>
			<p class="efc-live" aria-live="polite">{labels.loading}</p>
		{:else if status === "error"}
			<p class="ef-notice efc-notice" data-flag={labels.errorFlag} role="alert">
				<span>{listError}</span>
			</p>
			<div class="ef-actions efc-actions">
				<button class="ef-btn small" type="button" onclick={refresh}>
					{labels.retry}
				</button>
			</div>
			{#if listErrorDetail}
				<p class="efc-detail">{listErrorDetail}</p>
			{/if}
		{:else}
			<div class="efc-empty">
				<div class="ef-hatch efc-hatch" aria-hidden="true"></div>
				<div class="efc-empty-row">
					<EfIcon name="navNotice" class="efc-empty-icon" />
					<p class="ef-empty">{demo ? labels.emptyDemo : labels.empty}</p>
				</div>
			</div>
		{/if}
	{:else}
		<!-- 已经有内容时刷新失败：保留列表，只在上面挂一条错误条 + 重试 -->
		{#if listError}
			<p class="ef-notice efc-notice" data-flag={labels.errorFlag} role="alert">
				<span>{listError}</span>
			</p>
			<div class="ef-actions efc-actions">
				<button class="ef-btn small" type="button" onclick={refresh}>
					{labels.retry}
				</button>
			</div>
		{/if}
		<ul class="ef-records efc-list">
			{#each topLevel as item (item.id)}
				<li class="efc-item" class:efc-item-reported={reportedIds.has(item.id)}>
					<div class="efc-avatar" aria-hidden="true">{initialOf(item.author)}</div>
					<div class="efc-main">
						<div class="efc-meta">
							{#if authorHref(item)}
								<a
									class="efc-author efc-author-link"
									href={authorHref(item)}
									rel="nofollow ugc noopener"
									target="_blank"
									title={labels.websiteLinkTitle}
								>
									<span>{item.author || labels.anonymous}</span>
									<EfIcon name="jump" class="efc-link-icon" />
								</a>
							{:else}
								<span class="efc-author">{item.author || labels.anonymous}</span>
							{/if}
							<span class="efc-sep" aria-hidden="true">│</span>
							<time class="ef-field" datetime={item.createdAt ?? undefined}>
								{formatCommentTime(item.createdAt, labels, locale)}
							</time>
							{#if item.preview}
								<span class="ef-state is-alert efc-preview">{labels.previewTag}</span>
							{/if}
							{#if reportedIds.has(item.id)}
								<span class="ef-state is-alert efc-reported">{labels.reported}</span>
							{/if}
						</div>
						<p class="efc-text">{item.content}</p>

						<div class="efc-actions-row">
							<button
								class="efc-act"
								type="button"
								aria-expanded={replyOpenId === item.id}
								onclick={() => openReply(item, item.id)}
							>
								<EfIcon name="arrowSmall" class="efc-act-icon" />
								<span>{labels.reply}</span>
							</button>
							{#if reportsSupported && isReportable(item)}
								<button
									class="efc-act"
									type="button"
									disabled={reportedIds.has(item.id)}
									aria-expanded={reportOpenId === item.id}
									onclick={() => openReport(item.id)}
								>
									<EfIcon name="navNotice" class="efc-act-icon" />
									<span>{reportedIds.has(item.id) ? labels.reported : labels.report}</span>
								</button>
							{/if}
						</div>

						{#if replyOpenId === item.id}
							{@render replyForm()}
						{/if}
						{#if reportOpenId === item.id}
							{@render reportForm(item.id)}
						{/if}

						{#if childrenOf(item.id).length > 0}
							<ul class="efc-children">
								{#each childrenOf(item.id) as child (child.id)}
									<li
										class="efc-child"
										class:efc-item-reported={reportedIds.has(child.id)}
									>
										<div class="efc-avatar efc-avatar-sm" aria-hidden="true">
											{initialOf(child.author)}
										</div>
										<div class="efc-main">
											<div class="efc-meta">
												{#if authorHref(child)}
													<a
														class="efc-author efc-author-link"
														href={authorHref(child)}
														rel="nofollow ugc noopener"
														target="_blank"
														title={labels.websiteLinkTitle}
													>
														<span>{child.author || labels.anonymous}</span>
														<EfIcon name="jump" class="efc-link-icon" />
													</a>
												{:else}
													<span class="efc-author">{child.author || labels.anonymous}</span>
												{/if}
												<span class="efc-sep" aria-hidden="true">│</span>
												<time class="ef-field" datetime={child.createdAt ?? undefined}>
													{formatCommentTime(child.createdAt, labels, locale)}
												</time>
												{#if reportedIds.has(child.id)}
													<span class="ef-state is-alert efc-reported">
														{labels.reported}
													</span>
												{/if}
											</div>
											<p class="efc-text">{child.content}</p>
											<div class="efc-actions-row">
												<!-- 子评论的「回复」把收件人设成它所在的顶层楼（item.id）：
												     结构上不可能长出第三层。 -->
												<button
													class="efc-act"
													type="button"
													aria-expanded={replyOpenId === child.id}
													onclick={() => openReply(child, item.id)}
												>
													<EfIcon name="arrowSmall" class="efc-act-icon" />
													<span>{labels.reply}</span>
												</button>
												{#if reportsSupported && isReportable(child)}
													<button
														class="efc-act"
														type="button"
														disabled={reportedIds.has(child.id)}
														aria-expanded={reportOpenId === child.id}
														onclick={() => openReport(child.id)}
													>
														<EfIcon name="navNotice" class="efc-act-icon" />
														<span>
															{reportedIds.has(child.id) ? labels.reported : labels.report}
														</span>
													</button>
												{/if}
											</div>
											{#if replyOpenId === child.id}
												{@render replyForm()}
											{/if}
											{#if reportOpenId === child.id}
												{@render reportForm(child.id)}
											{/if}
										</div>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</li>
			{/each}
		</ul>

		{#if moreError}
			<p class="efc-form-error" role="alert">{moreError}</p>
		{/if}
		{#if hasMore}
			<div class="ef-actions efc-actions">
				<button
					class="ef-btn small"
					type="button"
					disabled={loadingMore}
					onclick={loadMoreClick}
				>
					<EfIcon
						name="chevronThin"
						class="efc-more-icon"
						style="transform: rotate(90deg)"
					/>
					<span>{loadingMore ? labels.loadingMore : labels.loadMore}</span>
				</button>
			</div>
		{:else}
			<p class="efc-end">{labels.endOfList}</p>
		{/if}

		{#if hasPreview}
			<p class="efc-note">{labels.previewNote}</p>
		{/if}
	{/if}
</div>

<style>
	/* 尺寸一律走官网单位 --efu（1rem = 12px @1920×1080），字级用站点角色 token。 */
	.efc {
		display: flex;
		flex-direction: column;
		gap: calc(1.5 * var(--efu, 12px));
	}

	.efc-notice {
		align-items: flex-start;
	}

	.efc-notice > span {
		line-height: var(--ef-lh-body);
	}

	.efc-form {
		display: flex;
		flex-direction: column;
		gap: calc(1 * var(--efu, 12px));
	}

	.efc-form .field > label {
		font-size: var(--ef-fs-meta);
		font-weight: 600;
		color: var(--ef-ink);
	}

	.efc-foot {
		display: flex;
		align-items: center;
		gap: calc(1 * var(--efu, 12px));
		flex-wrap: wrap;
	}

	.efc-counter {
		margin-right: auto;
	}

	.efc-over {
		background: var(--ef-signal);
		color: #161616;
		font-weight: 700;
		padding: 0 calc(0.4 * var(--efu, 12px));
	}

	/* EfIcon 是子组件，类名挂在它的根 svg 上，父组件的 scoped hash 覆盖不到 → 用 :global */
	:global(.efc-go-icon) {
		font-size: calc(0.9 * var(--efu, 12px));
	}

	.efc-form-error {
		margin: 0;
		padding: calc(0.5 * var(--efu, 12px)) calc(0.8 * var(--efu, 12px));
		background: var(--ef-signal);
		color: var(--ef-ink);
		font-weight: 700;
	}

	.efc-form-ok {
		margin: 0;
		padding-left: calc(0.7 * var(--efu, 12px));
		border-left: 3px solid var(--ef-signal);
		color: var(--ef-ink);
	}

	.efc-detail {
		margin: 0;
		color: var(--ef-ink-2);
		font-size: var(--ef-fs-2);
		overflow-wrap: anywhere;
	}

	.efc-head {
		display: flex;
		align-items: center;
		gap: calc(0.75 * var(--efu, 12px));
		padding-top: calc(1 * var(--efu, 12px));
		border-top: 1px solid var(--ef-rule);
	}

	.efc-refresh {
		margin-left: auto;
	}

	/* 「有新评论」提示条：不是静默重排，点击才刷新 */
	.efc-newbar {
		display: flex;
		align-items: center;
		gap: calc(0.6 * var(--efu, 12px));
		width: 100%;
		padding: calc(0.7 * var(--efu, 12px)) calc(0.9 * var(--efu, 12px));
		border: 0;
		border-left: 3px solid var(--ef-signal);
		background: var(--ef-paper);
		color: var(--ef-ink);
		font-family: inherit;
		font-size: var(--ef-fs-small);
		font-weight: 700;
		text-align: left;
		cursor: pointer;
	}

	.efc-newbar:hover {
		background: var(--ef-signal);
	}

	.efc-newbar:focus-visible {
		outline: 2px solid var(--ef-ink);
		outline-offset: 2px;
	}

	:global(.efc-newbar-icon) {
		font-size: calc(0.9 * var(--efu, 12px));
	}

	.efc-skeleton {
		display: flex;
		flex-direction: column;
		gap: calc(0.5 * var(--efu, 12px));
		margin-top: calc(0.5 * var(--efu, 12px));
	}

	.efc-bar-wide {
		width: 82%;
	}

	.efc-bar-mid {
		width: 56%;
	}

	.efc-pending {
		margin: 0;
		color: var(--ef-ink-2);
		font-size: var(--ef-fs-2);
	}

	.efc-live {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.efc-actions {
		margin-top: calc(0.5 * var(--efu, 12px));
	}

	.efc-empty {
		margin-top: calc(0.5 * var(--efu, 12px));
	}

	.efc-hatch {
		height: calc(3 * var(--efu, 12px));
		border: 1px solid var(--ef-rule);
	}

	.efc-empty-row {
		display: flex;
		align-items: center;
		gap: calc(0.75 * var(--efu, 12px));
		margin-top: calc(0.75 * var(--efu, 12px));
	}

	:global(.efc-empty-icon) {
		font-size: calc(1.6 * var(--efu, 12px));
		color: var(--ef-ink-2);
	}

	.ef-empty {
		margin: 0;
	}

	.efc-list {
		margin-top: calc(0.5 * var(--efu, 12px));
	}

	.efc-item {
		display: flex;
		gap: calc(1 * var(--efu, 12px));
		padding: calc(1 * var(--efu, 12px)) 0;
	}

	/* 已举报的条目灰掉：一眼能看出这条已经报过，不用再点 */
	.efc-item-reported {
		opacity: 0.55;
	}

	.efc-avatar {
		flex: none;
		display: grid;
		place-items: center;
		width: calc(2.5 * var(--efu, 12px));
		height: calc(2.5 * var(--efu, 12px));
		background: var(--ef-ink);
		color: var(--ef-paper);
		font-family: var(--ef-font-num);
		font-size: var(--ef-fs-3);
		line-height: 1;
	}

	.efc-avatar-sm {
		width: calc(2 * var(--efu, 12px));
		height: calc(2 * var(--efu, 12px));
		font-size: var(--ef-fs-2);
	}

	.efc-main {
		display: flex;
		flex-direction: column;
		gap: calc(0.4 * var(--efu, 12px));
		min-width: 0;
		flex: 1;
	}

	.efc-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: calc(0.5 * var(--efu, 12px));
	}

	.efc-author {
		font-weight: 700;
		color: var(--ef-ink);
	}

	/* 昵称带 website 时才渲染成外链（nofollow ugc noopener） */
	.efc-author-link {
		display: inline-flex;
		align-items: center;
		gap: calc(0.3 * var(--efu, 12px));
		color: var(--ef-ink);
		text-decoration: none;
		border-bottom: 1px solid var(--ef-rule);
	}

	.efc-author-link:hover {
		border-bottom-color: var(--ef-ink);
	}

	.efc-author-link:focus-visible {
		outline: 2px solid var(--ef-signal);
		outline-offset: 2px;
	}

	:global(.efc-link-icon) {
		font-size: calc(0.8 * var(--efu, 12px));
		color: var(--ef-ink-2);
	}

	.efc-sep {
		color: var(--ef-ink-2);
	}

	.efc-text {
		margin: 0;
		color: var(--ef-ink);
		line-height: var(--ef-lh-body);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	/* 回复 / 举报：文字按钮，尺寸与 .ef-field 一致 */
	.efc-actions-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: calc(1 * var(--efu, 12px));
	}

	.efc-act {
		display: inline-flex;
		align-items: center;
		gap: calc(0.35 * var(--efu, 12px));
		padding: 0;
		border: 0;
		background: none;
		color: var(--ef-ink-2);
		font-family: inherit;
		font-size: var(--ef-fs-small);
		line-height: var(--ef-lh-ui);
		cursor: pointer;
	}

	.efc-act:hover:not(:disabled) {
		color: var(--ef-ink);
		background: var(--ef-signal);
	}

	.efc-act:focus-visible {
		outline: 2px solid var(--ef-signal);
		outline-offset: 2px;
	}

	.efc-act:disabled {
		cursor: default;
		opacity: 0.6;
	}

	:global(.efc-act-icon) {
		font-size: calc(0.85 * var(--efu, 12px));
	}

	/* 楼中楼：一层缩进 + 左侧竖线，明确「这是某个楼的回复」 */
	.efc-children {
		list-style: none;
		margin: calc(0.5 * var(--efu, 12px)) 0 0;
		padding: 0 0 0 calc(1.2 * var(--efu, 12px));
		border-left: 2px solid var(--ef-rule);
		display: flex;
		flex-direction: column;
		gap: calc(0.25 * var(--efu, 12px));
	}

	.efc-child {
		display: flex;
		gap: calc(0.75 * var(--efu, 12px));
		padding: calc(0.6 * var(--efu, 12px)) 0;
	}

	.efc-reply-form,
	.efc-report-form {
		display: flex;
		flex-direction: column;
		gap: calc(0.6 * var(--efu, 12px));
		margin-top: calc(0.6 * var(--efu, 12px));
		padding: calc(0.8 * var(--efu, 12px));
		background: var(--ef-paper);
		border-left: 3px solid var(--ef-signal);
	}

	.efc-reply-title {
		margin: 0;
		color: var(--ef-ink);
		font-size: var(--ef-fs-small);
		font-weight: 700;
	}

	.efc-reply-input {
		width: 100%;
	}

	.efc-reply-note {
		margin: 0 auto 0 0;
		color: var(--ef-ink-2);
		font-size: var(--ef-fs-2);
		line-height: var(--ef-lh-ui);
	}

	.efc-report-set {
		margin: 0;
		padding: 0;
		border: 0;
	}

	.efc-report-legend {
		padding: 0;
		margin-bottom: calc(0.4 * var(--efu, 12px));
		color: var(--ef-ink);
		font-size: var(--ef-fs-small);
		font-weight: 700;
	}

	.efc-radio-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: calc(1 * var(--efu, 12px));
	}

	.efc-radio {
		display: inline-flex;
		align-items: center;
		gap: calc(0.35 * var(--efu, 12px));
		color: var(--ef-ink);
		font-size: var(--ef-fs-small);
		cursor: pointer;
	}

	:global(.efc-more-icon) {
		font-size: calc(0.85 * var(--efu, 12px));
	}

	/* 「到底了」：没有更多评论时的收尾文案 */
	.efc-end {
		margin: calc(0.75 * var(--efu, 12px)) 0 0;
		color: var(--ef-ink-2);
		font-size: var(--ef-fs-small);
	}

	.efc-reported {
		text-transform: none;
	}

	.efc-note {
		margin: calc(0.75 * var(--efu, 12px)) 0 0;
		color: var(--ef-ink-2);
		font-size: var(--ef-fs-small);
	}
</style>
