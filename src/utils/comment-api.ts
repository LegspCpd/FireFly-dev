/**
 * 自建评论系统的 API 客户端 —— 纯 fetch，平台无关。
 *
 * 为什么不是 Cloudflare Pages Functions：
 *   本站同时部署在 Cloudflare Pages / Vercel / EdgeOne Pages 三个平台。
 *   `functions/api/**` 这种 Pages Functions 目录约定只在 Cloudflare Pages 上执行，
 *   在 Vercel / EdgeOne 上不会跑；所以评论后端必须是**独立的外部服务**，
 *   三边的静态页面只是调它的 API。
 *
 * 本文件只做三件事：
 *   1. 解析 API 根地址（COMMENT_API_BASE / PUBLIC_COMMENT_API_BASE 环境变量、
 *      运行时全局 window.__COMMENT_API_BASE__、配置文件兜底）；
 *   2. 按 docs/comment-api.md 的契约发 GET / POST；
 *   3. 把后端返回的多种字段形状归一化成 CommentItem。所有失败都返回结果对象，
 *      **不抛异常** —— 组件据此降级成演示态 / 内联错误条，不会白屏、不会刷屏报错；
 *   4. 分页 / 楼中楼 / 举报：列表按 keyset 游标（created_at + id）翻页，子评论另发一次
 *      parent_id 批量查询，举报写 public.comment_reports。这三件事只在 PostgREST 方言下
 *      成立（通用契约没有对应约定，各函数上都写明了退化行为）。
 *
 * 后端有两种方言，同一份代码按地址自动识别（组件不用改）：
 *   - 通用契约：{base}/comments?path=…（自建 Worker / Supabase Edge Function 等）；
 *   - Neon Data API（PostgREST 风格）：base 形如
 *     https://<endpoint>.apirest.<region>.aws.neon.tech/<db>/rest/v1，
 *     走 {base}/comments?select=…&path=eq.…（见 docs/neon-data-api.md）。
 *     **请求必须带 JWT**：网关对没有 Authorization 的请求一律 400，所以客户端先去
 *     Neon Auth 的 /token/anonymous 换一张短命匿名 JWT（role=anonymous），
 *     缓存到内存、过期/被吊销时自动重取重试一次。浏览器里不需要、也没有任何密钥。
 */

/** 一条评论（已归一化）。 */
export type CommentItem = {
	id: string;
	/** 昵称，可能是空串（后端未给），由组件回退成「匿名」。 */
	author: string;
	content: string;
	/** ISO 时间串；后端没给就是 null。 */
	createdAt: string | null;
	/** 头像地址，可为空串（组件用首字母方块兜底）。 */
	avatar: string;
	/** true = 本地演示态预览，不来自后端。 */
	preview: boolean;
	/** 主页地址（可选）；组件只把 http/https 渲染成 nofollow 外链，其余按纯文本。 */
	website: string;
	/** 父评论 id；顶层评论为 null（后端没给也算顶层）。 */
	parentId: string | null;
};

export type CommentApiErrorKind =
	| "invalid"
	| "network"
	| "timeout"
	| "http"
	/** 429（PostgREST 里是 PT429）：被限流，界面换成「发送太快」而不是通用失败。 */
	| "rateLimit"
	/** 409（PT409）：10 分钟内同 path + 昵称 + 正文的重复提交。 */
	| "duplicate"
	| "parse";

export type CommentApiError = {
	kind: CommentApiErrorKind;
	/** HTTP 状态码；非 http 错误时为 0。 */
	status: number;
	/** 供排查用的短文本，组件只折叠展示。 */
	detail: string;
};

export type CommentListResult =
	| {
			ok: true;
			comments: CommentItem[];
			/** true = 还有下一页（靠「多取一条」判断，不额外发 count 请求）。 */
			hasMore: boolean;
	  }
	| { ok: false; error: CommentApiError };

export type CommentRepliesResult =
	| { ok: true; replies: CommentItem[] }
	| { ok: false; error: CommentApiError };

/** 举报原因：与 comment_reports.reason 的取值对齐（三个固定选项，前端不做自由输入）。 */
export type CommentReportReason = "spam" | "offensive" | "other";

