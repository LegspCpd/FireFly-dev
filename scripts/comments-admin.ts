/**
 * comments-admin.ts — public.comments 的本地审核 / 管理 CLI（owner 专用，不进前端）
 *
 * 为什么是脚本而不是网页：本站三端（Cloudflare Pages / Vercel / EdgeOne）都是纯静态产物，
 * 「审核后台 / 自助删除」这类操作需要 owner 凭据；把它做成网页就等于把 owner 连接串塞进
 * 浏览器。所以这些操作只在**本机**用本脚本跑。
 *
 * 用法（仓库根目录，Node >= 22）：
 *
 *   export EF_OWNER_DSN='postgresql://…'                  # 见下方「DSN 从哪来」
 *   npx tsx scripts/comments-admin.ts list --status=pending --limit=20
 *   npx tsx scripts/comments-admin.ts publish 41 42
 *   npx tsx scripts/comments-admin.ts hide 43
 *   npx tsx scripts/comments-admin.ts spam 44
 *   npx tsx scripts/comments-admin.ts delete 45            # 演练：只打印将要删除的行
 *   npx tsx scripts/comments-admin.ts delete 45 --yes      # 真删
 *   npx tsx scripts/comments-admin.ts stats
 *
 * DSN 从哪来 —— **只**从环境变量 EF_OWNER_DSN 读，脚本内没有任何兜底连接串：
 *   1. Neon Console → 项目 → Connect；
 *   2. 角色选 owner（neondb_owner，不是 anonymous / 只读角色）；
 *   3. 勾上 pooled connection（-pooler 主机）→ 复制完整连接串；
 *   4. 只在当前 shell 里赋给它，不要写进任何文件、不要提交 .env：
 *        bash/zsh   : export EF_OWNER_DSN='postgresql://…'
 *        PowerShell : $env:EF_OWNER_DSN = 'postgresql://…'
 *        单次执行   : EF_OWNER_DSN='postgresql://…' npx tsx scripts/comments-admin.ts list
 *   缺失时脚本立刻以退出码 2 结束，不去猜、也不回落到任何默认库。
 *   日志里最多出现主机名（dsnHost），账号 / 密码 / 完整 DSN 一律不打印。
 *
 * pg 依赖：
 *   仓库的 package.json 里没有 pg（前端评论走 Neon Data API，用不到它），而本脚本
 *   要求「不修改仓库依赖清单」。因此运行时按下面的顺序找 pg：
 *     1. $EF_PG_ROOT（该目录下需有 node_modules/pg）
 *     2. 仓库根目录（scripts/ 的上一级）
 *     3. 当前工作目录 / Node 默认解析
 *   都找不到就报错退出，并打印仓库外的临时安装命令。
 *
 * 安全约定：
 *   - 连接串只走环境变量；本文件与 docs/comment-admin.md 里都不含任何真实连接串；
 *   - 所有写操作打印 before / after，便于审计；
 *   - delete 默认只演练，加 --yes 才真删（子评论会随 ON DELETE CASCADE 一起消失，脚本会提前警告）。
 */

