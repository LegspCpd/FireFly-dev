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
 */
import { onMount, tick } from "svelte";
import EfIcon from "@/components/common/EfIcon.svelte";
import {
	type CommentApiError,
	type CommentItem,
	fetchComments,
	isCommentApiConfigured,
	normalizeApiBase,
	postComment,
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
const contentId = "ef-comment-content";
const storageKey = "ef:comment:author";
/** 输入框自身留点余量，让超限提示由我们给，而不是被 maxlength 直接吞掉。 */
const textareaLimit = maxLength + 200;

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

let comments = $state<CommentItem[]>([]);
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
let content = $state("");
let submitting = $state(false);
let formEl = $state<HTMLFormElement | null>(null);
/** 竞态保护：只有最后一次请求的结果能落到界面上。 */
let requestSeq = 0;

const demo = $derived(!isCommentApiConfigured(base));
const counter = $derived(`${content.length} / ${maxLength}`);
const canSubmit = $derived(!submitting && content.trim().length > 0);
const hasPreview = $derived(comments.some((item) => item.preview));

function initialOf(name: string): string {
	const value = name.trim();
	if (!value) return "?";
	return Array.from(value)[0] ?? "?";
}

function describeError(error: CommentApiError, phase: "load" | "post"): string {
	switch (error.kind) {
		case "network":
			return phase === "load"
				? labels.networkLoadFailed
				: labels.networkPostFailed;
		case "timeout":
			return labels.timeoutFailed;
		case "http":
			return labels.httpFailed(error.status);
		default:
			return phase === "load" ? labels.loadFailed : labels.postFailed;
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

async function load(): Promise<void> {
	if (!isCommentApiConfigured(base)) {
		status = "ready";
		return;
	}
	const run = ++requestSeq;
	status = "loading";
	listError = "";
	listErrorDetail = "";
	const result = await fetchComments({ base, path });
	if (run !== requestSeq) return;
	if (result.ok) {
		comments = result.comments;
		status = "ready";
		return;
	}
	listError = describeError(result.error, "load");
	listErrorDetail = result.error.detail;
	status = "error";
}

async function submit(event: SubmitEvent): Promise<void> {
	event.preventDefault();
	if (submitting) return;
	const text = content.trim();
	const name = author.trim();
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
			},
			...comments,
		];
		content = "";
		status = "ready";
		rememberAuthor(name);
		return;
	}

	submitting = true;
	const result = await postComment({ base, path }, { author: name, content: text });
	submitting = false;
	if (!result.ok) {
		// 失败保留草稿，只出一条内联提示。
		formError = describeError(result.error, "post");
		formErrorDetail = result.error.detail;
		return;
	}
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

function handleKeydown(event: KeyboardEvent): void {
	if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
		event.preventDefault();
		formEl?.requestSubmit();
	}
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
	void load();
}

function submitForm(event: SubmitEvent): void {
	void submit(event);
}

onMount(() => {
	base = resolveCommentApiBase(apiBase);
	author = readStoredAuthor();
	void load();
});
</script>

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
				maxlength="40"
				autocomplete="nickname"
				placeholder={labels.namePlaceholder}
				bind:value={author}
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
	{:else if comments.length === 0}
		<div class="efc-empty">
			<div class="ef-hatch efc-hatch" aria-hidden="true"></div>
			<div class="efc-empty-row">
				<EfIcon name="navNotice" class="efc-empty-icon" />
				<p class="ef-empty">{demo ? labels.emptyDemo : labels.empty}</p>
			</div>
		</div>
	{:else}
		<ul class="ef-records efc-list">
			{#each comments as item (item.id)}
				<li class="efc-item">
					<div class="efc-avatar" aria-hidden="true">{initialOf(item.author)}</div>
					<div class="efc-main">
						<div class="efc-meta">
							<span class="efc-author">{item.author || labels.anonymous}</span>
							<span class="efc-sep" aria-hidden="true">│</span>
							<time class="ef-field" datetime={item.createdAt ?? undefined}>
								{formatCommentTime(item.createdAt, labels, locale)}
							</time>
							{#if item.preview}
								<span class="ef-state is-alert efc-preview">{labels.previewTag}</span>
							{/if}
						</div>
						<p class="efc-text">{item.content}</p>
					</div>
				</li>
			{/each}
		</ul>
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

	.efc-go-icon {
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

	.efc-empty-icon {
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

	.efc-main {
		display: flex;
		flex-direction: column;
		gap: calc(0.4 * var(--efu, 12px));
		min-width: 0;
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

	.efc-note {
		margin: calc(0.75 * var(--efu, 12px)) 0 0;
		color: var(--ef-ink-2);
		font-size: var(--ef-fs-small);
	}
</style>