export type CommentReportInput = {
	/** 被举报评论的 id（PostgREST 的 bigint 主键，能转数字就转）。 */
	commentId: string;
	reason: CommentReportReason;
	/**
	 * 尽力而为的访客指纹 hash（**不是 IP**，浏览器拿不到自己的 IP）。
	 * 只有 comment_reports 有 ip_hash 列；comments 表没有，所以发帖时**不能**带。
	 */
	visitorHash?: string;
};

export type CommentReportResult =
	| { ok: true }
	| { ok: false; error: CommentApiError };

export type CommentPostResult =
	| { ok: true; comment: CommentItem }
	| { ok: false; error: CommentApiError };

export type CommentThread = {
	/** API 根地址，例如 https://comments.example.workers.dev */
	base: string;
	/** 线程键：后端用它区分文章 / 留言板，例如 /posts/hello。 */
	path: string;
	/** 超时毫秒数，默认 8000。 */
	timeoutMs?: number;
	/** 每页条数，默认 COMMENT_PAGE_SIZE（只对 PostgREST 方言生效）。 */
	pageSize?: number;
	/** true = 只要顶层评论（楼中楼的子评论另外批量取）。 */
	topLevelOnly?: boolean;
	/** keyset 游标：从这一条**之后**继续取；null / 省略 = 首屏。 */
	cursor?: CommentCursor | null;
};

/** keyset 游标 = 上一页最后一条的排序键（order 是 created_at DESC, id DESC）。 */
export type CommentCursor = {
	createdAt: string;
	id: string;
};

export type CommentDraft = {
	author: string;
	content: string;
	/** 可选的个人网站；上限与库里的 comments_website_len 一致（200）。 */
	website?: string;
	/** 回复某条评论时带父 id；顶层评论留空。 */
	parentId?: string | null;
};

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_DETAIL_LENGTH = 300;

/**
 * 每页条数：首屏 20 条，点「加载更多」用 keyset 游标续取。
 * 不用 offset —— 翻页期间有人插评论时，offset 会漏条 / 重条。
 */
export const COMMENT_PAGE_SIZE = 20;
/** 一次批量取子评论的上限（只有一层楼中楼，正常远小于这个数）。 */
export const COMMENT_REPLY_LIMIT = 200;
/** 昵称 / 网站长度上限，与数据库 CHECK 约束（comments_nickname_len / comments_website_len）对齐。 */
export const COMMENT_NAME_MAX = 40;
export const COMMENT_WEBSITE_MAX = 200;

/** 环境变量名，按优先级排列：先私有名（构建期），再 Astro 的 PUBLIC_ 公开名。 */
const ENV_NAMES: readonly string[] = ["COMMENT_API_BASE", "PUBLIC_COMMENT_API_BASE"];

/** 去掉尾部斜杠与空白；拿不到字符串就返回空串。 */
export function normalizeApiBase(raw: unknown): string {
	if (typeof raw !== "string") return "";
	return raw.trim().replace(/\/+$/, "");
}

/**
 * 线程键归一化 —— **全站唯一实现**，评论组件与各调用点都不再各写一份。
 *
 * 为什么必须归一化：留言板 / 友链 / 打赏 / 动态这些调用点写的是带尾斜杠的
 * `/guestbook/`，而文章页写的是 `/posts/<slug>`（不带）。后端把 path 当纯字符串
 * 比对，于是 /guestbook 与 /guestbook/ 会变成两条互不相通的线程。
 *
 * 规则只有三条：去掉首尾空白、保证以 / 开头、去掉尾部斜杠。
 * 大小写、`.html`、查询串一律不动 —— 归一化不是重写，不能把两条本就不同的
 * 线程合并成一条。
 */
export function normalizeThreadPath(raw: unknown): string {
	if (typeof raw !== "string") return "/";
	const trimmed = raw.trim();
	if (!trimmed) return "/";
	const leaded = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
	return leaded.replace(/\/+$/, "") || "/";
}

function readEnvValue(name: string): string {
	try {
		const env = import.meta.env as Record<string, unknown> | undefined;
		const value = env?.[name];
		if (typeof value === "string" && value.trim()) return value.trim();
	} catch {
		// 构建脚本 / 非 Vite 环境没有 import.meta.env
	}
	return "";
}