import { existsSync, writeSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const STATUSES = ["visible", "pending", "hidden", "spam"] as const;
type Status = (typeof STATUSES)[number];

const COMMANDS = [
	"list",
	"publish",
	"hide",
	"spam",
	"delete",
	"stats",
] as const;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const SUMMARY_WIDTH = 44;

const EXIT_FAIL = 1;
const EXIT_USAGE = 2;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

const SELECT_COLUMNS =
	"id, parent_id, path, nickname, website, content, created_at, status";

const USAGE = [
	"评论管理 CLI —— public.comments（owner 专用，本地跑）",
	"",
	"用法：",
	"  EF_OWNER_DSN='postgresql://…' npx tsx scripts/comments-admin.ts <命令> [参数]",
	"",
	"命令：",
	"  list    [--path=<p>] [--status=<visible|pending|hidden|spam>] [--limit=50]",
	"          按 created_at 倒序列出，列：id / 时间 / 昵称 / path / status / 摘要",
	"  publish <id...>            status 置为 visible（放行）",
	"  hide    <id...>            status 置为 hidden（前台不可见）",
	"  spam    <id...>            status 置为 spam（垃圾）",
	"  delete  <id...> [--yes]    物理删除；不带 --yes 只演练（打印将要删除的行）",
	"  stats                      总数 / 按 status 分布 / 按线程 Top / 举报数（comment_reports 存在时）",
	"",
	"环境变量：",
	"  EF_OWNER_DSN  必填。owner 连接串，只从此变量读取；脚本内无任何兜底连接串。",
	"  EF_PG_ROOT    选填。pg 包所在目录（须含 node_modules/pg），用于仓库没装 pg 的情况。",
	"",
	"示例：",
	"  npx tsx scripts/comments-admin.ts list --status=pending --limit=20",
	"  npx tsx scripts/comments-admin.ts publish 41 42",
	"  npx tsx scripts/comments-admin.ts delete 43           # 演练",
	"  npx tsx scripts/comments-admin.ts delete 43 --yes     # 真删",
].join("\n");

// ------------------------------------------------------------------ 类型

type PgResult = {
	rows: Array<Record<string, unknown>>;
	rowCount: number | null;
};

type PgClient = {
	connect: () => Promise<void>;
	end: () => Promise<void>;
	query: (text: string, values?: unknown[]) => Promise<PgResult>;
};

type PgModule = {
	Client: new (config: { connectionString: string }) => PgClient;
};

type Row = {
	id: number;
	parent_id: number | null;
	path: string;
	nickname: string;
	website: string;
	content: string;
	created_at: Date | string;
	status: string;
};

type ParsedArgs = {
	command: string;
	ids: number[];
	path: string | null;
	status: Status | null;
	limit: number;
	yes: boolean;
	help: boolean;
};

class UsageError extends Error {}

// ------------------------------------------------------------------ 基础输出

function fail(code: number, message: string): never {
	writeSync(2, message.trimEnd() + "\n");
	process.exit(code);
}

function usageError(message: string): never {
	throw new UsageError(message);
}

function describeError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

function dsnHost(dsn: string): string {
	try {
		return new URL(dsn).host;
	} catch {
		return "(主机解析失败)";
	}
}

function charWidth(ch: string): number {
	const cp = ch.codePointAt(0) ?? 0;
	if (cp < 0x20 || cp === 0x7f) return 0;
	if (cp >= 0x1100) {
		if (
			cp <= 0x115f ||
			cp === 0x2329 ||
			cp === 0x232a ||
			(cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
			(cp >= 0xac00 && cp <= 0xd7a3) ||
			(cp >= 0xf900 && cp <= 0xfaff) ||
			(cp >= 0xfe10 && cp <= 0xfe19) ||
			(cp >= 0xfe30 && cp <= 0xfe6f) ||
			(cp >= 0xff00 && cp <= 0xff60) ||
			(cp >= 0xffe0 && cp <= 0xffe6) ||
			(cp >= 0x20000 && cp <= 0x3fffd)
		) {
			return 2;
		}
	}
	return 1;
}

function displayWidth(text: string): number {
	let width = 0;
	for (const ch of text) width += charWidth(ch);
	return width;
}

function padCell(text: string, width: number): string {
	const gap = width - displayWidth(text);
	return gap > 0 ? text + " ".repeat(gap) : text;
}

function renderTable(headers: string[], rows: string[][]): string {
	const widths = headers.map((header, index) => {
		let width = displayWidth(header);
		for (const row of rows)
			width = Math.max(width, displayWidth(row[index] ?? ""));
		return width;
	});
	const lines: string[] = [];
	lines.push(
		headers
			.map((cell, index) => padCell(cell, widths[index] ?? 0))
			.join("  ")
			.trimEnd(),
	);
	lines.push(widths.map((width) => "-".repeat(width)).join("  "));
	for (const row of rows) {
		lines.push(
			headers
				.map((_cell, index) => padCell(row[index] ?? "", widths[index] ?? 0))
				.join("  ")
				.trimEnd(),
		);
	}
	return lines.join("\n");
}

function stripControl(text: string): string {
	let out = "";
	for (const ch of text) {
		const cp = ch.codePointAt(0) ?? 0;
		out += cp < 32 || cp === 127 ? " " : ch;
	}
	let collapsed = "";
	let previousSpace = false;
	for (const ch of out) {
		const isSpace = ch === " ";
		if (isSpace && previousSpace) continue;
		collapsed += ch;
		previousSpace = isSpace;
	}
	return collapsed.trim();
}

function truncate(text: string, max: number): string {
	if (displayWidth(text) <= max) return text;
	let out = "";
	let width = 0;
	for (const ch of text) {
		const next = width + charWidth(ch);
		if (next > max - 1) break;
		out += ch;
		width = next;
	}
	return out + "…";
}

function summary(content: string): string {
	return truncate(stripControl(content), SUMMARY_WIDTH);
}

function pad2(value: number): string {
	return value < 10 ? "0" + value : String(value);
}

function formatTime(value: Date | string): string {
	const date = value instanceof Date ? value : new Date(String(value));
	if (Number.isNaN(date.getTime())) return stripControl(String(value));
	const offsetMinutes = -date.getTimezoneOffset();
	const sign = offsetMinutes < 0 ? "-" : "+";
	const abs = Math.abs(offsetMinutes);
	return (
		date.getFullYear() +
		"-" +
		pad2(date.getMonth() + 1) +
		"-" +
		pad2(date.getDate()) +
		" " +
		pad2(date.getHours()) +
		":" +
		pad2(date.getMinutes()) +
		":" +
		pad2(date.getSeconds()) +
		" " +
		sign +
		pad2(Math.floor(abs / 60)) +
		":" +
		pad2(abs % 60)
	);
}

// ------------------------------------------------------------------ pg 解析

function pgCandidateRoots(): string[] {
	const roots: string[] = [];
	const fromEnv = (process.env.EF_PG_ROOT ?? "").trim();
	if (fromEnv !== "") roots.push(resolve(fromEnv));
	roots.push(REPO_ROOT);
	roots.push(process.cwd());
	return roots;
}

async function loadPg(): Promise<PgModule> {
	// 变量化 specifier：仓库没装 pg 时，astro check / tsc 不会因静态解析失败而报错。
	const specifier = "pg";
	const problems: string[] = [];

	for (const root of pgCandidateRoots()) {
		try {
			const require = createRequire(
				join(root, "__comments_admin_resolve__.cjs"),
			);
			const resolved = require.resolve(specifier);
			if (!existsSync(resolved)) {
				problems.push(root + "：解析到 " + resolved + "，但文件不存在");
				continue;
			}
			const mod = (await import(pathToFileURL(resolved).href)) as {
				default?: unknown;
			};
			const pg = (mod.default ?? mod) as PgModule;
			if (typeof pg.Client === "function") return pg;
			problems.push(root + "：pg 已解析但拿不到 Client 导出");
		} catch (error) {
			problems.push(root + "：" + describeError(error));
		}
	}

	try {
		const mod = (await import(specifier)) as { default?: unknown };
		const pg = (mod.default ?? mod) as PgModule;
		if (typeof pg.Client === "function") return pg;
	} catch (error) {
		problems.push("Node 默认解析：" + describeError(error));
	}

	throw new Error(
		[
			"找不到可用的 pg 包（本脚本不修改仓库依赖清单）。尝试过：",
			...problems.map((line) => "  - " + line),
			"",
			"在仓库外的临时目录装一个，再用 EF_PG_ROOT 指过去：",
			"  mkdir -p /tmp/ef-comments-admin && cd /tmp/ef-comments-admin && npm i pg",
			"  export EF_PG_ROOT=/tmp/ef-comments-admin",
		].join("\n"),
	);
}

async function withClient<T>(
	dsn: string,
	fn: (client: PgClient) => Promise<T>,
): Promise<T> {
	const pg = await loadPg();
	const client = new pg.Client({ connectionString: dsn });
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end();
	}
}

function readDsn(): string {
	const raw = (process.env.EF_OWNER_DSN ?? "").trim();
	if (raw === "") {
		fail(
			EXIT_USAGE,
			[
				"缺少环境变量 EF_OWNER_DSN —— 本脚本没有任何兜底连接串，必须显式传入 owner 连接串。",
				"",
				"取值：Neon Console → 项目 → Connect → 角色选 neondb_owner → 复制 pooled 连接串。",
				"传入（不要写进任何文件、不要提交 .env）：",
				"  bash/zsh   : export EF_OWNER_DSN='postgresql://…'",
				"  PowerShell : $env:EF_OWNER_DSN = 'postgresql://…'",
				"  单次执行   : EF_OWNER_DSN='postgresql://…' npx tsx scripts/comments-admin.ts list",
			].join("\n"),
		);
	}
	if (!raw.startsWith("postgres://") && !raw.startsWith("postgresql://")) {
		fail(
			EXIT_USAGE,
			"EF_OWNER_DSN 不是 postgres:// / postgresql:// 连接串（已拒绝，未回显其内容）。",
		);
	}
	return raw;
}

// ------------------------------------------------------------------ 参数解析

function matchNamedOption(token: string): [string, string | null] | null {
	if (!token.startsWith("--")) return null;
	const body = token.slice(2);
	const eq = body.indexOf("=");
	if (eq === -1) return [body, null];
	return [body.slice(0, eq), body.slice(eq + 1)];
}

function parseStatus(value: string): Status {
	for (const candidate of STATUSES) {
		if (candidate === value) return candidate;
	}
	usageError("--status 只能是 " + STATUSES.join(" | ") + "，收到：" + value);
}

function parseLimit(value: string): number {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
		usageError("--limit 需要 1.." + MAX_LIMIT + " 的整数，收到：" + value);
	}
	return parsed;
}

