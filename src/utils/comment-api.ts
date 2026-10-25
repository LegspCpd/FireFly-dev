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
 *      **不抛异常** —— 组件据此降级成演示态 / 内联错误条，不会白屏、不会刷屏报错。
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
};

export type CommentApiErrorKind =
	| "invalid"
	| "network"
	| "timeout"
	| "http"
	| "parse";

export type CommentApiError = {
	kind: CommentApiErrorKind;
	/** HTTP 状态码；非 http 错误时为 0。 */
	status: number;
	/** 供排查用的短文本，组件只折叠展示。 */
	detail: string;
};

export type CommentListResult =
	| { ok: true; comments: CommentItem[] }
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
};

export type CommentDraft = {
	author: string;
	content: string;
};

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_DETAIL_LENGTH = 300;

/** 环境变量名，按优先级排列：先私有名（构建期），再 Astro 的 PUBLIC_ 公开名。 */
const ENV_NAMES: readonly string[] = ["COMMENT_API_BASE", "PUBLIC_COMMENT_API_BASE"];

/** 去掉尾部斜杠与空白；拿不到字符串就返回空串。 */
export function normalizeApiBase(raw: unknown): string {
	if (typeof raw !== "string") return "";
	return raw.trim().replace(/\/+$/, "");
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
/** 单次拉取上限：评论是倒序时间线，先取最新 200 条就够。 */
const DATA_API_PAGE_SIZE = 200;

/**
 * PostgREST 的列表地址。过滤值写成 `eq.` 前缀，
 * 免得 path 里的特殊字符被 PostgREST 误解析成运算符。
 */
function buildDataApiListUrl(base: string, path: string): string {
	const params = new URLSearchParams({
		select: DATA_API_COLUMNS,
		path: `eq.${path}`,
		status: "eq.visible",
		order: "created_at.desc",
		limit: String(DATA_API_PAGE_SIZE),
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

/** 拉取某个线程的评论列表。 */
export async function fetchComments(
	thread: CommentThread,
): Promise<CommentListResult> {
	const base = normalizeApiBase(thread.base);
	if (!base) return { ok: false, error: makeError("invalid", 0, "no api base") };
	const url = isDataApiBase(base)
		? buildDataApiListUrl(base, thread.path)
		: `${base}/comments?path=${encodeURIComponent(thread.path)}`;
	const init: RequestInit = {
		method: "GET",
		headers: { Accept: "application/json" },
		credentials: "omit",
		cache: "no-store",
	};
	const timeoutMs = thread.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	let response: Response;
	try {
		response = isDataApiBase(base)
			? await dataApiRequest(url, init, deriveAuthBase(base), timeoutMs)
			: await requestWithTimeout(url, init, timeoutMs);
	} catch (error) {
		return { ok: false, error: toResultError(error) };
	}
	if (!response.ok) {
		return {
			ok: false,
			error: makeError("http", response.status, await readDetail(response)),
		};
	}
	let payload: unknown;
	try {
		payload = await response.json();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, error: makeError("parse", response.status, message) };
	}
	return { ok: true, comments: extractList(payload) };
}

/** 提交一条评论；失败时调用方保留草稿并展示内联错误。 */
export async function postComment(
	thread: CommentThread,
	draft: CommentDraft,
): Promise<CommentPostResult> {
	const base = normalizeApiBase(thread.base);
	if (!base) return { ok: false, error: makeError("invalid", 0, "no api base") };
	const author = draft.author.trim();
	const content = draft.content.trim();
	if (!content) return { ok: false, error: makeError("invalid", 0, "empty content") };
	// 两种方言的行字段名不同：通用契约用 author，Data API 用 nickname。
	const dataApi = isDataApiBase(base);
	const body: Record<string, string> = dataApi
		? { path: thread.path, nickname: author, content, status: "visible" }
		: { path: thread.path, content };
	if (!dataApi && author) body.author = author;
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
			error: makeError("http", response.status, await readDetail(response)),
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
		},
	};
}