function readProcessEnvValue(name: string): string {
	try {
		if (typeof process === "undefined" || !process.env) return "";
		const value = process.env[name];
		return typeof value === "string" && value.trim() ? value.trim() : "";
	} catch {
		return "";
	}
}

/** 读构建期环境变量：COMMENT_API_BASE 优先，PUBLIC_COMMENT_API_BASE 兜底。 */
export function readEnvApiBase(): string {
	for (const name of ENV_NAMES) {
		const value = readEnvValue(name) || readProcessEnvValue(name);
		if (value) return value;
	}
	return "";
}

/** 读运行时全局（部署平台注入 <script>window.__COMMENT_API_BASE__ = "…"</script> 时用）。 */
export function readRuntimeApiBase(): string {
	try {
		if (typeof window === "undefined") return "";
		const value = (window as unknown as Record<string, unknown>)
			.__COMMENT_API_BASE__;
		return typeof value === "string" ? value.trim() : "";
	} catch {
		return "";
	}
}

/**
 * 解析最终 API 根地址，优先级：
 *   运行时全局 > 环境变量 > 配置文件里的 apiBase。
 * 返回空串 = 未配置 → 组件进入演示态。
 */
export function resolveCommentApiBase(configBase?: string): string {
	const runtime = readRuntimeApiBase();
	if (runtime) return normalizeApiBase(runtime);
	const fromEnv = readEnvApiBase();
	if (fromEnv) return normalizeApiBase(fromEnv);
	return normalizeApiBase(configBase);
}

export function isCommentApiConfigured(base: string): boolean {
	return normalizeApiBase(base).length > 0;
}

/**
 * 是不是 Neon Data API（PostgREST）的根地址。
 * 只有 …/rest/v1 结尾才算；通用契约后端不会长这样。
 */
export function isDataApiBase(raw: unknown): boolean {
	return /\/rest\/v1$/i.test(normalizeApiBase(raw));
}

/** Data API 需要的列，与 docs/neon-data-api.md 的建表 SQL 一一对应。 */
const DATA_API_COLUMNS =
	"id,nickname,website,parent_id,content,created_at,status";

type DataApiListOptions = {
	pageSize: number;
	topLevelOnly?: boolean;
	cursor?: CommentCursor | null;
};

/**
 * PostgREST 的列表地址。过滤值写成 `eq.` 前缀，
 * 免得 path 里的特殊字符被 PostgREST 误解析成运算符。
 *
 * 排序 (created_at DESC, id DESC) 与库里的
 * comments_path_created_idx (path, created_at DESC, id DESC) 对齐，
 * 游标条件就是「严格小于上一页最后一条的排序键」：
 *   created_at < C 或 (created_at = C 且 id < I)
 * created_at 是 timestamptz，同刻多条是可能的，所以必须用 id 兜底。
 *
 * limit 故意多要一条：返回数 > pageSize 就说明还有下一页，省掉一次 count 查询。
 */
function buildDataApiListUrl(
	base: string,
	path: string,
	options: DataApiListOptions,
): string {
	const params = new URLSearchParams({
		select: DATA_API_COLUMNS,
		path: `eq.${path}`,
		status: "eq.visible",
		order: "created_at.desc,id.desc",
		limit: String(options.pageSize + 1),
	});
	if (options.topLevelOnly) params.set("parent_id", "is.null");
	if (options.cursor) {
		// 值里的 + 号（+00:00）由 URLSearchParams 编码成 %2B，PostgREST 解回来就是原文
		params.set(
			"or",
			`(created_at.lt.${options.cursor.createdAt},and(created_at.eq.${options.cursor.createdAt},id.lt.${options.cursor.id}))`,
		);
	}
	return `${base}/comments?${params.toString()}`;
}

/**
 * 一批父评论的子评论（楼中楼第一层）。子评论按**时间正序**（老的在上），
 * 与顶层列表的倒序相反 —— 一层楼里先说的先读。
 */
function buildDataApiRepliesUrl(
	base: string,
	path: string,
	parentIds: readonly string[],
): string {
	const params = new URLSearchParams({
		select: DATA_API_COLUMNS,
		path: `eq.${path}`,
		status: "eq.visible",
		parent_id: `in.(${parentIds.join(",")})`,
		order: "created_at.asc,id.asc",
		limit: String(COMMENT_REPLY_LIMIT),
	});
	return `${base}/comments?${params.toString()}`;
}