function parseArgs(argv: string[]): ParsedArgs {
	const out: ParsedArgs = {
		command: "",
		ids: [],
		path: null,
		status: null,
		limit: DEFAULT_LIMIT,
		yes: false,
		help: false,
	};

	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i] ?? "";

		if (token === "") continue;
		if (token === "--help" || token === "-h" || token === "help") {
			out.help = true;
			continue;
		}
		if (token === "--yes" || token === "-y") {
			out.yes = true;
			continue;
		}

		const named = matchNamedOption(token);
		if (named !== null) {
			const name = named[0];
			let value = named[1];
			if (value === null) {
				i += 1;
				const next = argv[i];
				if (next === undefined) usageError("选项 --" + name + " 缺值");
				value = next;
			}
			if (value === "") usageError("选项 --" + name + " 缺值");
			if (name === "path") {
				out.path = value;
				continue;
			}
			if (name === "status") {
				out.status = parseStatus(value);
				continue;
			}
			if (name === "limit") {
				out.limit = parseLimit(value);
				continue;
			}
			usageError("未知选项 --" + name);
		}

		if (out.command === "") {
			if (token.startsWith("-")) usageError("未知选项 " + token);
			out.command = token;
			continue;
		}

		if (!/^[1-9][0-9]*$/.test(token)) {
			usageError("命令 " + out.command + " 只接受正整数 id，收到：" + token);
		}
		out.ids.push(Number(token));
	}

	return out;
}