/**
 * Data API 的匿名 token 端点。Neon 的 Data API 网关对**没有 JWT** 的请求一律回
 * `400 missing authentication credentials …`，所以即使只是「匿名读公开数据」，
 * 也要先去 Neon Auth 换一张短命 JWT（其 role claim = anonymous，落库仍是 anonymous 角色）。
 * 端点地址可从 Data API 地址推出来：主机名 `.apirest.` → `.neonauth.`，路径 `/rest/v1` → `/auth`。
 */
export function deriveAuthBase(dataApiBase: string): string {
	const normalized = normalizeApiBase(dataApiBase);
	if (!isDataApiBase(normalized)) return "";
	return normalized.replace(/\/rest\/v1$/i, "/auth").replace(".apirest.", ".neonauth.");
}

const ANON_TOKEN_PATH = "/token/anonymous";
/** token 有效期约 1 小时；提前 60s 换新的，免得请求正好压在过期点上。 */
const TOKEN_SKEW_MS = 60_000;
/** 拿不到 expires_at 时的兜底寿命。 */
const TOKEN_FALLBACK_MS = 5 * 60_000;
/** 只存内存：短命匿名 token 没必要落盘，多标签页各拿一张即可。 */
let anonToken: { token: string; expiresAt: number } | null = null;

/** 终末地把任意抛出物翻译成组件认识的错误对象。 */
function toResultError(error: unknown): CommentApiError {
	if (isRecord(error) && typeof (error as { kind?: unknown }).kind === "string") {
		return error as unknown as CommentApiError;
	}
	return toNetworkError(error);
}

async function getAnonymousToken(
	authBase: string,
	timeoutMs: number,
): Promise<string> {
	if (!authBase) throw makeError("invalid", 0, "no auth base");
	if (anonToken && anonToken.expiresAt - TOKEN_SKEW_MS > Date.now()) {
		return anonToken.token;
	}
	let response: Response;
	try {
		response = await requestWithTimeout(
			`${authBase}${ANON_TOKEN_PATH}`,
			{
				method: "GET",
				headers: { Accept: "application/json" },
				credentials: "omit",
				cache: "no-store",
			},
			timeoutMs,
		);
	} catch (error) {
		throw toNetworkError(error);
	}
	if (!response.ok) {
		throw makeError(
			"http",
			response.status,
			`anonymous token: ${await readDetail(response)}`,
		);
	}
	let payload: unknown;
	try {
		payload = await response.json();
	} catch (error) {
		throw makeError(
			"parse",
			response.status,
			error instanceof Error ? error.message : String(error),
		);
	}
	const token =
		isRecord(payload) && typeof payload.token === "string" ? payload.token : "";
	if (!token) throw makeError("parse", response.status, "anonymous token missing");
	const expires =
		isRecord(payload) && typeof payload.expires_at === "number"
			? payload.expires_at * 1000
			: Date.now() + TOKEN_FALLBACK_MS;
	anonToken = { token, expiresAt: expires };
	return token;
}

function sendWithToken(
	url: string,
	init: RequestInit,
	token: string,
	timeoutMs: number,
): Promise<Response> {
	const headers: Record<string, string> = {
		...(init.headers as Record<string, string> | undefined),
		Authorization: `Bearer ${token}`,
	};
	return requestWithTimeout(url, { ...init, headers }, timeoutMs);
}

/**
 * 判断这次失败是不是「token 不认」——Neon 网关对**任何** JWT 问题都回 400，
 * 文案是 "missing authentication credentials…" / "Provided authentication token is not a
 * valid JWT encoding"；换别家实现可能回 401。RLS 的 403（row-level security /
 * permission denied）不在此列，不会被误当成鉴权失败。
 */
async function isAuthFailure(response: Response): Promise<boolean> {
	if (response.status === 401) return true;
	if (response.status !== 400 && response.status !== 403) return false;
	try {
		const detail = await response.clone().text();
		return /missing authentication credentials|not a valid jwt|jwt|expired/i.test(detail);
	} catch {
		return false;
	}
}

/**
 * Data API 专用请求：先换匿名 token，再带 Authorization 发出；token 过期/被吊销时
 * 丢掉缓存重拿一张再试一次（只重试一次，避免无限循环）。
 */
async function dataApiRequest(
	url: string,
	init: RequestInit,
	authBase: string,
	timeoutMs: number,
): Promise<Response> {
	const token = await getAnonymousToken(authBase, timeoutMs);
	const response = await sendWithToken(url, init, token, timeoutMs);
	if (!(await isAuthFailure(response))) return response;
	anonToken = null;
	const fresh = await getAnonymousToken(authBase, timeoutMs);
	return sendWithToken(url, init, fresh, timeoutMs);
}

function makeError(
	kind: CommentApiErrorKind,
	status: number,
	detail: string,
): CommentApiError {
	return { kind, status, detail: detail.slice(0, MAX_DETAIL_LENGTH) };
}

/**
 * 把非 2xx 归到「限流 / 重复 / 普通 HTTP」三档。实测（2026-10-25，Neon Data API + 库里触发器）：
 *
 *   429 {"code":"PT429","message":"rate limit exceeded: site-wide flood valve (60/min)",
 *        "details":"comment_rate_limit_global",
 *        "hint":"too many comments in the last 60 seconds across all clients"}
 *   409 {"code":"PT409","message":"duplicate comment","details":"comment_duplicate",
 *        "hint":"identical path+nickname+content already posted within 10 minutes"}
 *
 * PostgREST 把 SQLSTATE `PT<xxx>` 原样映射成 HTTP <xxx>，所以状态码是主判据，
 * 响应体里的 code / details 用来兜底（换成别家实现时也认这套文本）。
 * 原始 message 仍收进 detail，折叠显示，方便排查。
 */
function toHttpError(status: number, detail: string): CommentApiError {
	if (status === 429 || /PT429|rate.?limit|too many requests/i.test(detail)) {
		return makeError("rateLimit", status, detail);
	}
	if (status === 409 || /PT409|duplicate/i.test(detail)) {
		return makeError("duplicate", status, detail);
	}
	return makeError("http", status, detail);
}

function toNetworkError(error: unknown): CommentApiError {
	const name =
		typeof error === "object" && error !== null && "name" in error
			? String((error as { name?: unknown }).name)
			: "";
	if (name === "AbortError" || name === "TimeoutError") {
		return makeError("timeout", 0, "request aborted");
	}
	const message = error instanceof Error ? error.message : String(error);
	return makeError("network", 0, message);
}