// ------------------------------------------------------------------ 行映射与查询

function toRow(raw: Record<string, unknown>): Row {
	const parent = raw.parent_id;
	return {
		id: Number(raw.id),
		parent_id: parent === null || parent === undefined ? null : Number(parent),
		path: String(raw.path ?? ""),
		nickname: String(raw.nickname ?? ""),
		website: String(raw.website ?? ""),
		content: String(raw.content ?? ""),
		created_at:
			raw.created_at instanceof Date
				? raw.created_at
				: String(raw.created_at ?? ""),
		status: String(raw.status ?? ""),
	};
}

async function fetchRowsByIds(
	client: PgClient,
	ids: number[],
): Promise<Map<number, Row>> {
	const found = new Map<number, Row>();
	if (ids.length === 0) return found;
	const res = await client.query(
		"SELECT " +
			SELECT_COLUMNS +
			" FROM public.comments WHERE id = ANY($1::bigint[])",
		[ids],
	);
	for (const raw of res.rows) {
		const row = toRow(raw);
		found.set(row.id, row);
	}
	return found;
}

// ------------------------------------------------------------------ 子命令

async function cmdList(client: PgClient, args: ParsedArgs): Promise<number> {
	const where: string[] = [];
	const values: unknown[] = [];

	if (args.path !== null) {
		values.push(args.path);
		where.push("path = $" + values.length);
	}
	if (args.status !== null) {
		values.push(args.status);
		where.push("status = $" + values.length);
	}
	values.push(args.limit);

	const sql =
		"SELECT " +
		SELECT_COLUMNS +
		" FROM public.comments" +
		(where.length > 0 ? " WHERE " + where.join(" AND ") : "") +
		" ORDER BY created_at DESC, id DESC LIMIT $" +
		values.length;

	const res = await client.query(sql, values);
	const rows = res.rows.map(toRow);

	console.log("== list ==");
	console.log(
		"筛选：path=" +
			(args.path ?? "(全部)") +
			" · status=" +
			(args.status ?? "(全部)") +
			" · limit=" +
			args.limit,
	);

	if (rows.length === 0) {
		console.log("(无匹配记录)");
		return 0;
	}

	console.log(
		renderTable(
			["id", "时间", "昵称", "path", "status", "摘要"],
			rows.map((row) => [
				String(row.id),
				formatTime(row.created_at),
				row.nickname === "" ? "(匿名)" : row.nickname,
				row.path,
				row.status,
				summary(row.content),
			]),
		),
	);
	console.log("共 " + rows.length + " 行（按 created_at 倒序）。");
	return 0;
}

async function cmdSetStatus(
	client: PgClient,
	ids: number[],
	next: Status,
): Promise<number> {
	const before = await fetchRowsByIds(client, ids);
	const targets = ids.filter((id) => before.has(id));
	const missing = ids.filter((id) => !before.has(id));

	const after = new Map<number, string>();
	if (targets.length > 0) {
		const res = await client.query(
			"UPDATE public.comments SET status = $2 WHERE id = ANY($1::bigint[]) RETURNING id, status",
			[targets, next],
		);
		for (const raw of res.rows) {
			const row = toRow(raw);
			after.set(row.id, row.status);
		}
	}

	console.log("== status → " + next + " ==");
	if (targets.length === 0) {
		console.log("(要改的 id 在库中都不存在，未做任何修改)");
	} else {
		console.log(
			renderTable(
				["id", "线程", "昵称", "before", "after"],
				targets.map((id) => {
					const row = before.get(id) as Row;
					return [
						String(id),
						row.path,
						row.nickname,
						row.status,
						after.get(id) ?? "(未更新)",
					];
				}),
			),
		);
		console.log("已更新 " + after.size + " 行（after 取自数据库 RETURNING）。");
	}

	for (const id of missing) console.log("id=" + id + " 不存在，已跳过。");
	return missing.length > 0 ? EXIT_FAIL : 0;
}

async function cmdDelete(client: PgClient, args: ParsedArgs): Promise<number> {
	const rows = await fetchRowsByIds(client, args.ids);
	const targets = args.ids.filter((id) => rows.has(id));
	const missing = args.ids.filter((id) => !rows.has(id));

	console.log("== delete（物理删除）==");

	if (targets.length === 0) {
		console.log("(要删的 id 在库中都不存在，未做任何修改)");
		for (const id of missing) console.log("id=" + id + " 不存在。");
		return EXIT_FAIL;
	}

	console.log(
		renderTable(
			["id", "时间", "昵称", "path", "status", "摘要"],
			targets.map((id) => {
				const row = rows.get(id) as Row;
				return [
					String(id),
					formatTime(row.created_at),
					row.nickname === "" ? "(匿名)" : row.nickname,
					row.path,
					row.status,
					summary(row.content),
				];
			}),
		),
	);

	const children = await client.query(
		"SELECT parent_id, count(*)::bigint AS n FROM public.comments" +
			" WHERE parent_id = ANY($1::bigint[]) GROUP BY parent_id ORDER BY parent_id",
		[targets],
	);
	if (children.rows.length > 0) {
		console.log(
			"注意：以下子评论会随 ON DELETE CASCADE 一起被删 → " +
				children.rows
					.map(
						(raw) =>
							"id=" + String(raw.parent_id) + " 有 " + String(raw.n) + " 条",
					)
					.join("；"),
		);
	}

	for (const id of missing) console.log("id=" + id + " 不存在，已跳过。");

	if (!args.yes) {
		console.log(
			"（演练）未执行删除，待删 " +
				targets.length +
				" 行。确认无误后加 --yes 重跑同一条命令。",
		);
		return missing.length > 0 ? EXIT_FAIL : 0;
	}

	const deleted = await client.query(
		"DELETE FROM public.comments WHERE id = ANY($1::bigint[]) RETURNING id, status",
		[targets],
	);
	console.log("已物理删除 " + deleted.rows.length + " 行：");
	for (const raw of deleted.rows) {
		const row = toRow(raw);
		console.log(
			"  id=" + row.id + "  before=" + row.status + "  after=(已删除)",
		);
	}
	return missing.length > 0 ? EXIT_FAIL : 0;
}