async function requestWithTimeout(
	url: string,
	init: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

function pickString(
	record: Record<string, unknown>,
	keys: readonly string[],
): string {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value.trim();
		if (typeof value === "number" && Number.isFinite(value)) return String(value);
	}
	return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 把后端任意一条记录归一化；没有正文的记录会被丢掉（返回 null）。 */
export function toCommentItem(raw: unknown, index: number): CommentItem | null {
	if (!isRecord(raw)) return null;
	const content = pickString(raw, ["content", "text", "body", "message"]);
	if (!content) return null;
	const idRaw = raw.id ?? raw.Id ?? raw._id ?? raw.key ?? raw.uuid;
	const id =
		typeof idRaw === "string" || typeof idRaw === "number"
			? String(idRaw)
			: `item-${index}`;
	return {
		id,
		author: pickString(raw, ["author", "nick", "nickname", "name", "username"]),
		content,
		createdAt:
			pickString(raw, [
				"createdAt",
				"created_at",
				"created",
				"time",
				"date",
				"inserted_at",
			]) || null,
		avatar: pickString(raw, [
			"avatar",
			"photo",
			"avatarUrl",
			"avatar_url",
			"gravatar",
		]),
		preview: false,
		website: pickString(raw, ["website", "url", "homepage", "site"]),
		parentId: pickString(raw, ["parent_id", "parentId", "parent"]) || null,
	};
}

/** 列表响应容忍三种形状：[...]、{comments:[...]}、{data:[...]}。 */
function extractList(payload: unknown): CommentItem[] {
	const rows = Array.isArray(payload)
		? payload
		: isRecord(payload)
			? (() => {
					for (const key of ["comments", "data", "items", "results"]) {
						const value = payload[key];
						if (Array.isArray(value)) return value;
					}
					return [];
				})()
			: [];
	const items: CommentItem[] = [];
	const seen = new Set<string>();
	const push = (item: CommentItem | null) => {
		if (!item) return;
		// 后端 id 重复时补后缀：列表是 keyed each，重复 key 会直接抛错。
		let id = item.id;
		while (seen.has(id)) id = `${item.id}#${seen.size}`;
		seen.add(id);
		items.push(id === item.id ? item : { ...item, id });
	};
	rows.forEach((row, index) => {
		if (Array.isArray(row) && row.length >= 4) {
			// 数组行（PostgREST 显式要求数组返回时）：[id, path, author, content, created_at]
			const [id, , author, content] = row as unknown[];
			push(toCommentItem({ id, author, content, createdAt: row[4] }, index));
			return;
		}
		push(toCommentItem(row, index));
	});
	return items;
}

/**
 * 创建响应容忍：[{…}]（PostgREST `Prefer: return=representation`）、
 * {comment:{…}}、{data:{…}}、直接一条记录、空体（204）。
 */
function extractItem(payload: unknown): CommentItem | null {
	if (Array.isArray(payload)) return toCommentItem(payload[0] ?? null, 0);
	if (isRecord(payload)) {
		const nested = payload.comment ?? payload.data ?? payload.item;
		const item = toCommentItem(nested ?? payload, 0);
		if (item) return item;
	}
	return toCommentItem(payload, 0);
}

async function readDetail(response: Response): Promise<string> {
	try {
		const text = (await response.text()).trim();
		return text.replace(/\s+/g, " ");
	} catch {
		return "";
	}
}

/**
 * 拉取某个线程的评论列表（keyset 分页）。
 *
 * 方言差异：
 *   - PostgREST 方言：带游标、带 parent_id 过滤、多取一条判断 hasMore；
 *   - 通用契约（docs/comment-api.md）：没有游标 / 子评论的约定，所以只取首页、
 *     hasMore 恒为 false（「加载更多」不会出现），子评论若后端一并返回，
 *     由组件按 parentId 自行分组。
 */
export async function fetchComments(
	thread: CommentThread,
): Promise<CommentListResult> {
	const base = normalizeApiBase(thread.base);
	if (!base) return { ok: false, error: makeError("invalid", 0, "no api base") };
	// 读和写走同一个归一化，尾斜杠才拆不开线程（见 normalizeThreadPath）
	const path = normalizeThreadPath(thread.path);
	const dataApi = isDataApiBase(base);
	const pageSize = Math.max(1, thread.pageSize ?? COMMENT_PAGE_SIZE);
	const url = dataApi
		? buildDataApiListUrl(base, path, {
				pageSize,
				topLevelOnly: thread.topLevelOnly,
				cursor: thread.cursor,
			})
		: `${base}/comments?path=${encodeURIComponent(path)}&limit=${pageSize}`;
	const init: RequestInit = {
		method: "GET",
		headers: { Accept: "application/json" },
		credentials: "omit",
		cache: "no-store",
	};
	const timeoutMs = thread.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	let response: Response;
	try {
		response = dataApi
			? await dataApiRequest(url, init, deriveAuthBase(base), timeoutMs)
			: await requestWithTimeout(url, init, timeoutMs);
	} catch (error) {
		return { ok: false, error: toResultError(error) };
	}
	if (!response.ok) {
		return {
			ok: false,
			error: toHttpError(response.status, await readDetail(response)),
		};
	}
	let payload: unknown;
	try {
		payload = await response.json();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, error: makeError("parse", response.status, message) };
	}
	const rows = extractList(payload);
	// 通用契约没有游标约定：宁可少给一个按钮，也不给出一个只会重复拉同一页的按钮。
	if (!dataApi) return { ok: true, comments: rows, hasMore: false };
	return {
		ok: true,
		comments: rows.slice(0, pageSize),
		hasMore: rows.length > pageSize,
	};
}

/**
 * 取一批父评论的子评论（楼中楼第一层，时间正序）。
 *
 * 只在 PostgREST 方言下有意义：通用契约一次返回整条线程，子评论已经在
 * fetchComments 的结果里了，这里直接回空数组 —— 不会多发一个请求。
 */
export async function fetchReplies(
	thread: CommentThread,
	parentIds: readonly string[],
): Promise<CommentRepliesResult> {
	const base = normalizeApiBase(thread.base);
	const ids = parentIds.filter((id) => /^\d+$/.test(id));
	if (!isDataApiBase(base) || ids.length === 0) {
		return { ok: true, replies: [] };
	}
	const path = normalizeThreadPath(thread.path);
	const url = buildDataApiRepliesUrl(base, path, ids);
	const init: RequestInit = {
		method: "GET",
		headers: { Accept: "application/json" },
		credentials: "omit",
		cache: "no-store",
	};
	const timeoutMs = thread.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	let response: Response;
	try {
		response = await dataApiRequest(url, init, deriveAuthBase(base), timeoutMs);
	} catch (error) {
		return { ok: false, error: toResultError(error) };
	}
	if (!response.ok) {
		return {
			ok: false,
			error: toHttpError(response.status, await readDetail(response)),
		};
	}
	let payload: unknown;
	try {
		payload = await response.json();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, error: makeError("parse", response.status, message) };
	}
	return { ok: true, replies: extractList(payload) };
}

/** 提交一条评论；失败时调用方保留草稿并展示内联错误。 */
export async function postComment(
	thread: CommentThread,
	draft: CommentDraft,
): Promise<CommentPostResult> {
	const base = normalizeApiBase(thread.base);
	if (!base) return { ok: false, error: makeError("invalid", 0, "no api base") };
	const path = normalizeThreadPath(thread.path);
	const author = draft.author.trim();
	const content = draft.content.trim();
	if (!content) return { ok: false, error: makeError("invalid", 0, "empty content") };
	// 两种方言的行字段名不同：通用契约用 author，Data API 用 nickname。
	const dataApi = isDataApiBase(base);
	const website = (draft.website ?? "").trim().slice(0, COMMENT_WEBSITE_MAX);
	const parentId = (draft.parentId ?? "").trim();
	const body: Record<string, string | number> = dataApi
		? { path, nickname: author, content, status: "visible" }
		: { path, content };
	if (!dataApi && author) body.author = author;
	if (website) body.website = website;
	// parent_id 在库里是 bigint：能转数字就转，免得 PostgREST 的 json → bigint 转换挑刺。
	if (parentId) body.parent_id = /^\d+$/.test(parentId) ? Number(parentId) : parentId;
	/*
	 * 这里**不**带 ip_hash：comments 表没有这个列（实测 select=ip_hash →
	 * 400 42703 column "ip_hash" of relation "comments" does not exist），
	 * 带上就是整个插入失败。该列只存在于 comment_reports（见 reportComment）。
	 */
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Accept: "application/json",
	};
	// Data API：要求回填插入后的整行（默认 201 空体），这样服务端 id / 时间能落到界面。
	if (dataApi) headers.Prefer = "return=representation";
	const url = dataApi
		? `${base}/comments?select=${DATA_API_COLUMNS}`
		: `${base}/comments`;
	const init: RequestInit = {
		method: "POST",
		headers,
		credentials: "omit",
		body: JSON.stringify(body),
	};
	const timeoutMs = thread.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	let response: Response;
	try {
		response = dataApi
			? await dataApiRequest(url, init, deriveAuthBase(base), timeoutMs)
			: await requestWithTimeout(url, init, timeoutMs);
	} catch (error) {
		return { ok: false, error: toResultError(error) };
	}
	if (!response.ok) {
		return {
			ok: false,
			error: toHttpError(response.status, await readDetail(response)),
		};
	}
	// 200 / 201 / 204 都算成功；拿不到可解析的实体就用本地回显兜底，
	// 免得后端返回 204 时界面看着像失败。
	let payload: unknown = null;
	try {
		payload = await response.json();
	} catch {
		payload = null;
	}
	const parsed = extractItem(payload);
	if (parsed) return { ok: true, comment: parsed };
	return {
		ok: true,
		comment: {
			id: `local-${Date.now()}`,
			author,
			content,
			createdAt: new Date().toISOString(),
			avatar: "",
			preview: false,
			website,
			parentId: parentId || null,
		},
	};
}