async function cmdStats(client: PgClient): Promise<number> {
	console.log("== stats ==");

	const totalRes = await client.query(
		"SELECT count(*)::bigint AS n FROM public.comments",
	);
	const total = Number(totalRes.rows[0]?.n ?? 0);
	console.log("总数：" + total);

	const statusRes = await client.query(
		"SELECT status, count(*)::bigint AS n FROM public.comments GROUP BY status",
	);
	const counts = new Map<string, number>();
	for (const raw of statusRes.rows)
		counts.set(String(raw.status), Number(raw.n ?? 0));
	const order: string[] = [...STATUSES];
	for (const key of counts.keys()) if (!order.includes(key)) order.push(key);

	console.log("按 status 分布：");
	console.log(
		renderTable(
			["status", "数量"],
			order.map((key) => [key, String(counts.get(key) ?? 0)]),
		),
	);

	const pathRes = await client.query(
		"SELECT path, count(*)::bigint AS n FROM public.comments GROUP BY path ORDER BY n DESC, path ASC LIMIT 10",
	);
	if (pathRes.rows.length > 0) {
		console.log("按线程 Top 10：");
		console.log(
			renderTable(
				["path", "数量"],
				pathRes.rows.map((raw) => [String(raw.path), String(raw.n)]),
			),
		);
	}

	const reg = await client.query(
		"SELECT to_regclass('public.comment_reports') IS NOT NULL AS present",
	);
	if (reg.rows[0]?.present !== true) {
		console.log("举报：public.comment_reports 表不存在，跳过。");
		return 0;
	}

	const reportRes = await client.query(
		"SELECT count(*)::bigint AS n FROM public.comment_reports",
	);
	console.log(
		"举报：public.comment_reports 共 " +
			Number(reportRes.rows[0]?.n ?? 0) +
			" 条",
	);

	const colsRes = await client.query(
		"SELECT column_name FROM information_schema.columns" +
			" WHERE table_schema = 'public' AND table_name = 'comment_reports'",
	);
	const columns = colsRes.rows.map((raw) => String(raw.column_name));

	if (columns.includes("status")) {
		const grouped = await client.query(
			"SELECT status, count(*)::bigint AS n FROM public.comment_reports GROUP BY status ORDER BY status",
		);
		console.log("举报按 status 分布：");
		console.log(
			renderTable(
				["status", "数量"],
				grouped.rows.map((raw) => [String(raw.status), String(raw.n)]),
			),
		);
	}
	if (columns.includes("resolved")) {
		const grouped = await client.query(
			"SELECT resolved, count(*)::bigint AS n FROM public.comment_reports GROUP BY resolved ORDER BY resolved",
		);
		console.log("举报按 resolved 分布：");
		console.log(
			renderTable(
				["resolved", "数量"],
				grouped.rows.map((raw) => [String(raw.resolved), String(raw.n)]),
			),
		);
	}
	return 0;
}

// ------------------------------------------------------------------ 入口

async function main(): Promise<void> {
	let args: ParsedArgs;
	try {
		args = parseArgs(process.argv.slice(2));
	} catch (error) {
		if (error instanceof UsageError) {
			fail(EXIT_USAGE, "参数错误：" + error.message + "\n\n" + USAGE);
		}
		throw error;
	}

	if (args.help || args.command === "") {
		process.stdout.write(USAGE + "\n");
		return;
	}

	if (!(COMMANDS as readonly string[]).includes(args.command)) {
		fail(EXIT_USAGE, "未知命令：" + args.command + "\n\n" + USAGE);
	}

	if (
		args.command !== "list" &&
		args.command !== "stats" &&
		args.ids.length === 0
	) {
		fail(EXIT_USAGE, "命令 " + args.command + " 至少需要一个 id。\n\n" + USAGE);
	}

	const dsn = readDsn();

	const code = await withClient(dsn, async (client) => {
		process.stdout.write("# 连接：" + dsnHost(dsn) + " · 表 public.comments\n");
		if (args.command === "list") return await cmdList(client, args);
		if (args.command === "publish")
			return await cmdSetStatus(client, args.ids, "visible");
		if (args.command === "hide")
			return await cmdSetStatus(client, args.ids, "hidden");
		if (args.command === "spam")
			return await cmdSetStatus(client, args.ids, "spam");
		if (args.command === "delete") return await cmdDelete(client, args);
		return await cmdStats(client);
	});

	process.exitCode = code;
}

main().catch((error: unknown) => {
	fail(EXIT_FAIL, "执行失败：" + describeError(error));
});