/**
 * 举报一条评论：POST public.comment_reports。
 *
 * 后端侧实测（2026-10-25，Neon Data API）：
 *   POST {comment_id:112, reason:"spam"}                     → 201（空体）
 *   POST {comment_id:112, reason:"spam", ip_hash:"deadbeef"} → 201（该表确有 ip_hash 列）
 *   POST {comment_id:999999, …}                              → 409 23503 外键不存在
 * 匿名角色对这张表**只有 INSERT**（SELECT 是 403 permission denied），所以举报记录
 * 前端读不回来 —— 「已举报」状态由组件写在 localStorage 里。
 *
 * 通用契约没有举报端点，这里直接返回 invalid，组件据此不渲染「举报」按钮
 * （不给一个按了必然失败的按钮）。
 */
export async function reportComment(
	thread: CommentThread,
	input: CommentReportInput,
): Promise<CommentReportResult> {
	const base = normalizeApiBase(thread.base);
	if (!base) return { ok: false, error: makeError("invalid", 0, "no api base") };
	if (!isDataApiBase(base)) {
		return { ok: false, error: makeError("invalid", 0, "reports unsupported") };
	}
	const id = input.commentId.trim();
	if (!id) return { ok: false, error: makeError("invalid", 0, "no comment id") };
	const body: Record<string, string | number> = {
		comment_id: /^\d+$/.test(id) ? Number(id) : id,
		reason: input.reason,
	};
	if (input.visitorHash) body.ip_hash = input.visitorHash;
	const init: RequestInit = {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
			// 举报不需要回填实体；return=minimal 让 PostgREST 回 201 空体
			Prefer: "return=minimal",
		},
		credentials: "omit",
		body: JSON.stringify(body),
	};
	const timeoutMs = thread.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	let response: Response;
	try {
		response = await dataApiRequest(
			`${base}/comment_reports`,
			init,
			deriveAuthBase(base),
			timeoutMs,
		);
	} catch (error) {
		return { ok: false, error: toResultError(error) };
	}
	if (!response.ok) {
		return {
			ok: false,
			error: toHttpError(response.status, await readDetail(response)),
		};
	}
	return { ok: true };
}

/**
 * 尽力而为的访客指纹（**不是 IP**）：
 * 浏览器拿不到自己的 IP，Data API 也不会把代理头透给我们，所以用
 * 「本机随机访客 id + 粗环境桶（UA / 语言 / 时区 / 屏幕）」算一个稳定 hash，
 * 填进 comment_reports.ip_hash。同一个浏览器长期稳定、不可反查、不产生任何第三方请求。
 *
 * 纯本地用途（后端限流统计），拿不到环境（SSR / 隐私模式关掉 localStorage）就返回空串，
 * 调用方直接不传这个字段 —— 举报照样能提交，实测不传也能插。
 *
 * 算法：FNV-1a 32bit 跑两遍（不同 offset basis），输出 16 位十六进制。
 * 不用于安全用途，只求便宜、无依赖、结果稳定。
 */
export function commentVisitorHash(): string {
	try {
		if (typeof window === "undefined") return "";
		const key = "ef:comment:visitor";
		let visitor = "";
		try {
			visitor = localStorage.getItem(key) ?? "";
			if (!visitor) {
				visitor = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
				localStorage.setItem(key, visitor);
			}
		} catch {
			// 隐私模式：退化成「本次会话内稳定」，不写盘
			visitor = "ephemeral";
		}
		const nav = typeof navigator === "undefined" ? undefined : navigator;
		let timeZone = "";
		try {
			timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
		} catch {
			timeZone = "";
		}
		const screenSize =
			typeof screen === "undefined" ? "" : `${screen.width}x${screen.height}`;
		const raw = [
			visitor,
			nav?.userAgent ?? "",
			nav?.language ?? "",
			timeZone,
			screenSize,
		].join("|");
		let h1 = 0x811c9dc5;
		let h2 = 0x01000193;
		for (let i = 0; i < raw.length; i++) {
			const code = raw.charCodeAt(i);
			h1 = Math.imul(h1 ^ code, 16777619) >>> 0;
			h2 = Math.imul(h2 ^ code, 2246822519) >>> 0;
		}
		return `v1-${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
	} catch {
		return "";
	}
}
