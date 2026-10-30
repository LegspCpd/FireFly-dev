<script lang="ts">
	type Entry = {
		key: string;
		kind: "scalar" | "list" | "blocklist" | "raw";
		value: string;
		items: string[];
		quote: "" | "'" | '"';
		rawLines: string[];
		dirty: boolean;
	};

	type FieldDef = {
		key: string;
		label: string;
		type: "text" | "date" | "bool" | "list" | "number";
		hint?: string;
	};

	type OpenFile = { path: string; sha: string; text: string };

	const TOKEN_KEY = "firefly-admin-token";
	const REPO_KEY = "firefly-admin-repo";

	const SCOPES = [
		{ id: "content", label: "内容 src/content", prefix: "src/content/" },
		{ id: "config", label: "配置 src/config", prefix: "src/config/" },
		{ id: "styles", label: "样式 src/styles", prefix: "src/styles/" },
		{ id: "pages", label: "页面 src/pages", prefix: "src/pages/" },
		{ id: "docs", label: "文档 docs", prefix: "docs/" },
		{ id: "all", label: "全部文件", prefix: "" },
	];

	const POST_FIELDS: FieldDef[] = [
		{ key: "title", label: "title 标题", type: "text" },
		{ key: "published", label: "published 发布日期", type: "date" },
		{ key: "updated", label: "updated 更新日期", type: "date" },
		{ key: "draft", label: "draft 草稿", type: "bool" },
		{ key: "description", label: "description 摘要", type: "text" },
		{ key: "image", label: "image 封面图", type: "text", hint: "原样字符串，例如 images/cover.avif" },
		{ key: "tags", label: "tags 标签", type: "list" },
		{ key: "category", label: "category 分类", type: "text" },
		{ key: "lang", label: "lang 语言", type: "text" },
		{ key: "pinned", label: "pinned 置顶", type: "bool" },
		{ key: "author", label: "author 作者", type: "text" },
		{ key: "sourceLink", label: "sourceLink 原文链接", type: "text" },
		{ key: "licenseName", label: "licenseName 许可名称", type: "text" },
		{ key: "licenseUrl", label: "licenseUrl 许可链接", type: "text" },
		{ key: "comment", label: "comment 允许评论", type: "bool" },
		{ key: "password", label: "password 访问密码", type: "text" },
		{ key: "passwordHint", label: "passwordHint 密码提示", type: "text" },
		{ key: "series", label: "series 系列", type: "text" },
		{ key: "seriesOrder", label: "seriesOrder 系列序号", type: "number" },
	];

	let token = $state("");
	let owner = $state("LegspCpd");
	let repoName = $state("FireFly-dev");
	let branch = $state("main");
	let login = $state("");
	let connected = $state(false);
	let busy = $state(false);
	let error = $state("");
	let saveMsg = $state("");
	let commitMessage = $state("");
	let showLineNumbers = $state(true);

	let tree = $state<string[]>([]);
	let scope = $state("content");
	let query = $state("");

	let file = $state<OpenFile | null>(null);
	let mode = $state<"form" | "raw">("raw");
	let entries = $state<Entry[]>([]);
	let body = $state("");
	let rawText = $state("");
	let newVals = $state<Record<string, string | boolean | string[]>>({});
	let hasFrontmatter = $state(false);
	let gutterEl = $state<HTMLDivElement | undefined>(undefined);
	let textEl = $state<HTMLTextAreaElement | undefined>(undefined);

	const isMd = $derived(!!file && /\.(md|mdx)$/i.test(file.path));
	const isPost = $derived(!!file && file.path.startsWith("src/content/posts/"));
	const isCode = $derived(!!file && /\.(ts|mjs|js|css|json|mdsx)$/.test(file.path));
	const activePrefix = $derived(SCOPES.find((s) => s.id === scope)?.prefix ?? "");

	const visiblePaths = $derived(
		tree
			.filter((p) => scope === "all" || p.startsWith(activePrefix))
			.filter((p) => !query || p.toLowerCase().includes(query.toLowerCase()))
			.slice(0, 400),
	);

	const currentText = $derived(buildText());
	const dirty = $derived(!!file && currentText !== file.text);
	const lineCount = $derived(rawText.split("\n").length);
	const extraEntries = $derived(
		entries.filter((e) => e.key && e.kind !== "raw" && !POST_FIELDS.some((f) => f.key === e.key)),
	);

	function b64ToStr(b64: string): string {
		const bin = atob(b64.replace(/\s/g, ""));
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return new TextDecoder("utf-8").decode(bytes);
	}

	function strToB64(str: string): string {
		const bytes = new TextEncoder().encode(str);
		let bin = "";
		const chunk = 0x8000;
		for (let i = 0; i < bytes.length; i += chunk) {
			bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
		}
		return btoa(bin);
	}

	async function gh(path: string, init: RequestInit = {}) {
		const headers: Record<string, string> = {
			Accept: "application/vnd.github+json",
			Authorization: "Bearer " + token,
			"X-GitHub-Api-Version": "2022-11-28",
		};
		if (init.body) headers["Content-Type"] = "application/json";
		const res = await fetch("https://api.github.com" + path, { ...init, headers });
		if (!res.ok) {
			let detail = "";
			try {
				const j = await res.json();
				detail = j && j.message ? " " + j.message : "";
			} catch {
				detail = "";
			}
			throw new Error("GitHub " + res.status + detail);
		}
		return res.json();
	}

	function encodePath(p: string): string {
		return p.split("/").map(encodeURIComponent).join("/");
	}

	function contentsUrl(p: string, withRef: boolean): string {
		const base = "/repos/" + owner + "/" + repoName + "/contents/" + encodePath(p);
		return withRef ? base + "?ref=" + encodeURIComponent(branch) : base;
	}

	function splitFrontmatter(text: string): { fm: string[]; body: string } | null {
		const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
		if (!m) return null;
		return { fm: m[1].split(/\r?\n/), body: text.slice(m[0].length) };
	}

	function unquote(v: string): { value: string; quote: "" | "'" | '"' } {
		if (v.length > 1 && v.startsWith("'") && v.endsWith("'")) {
			return { value: v.slice(1, -1).replace(/''/g, "'"), quote: "'" };
		}
		if (v.length > 1 && v.startsWith('"') && v.endsWith('"')) {
			return { value: v.slice(1, -1).replace(/\\"/g, '"'), quote: '"' };
		}
		return { value: v, quote: "" };
	}

	function splitItems(s: string): string[] {
		const out: string[] = [];
		let cur = "";
		let q = "";
		for (const ch of s) {
			if (q) {
				cur += ch;
				if (ch === q) q = "";
				continue;
			}
			if (ch === '"' || ch === "'") {
				q = ch;
				cur += ch;
				continue;
			}
			if (ch === ",") {
				out.push(cur.trim());
				cur = "";
				continue;
			}
			cur += ch;
		}
		if (cur.trim()) out.push(cur.trim());
		return out.map((x) => unquote(x.trim()).value);
	}

	function parseFm(lines: string[]): Entry[] {
		const out: Entry[] = [];
		let cur: Entry | null = null;
		for (const line of lines) {
			const top = line.match(/^([A-Za-z_][\w-]*):(.*)$/);
			if (top) {
				cur = {
					key: top[1],
					kind: "scalar",
					value: "",
					items: [],
					quote: "",
					rawLines: [line],
					dirty: false,
				};
				const rest = top[2].trim();
				if (rest.startsWith("[") && rest.endsWith("]")) {
					cur.kind = "list";
					cur.items = splitItems(rest.slice(1, -1));
				} else {
					const u = unquote(rest);
					cur.value = u.value;
					cur.quote = u.quote;
				}
				out.push(cur);
				continue;
			}
			if (cur) {
				cur.rawLines.push(line);
				const item = line.match(/^\s+-\s+(.*)$/);
				if (item) {
					if (cur.kind === "scalar" && cur.value === "" && cur.quote === "" && cur.items.length === 0) {
						cur.kind = "blocklist";
					}
					if (cur.kind === "blocklist") cur.items.push(unquote(item[1].trim()).value);
				}
				continue;
			}
			out.push({ key: "", kind: "raw", value: "", items: [], quote: "", rawLines: [line], dirty: false });
		}
		return out;
	}

	function needsQuote(v: string): boolean {
		return v === "" || /^\s|\s$/.test(v) || /[:#\[\]{}&*!|>'"%@]/.test(v) || /^(true|false|null|\d)/.test(v);
	}

	function wrap(v: string, quote: "" | "'" | '"'): string {
		if (quote === "'") return "'" + v.replace(/'/g, "''") + "'";
		if (quote === '"') return '"' + v.replace(/"/g, '\\"') + '"';
		return needsQuote(v) ? '"' + v.replace(/"/g, '\\"') + '"' : v;
	}

	function serializeFm(list: Entry[]): string[] {
		const lines: string[] = [];
		for (const e of list) {
			if (e.kind === "raw" || !e.dirty) {
				lines.push(...e.rawLines);
				continue;
			}
			if (e.kind === "scalar") lines.push(e.key + ": " + (e.value === "" ? '""' : wrap(e.value, e.quote)));
			else if (e.kind === "list") lines.push(e.key + ": [" + e.items.map((i) => wrap(i, e.quote)).join(", ") + "]");
			else {
				lines.push(e.key + ":");
				for (const it of e.items) lines.push("  - " + wrap(it, e.quote));
			}
		}
		return lines;
	}

	function buildText(): string {
		if (!file) return "";
		if (!isMd || !hasFrontmatter || mode === "raw") return rawText;
		return "---\n" + serializeFm(entries).join("\n") + "\n---\n" + body;
	}

	function entryOf(key: string): Entry | undefined {
		return entries.find((e) => e.key === key && e.kind !== "raw");
	}

	function valueOf(def: FieldDef): string | boolean | string[] {
		const e = entryOf(def.key);
		if (!e) {
			const nv = newVals[def.key];
			if (nv !== undefined) return nv;
			return def.type === "bool" ? false : def.type === "list" ? [] : "";
		}
		if (def.type === "list") return e.items;
		if (def.type === "bool") return e.value === "true";
		return e.value;
	}

	function applyTo(e: Entry, def: FieldDef, v: string | boolean | string[]) {
		if (def.type === "list") {
			e.kind = e.kind === "blocklist" ? "blocklist" : "list";
			e.items = [...(v as string[])];
		} else if (def.type === "bool") {
			e.kind = "scalar";
			e.value = v ? "true" : "false";
		} else {
			e.kind = "scalar";
			e.value = String(v);
		}
		e.dirty = true;
	}

	function touch(def: FieldDef, v: string | boolean | string[]) {
		const e = entryOf(def.key);
		if (e) {
			applyTo(e, def, v);
			return;
		}
		const meaningful =
			def.type === "bool" ? v === true : def.type === "list" ? (v as string[]).length > 0 : String(v).trim() !== "";
		newVals[def.key] = v;
		if (!meaningful) return;
		const created: Entry = {
			key: def.key,
			kind: def.type === "list" ? "list" : "scalar",
			value: "",
			items: [],
			quote: "",
			rawLines: [],
			dirty: true,
		};
		applyTo(created, def, v);
		entries.push(created);
	}

	function listText(items: string[]): string {
		return items.join(", ");
	}

	function editList(def: FieldDef, raw: string) {
		const items = raw
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		touch(def, items);
	}

	function editEntryScalar(e: Entry, v: string) {
		e.kind = "scalar";
		e.value = v;
		e.dirty = true;
	}

	function editEntryList(e: Entry, raw: string) {
		e.kind = e.kind === "blocklist" ? "blocklist" : "list";
		e.items = raw
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		e.dirty = true;
	}

	async function connect() {
		busy = true;
		error = "";
		saveMsg = "";
		try {
			const u = await gh("/user");
			login = u.login;
			sessionStorage.setItem(TOKEN_KEY, token);
			sessionStorage.setItem(REPO_KEY, JSON.stringify({ owner: owner, repoName: repoName, branch: branch }));
			connected = true;
			await loadTree();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			connected = false;
		} finally {
			busy = false;
		}
	}

	function disconnect() {
		sessionStorage.removeItem(TOKEN_KEY);
		token = "";
		login = "";
		connected = false;
		tree = [];
		file = null;
	}

	async function loadTree() {
		busy = true;
		error = "";
		try {
			const data = await gh("/repos/" + owner + "/" + repoName + "/git/trees/" + branch + "?recursive=1");
			tree = (data.tree as Array<{ path: string; type: string }>)
				.filter((n) => n.type === "blob")
				.map((n) => n.path);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function open(path: string) {
		busy = true;
		error = "";
		saveMsg = "";
		try {
			const data = await gh(contentsUrl(path, true));
			const text = b64ToStr(data.content ?? "");
			file = { path: path, sha: data.sha, text: text };
			rawText = text;
			newVals = {};
			const fm = splitFrontmatter(text);
			if (/\.(md|mdx)$/i.test(path) && fm) {
				entries = parseFm(fm.fm);
				body = fm.body;
				hasFrontmatter = true;
				mode = "form";
			} else {
				entries = [];
				body = "";
				hasFrontmatter = false;
				mode = "raw";
			}
			commitMessage = "chore(admin): 更新 " + path;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function save() {
		if (!file) return;
		busy = true;
		error = "";
		saveMsg = "";
		try {
			const text = buildText();
			const res = await gh(contentsUrl(file.path, false), {
				method: "PUT",
				body: JSON.stringify({
					message: commitMessage || "chore(admin): 更新 " + file.path,
					content: strToB64(text),
					sha: file.sha,
					branch: branch,
				}),
			});
			file = { path: file.path, sha: res.content.sha, text: text };
			rawText = text;
			const sha7 = String(res.commit.sha).slice(0, 7);
			saveMsg = "已提交 " + sha7 + "（分支 " + branch + "）→ Vercel 会自动重新构建";
			await loadTree();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function onScroll() {
		if (gutterEl && textEl) gutterEl.scrollTop = textEl.scrollTop;
	}

	function toggleMode(next: "form" | "raw") {
		if (next === "raw" && isMd) {
			const fm = splitFrontmatter(rawText);
			if (fm) {
				entries = parseFm(fm.fm);
				body = fm.body;
				hasFrontmatter = true;
			}
		}
		mode = next;
	}

	// ================= 新建 / 删除 / 上传图片 / diff 预览 =================
	// 全部在本组件内扩展，不新建架构：仍然只有「一次保存 = 一次 commit」这一条路径。

	type NewKind = "posts" | "dynamic" | "projects" | "path";

	let bodyEl = $state<HTMLTextAreaElement | undefined>(undefined);
	let fileInputEl = $state<HTMLInputElement | undefined>(undefined);

	let showNew = $state(false);
	let newKind = $state<NewKind>("posts");
	let newSlug = $state("");
	let newTitle = $state("");
	let newPath = $state("");
	let newBusy = $state(false);
	let newErr = $state("");

	let delPath = $state<string | null>(null);
	let delBusy = $state(false);

	let uploadBusy = $state(false);
	let uploadMsg = $state("");
	let showDiff = $state(false);

	const NEW_KINDS = [
		{ id: "posts", label: "posts 博客文章", prefix: "src/content/posts/" },
		{ id: "dynamic", label: "dynamic 动态", prefix: "src/content/dynamic/" },
		{ id: "projects", label: "projects 项目", prefix: "src/content/projects/" },
		{ id: "path", label: "任意路径（配置 / 样式 / 文档…）", prefix: "" },
	];

	function pad2(n: number): string {
		return n < 10 ? "0" + n : String(n);
	}

	function today(): string {
		const d = new Date();
		return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
	}

	function nowStamp(): string {
		const d = new Date();
		return today() + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
	}

	function yq(s: string): string {
		return '"' + s.replace(/"/g, '\\"') + '"';
	}

	function targetPath(): string {
		if (newKind === "path") return newPath.trim().replace(/^\/+/, "");
		const slug = newSlug
			.trim()
			.replace(/\.(md|mdx)$/i, "")
			.replace(/\s+/g, "-")
			.replace(/[^A-Za-z0-9._-]/g, "");
		return (NEW_KINDS.find((k) => k.id === newKind)?.prefix ?? "") + slug + ".md";
	}

	// 模板严格照 src/content.config.ts：只写 schema 里存在的键，必填键一定出现
	function buildTemplate(): string {
		const title = newTitle.trim() || newSlug.trim() || "未命名";
		if (newKind === "posts") {
			return "---\ntitle: " + yq(title) + "\npublished: " + today() + "\ndraft: true\ntags: []\ncategory: \"\"\n---\n\n";
		}
		if (newKind === "dynamic") {
			return "---\npublished: " + nowStamp() + "\npinned: false\nlocation: \"\"\n---\n\n";
		}
		if (newKind === "projects") {
			return (
				"---\ntitle: " +
				yq(title) +
				"\npublished: " +
				today() +
				"\ndraft: true\ndescription: \"\"\ntags: []\nstatus: \"\"\nlang: \"\"\nlink: []\n---\n\n"
			);
		}
		return "";
	}

	async function createFile() {
		newErr = "";
		const p = targetPath();
		if (!p) {
			newErr = newKind === "path" ? "请填完整路径" : "请填 slug";
			return;
		}
		if (newKind !== "path" && !/(^|\/)[^/]+\.(md|mdx)$/.test(p)) {
			newErr = "生成的路径不合法：" + p;
			return;
		}
		if (tree.includes(p)) {
			newErr = "文件已存在，换一个名字：" + p;
			return;
		}
		newBusy = true;
		try {
			const content = buildTemplate();
			// 不带 sha = 新建
			await gh(contentsUrl(p, false), {
				method: "PUT",
				body: JSON.stringify({ message: "chore(admin): 新建 " + p, content: strToB64(content), branch: branch }),
			});
			showNew = false;
			newSlug = "";
			newTitle = "";
			newPath = "";
			await loadTree();
			await open(p);
			saveMsg = "已新建 " + p + "（一次 commit）→ Vercel 会自动重新构建";
		} catch (e) {
			newErr = e instanceof Error ? e.message : String(e);
		} finally {
			newBusy = false;
		}
	}

	async function confirmDelete() {
		const p = delPath;
		if (!p) return;
		delBusy = true;
		error = "";
		try {
			const sha = file && file.path === p ? file.sha : (await gh(contentsUrl(p, true))).sha;
			await gh(contentsUrl(p, false), {
				method: "DELETE",
				body: JSON.stringify({ message: "chore(admin): 删除 " + p, sha: sha, branch: branch }),
			});
			if (file && file.path === p) {
				file = null;
				rawText = "";
				entries = [];
				body = "";
				hasFrontmatter = false;
			}
			// 立刻从本地列表移除，不等 tree 接口刷新（GitHub 的 tree 端有缓存，会晚几秒）
			tree = tree.filter((x) => x !== p);
			delPath = null;
			showDiff = false;
			saveMsg = "已删除 " + p + "（一次 commit）。删除也进 git 历史，可在 GitHub 的提交里恢复。";
			await loadTree();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			delBusy = false;
		}
	}

	function fileToB64(f: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const r = new FileReader();
			r.onload = () => {
				const s = String(r.result || "");
				resolve(s.indexOf(",") >= 0 ? s.slice(s.indexOf(",") + 1) : s);
			};
			r.onerror = () => reject(new Error("读取文件失败"));
			r.readAsDataURL(f);
		});
	}

	function openImagePicker() {
		if (!uploadBusy) fileInputEl?.click();
	}

	async function onImagePicked(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const f = input.files && input.files[0] ? input.files[0] : null;
		input.value = "";
		if (!f) return;
		uploadMsg = "";
		const okTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];
		if (okTypes.indexOf(f.type) < 0) {
			uploadMsg = "只收 png / jpg / webp / svg / gif（当前：" + (f.type || "未知") + "）";
			return;
		}
		if (f.size > 5 * 1024 * 1024) {
			uploadMsg = "图片 " + (f.size / 1024 / 1024).toFixed(1) + "MB，超过 5MB，请先压缩再传";
			return;
		}
		uploadBusy = true;
		try {
			const dot = f.name.lastIndexOf(".");
			const ext = (dot >= 0 ? f.name.slice(dot + 1) : "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
			const base =
				(f.name.slice(0, dot >= 0 ? dot : f.name.length) || "image")
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-+|-+$/g, "")
					.slice(0, 40) || "image";
			const d = new Date();
			const dest = "public/uploads/" + d.getFullYear() + "/" + pad2(d.getMonth() + 1) + "/" + base + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
			const content = await fileToB64(f);
			await gh(contentsUrl(dest, false), {
				method: "PUT",
				body: JSON.stringify({ message: "chore(admin): 上传图片 " + dest, content: content, branch: branch }),
			});
			const url = "/" + dest.replace(/^public\//, "");
			insertAtCursor("![](" + url + ")");
			uploadMsg = "已上传 " + dest + "（一次 commit），markdown 已插入光标处";
			await loadTree();
		} catch (err) {
			uploadMsg = err instanceof Error ? err.message : String(err);
		} finally {
			uploadBusy = false;
		}
	}

	function insertAtCursor(snippet: string) {
		const el = mode === "raw" ? textEl : bodyEl;
		if (!el) return;
		const start = typeof el.selectionStart === "number" ? el.selectionStart : el.value.length;
		const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
		const next = el.value.slice(0, start) + snippet + el.value.slice(end);
		if (mode === "raw") {
			rawText = next;
			if (isMd) {
				const fm = splitFrontmatter(next);
				if (fm) {
					entries = parseFm(fm.fm);
					body = fm.body;
					hasFrontmatter = true;
				}
			}
		} else {
			body = next;
		}
		const pos = start + snippet.length;
		queueMicrotask(() => {
			el.focus();
			el.setSelectionRange(pos, pos);
		});
	}

	type DiffRow = { t: string; text: string; al: number; bl: number };

	function computeDiff(a: string, b: string): DiffRow[] {
		const A = a.split("\n");
		const B = b.split("\n");
		const n = A.length;
		const m = B.length;
		if (n * m > 4000000) {
			const rows: DiffRow[] = [];
			let s = 0;
			while (s < n && s < m && A[s] === B[s]) {
				rows.push({ t: " ", text: A[s], al: s + 1, bl: s + 1 });
				s++;
			}
			rows.push({ t: "~", text: "…文件太大（" + n + " × " + m + " 行），逐行 diff 已跳过…", al: 0, bl: 0 });
			return rows;
		}
		const W = m + 1;
		const dp = new Int32Array((n + 1) * (m + 1));
		for (let i = n - 1; i >= 0; i--) {
			for (let j = m - 1; j >= 0; j--) {
				dp[i * W + j] = A[i] === B[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
			}
		}
		const rows: DiffRow[] = [];
		let i = 0;
		let j = 0;
		while (i < n && j < m) {
			if (A[i] === B[j]) {
				rows.push({ t: " ", text: A[i], al: i + 1, bl: j + 1 });
				i++;
				j++;
			} else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) {
				rows.push({ t: "-", text: A[i], al: i + 1, bl: 0 });
				i++;
			} else {
				rows.push({ t: "+", text: B[j], al: 0, bl: j + 1 });
				j++;
			}
		}
		while (i < n) {
			rows.push({ t: "-", text: A[i], al: i + 1, bl: 0 });
			i++;
		}
		while (j < m) {
			rows.push({ t: "+", text: B[j], al: 0, bl: j + 1 });
			j++;
		}
		return rows;
	}

	const diffRows = $derived(showDiff && file ? computeDiff(file.text, currentText) : []);
	const diffAdd = $derived(diffRows.filter((r) => r.t === "+").length);
	const diffDel = $derived(diffRows.filter((r) => r.t === "-").length);


	$effect(() => {
		if (typeof window === "undefined") return;
		const saved = sessionStorage.getItem(TOKEN_KEY);
		const repoPref = sessionStorage.getItem(REPO_KEY);
		if (repoPref) {
			try {
				const p = JSON.parse(repoPref);
				if (p.owner) owner = p.owner;
				if (p.repoName) repoName = p.repoName;
				if (p.branch) branch = p.branch;
			} catch {
				// 坏值忽略
			}
		}
		if (saved) {
			token = saved;
			connect();
		}
	});
</script>
<svelte:head>
	<meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
</svelte:head>

<div class="admin">
	<header class="bar">
		<div class="brand">
			<span class="dot"></span>
			<span>站点管理面板</span>
			<span class="tag">静态 / 无服务端 / 凭据仅存 sessionStorage</span>
		</div>
		{#if connected}
			<div class="who">
				<span>@{login}</span>
				<span class="mono">{owner}/{repoName}@{branch}</span>
				<button class="btn ghost" onclick={disconnect} type="button">退出</button>
			</div>
		{/if}
	</header>

	{#if !connected}
		<section class="gate">
			<h1>连接仓库</h1>
			<p class="note">
				面板不含任何密钥。请粘贴一枚 <strong>fine-grained PAT</strong>（仅本仓库，<code>Contents: Read and write</code> 权限），
				它只写进本标签页的 sessionStorage，关掉标签即失效，不会进入仓库或构建产物。
			</p>
			<div class="row">
				<label>Token<input id="admin-token" type="password" bind:value={token} placeholder="粘贴 fine-grained token" autocomplete="off" /></label>
			</div>
			<div class="row">
				<label>Owner<input id="admin-owner" bind:value={owner} /></label>
				<label>Repo<input id="admin-repo" bind:value={repoName} /></label>
				<label>Branch<input id="admin-branch" bind:value={branch} /></label>
			</div>
			<button id="admin-connect" class="btn primary" onclick={connect} disabled={busy || !token.trim()} type="button">
				{busy ? "连接中…" : "连接并列目录"}
			</button>
			{#if error}<p class="err">{error}</p>{/if}
		</section>
	{:else}
		<div class="layout">
			<aside class="tree">
				<div class="treeHead">
					<div class="scopes">
						{#each SCOPES as s}
							<button class="chip" class:on={scope === s.id} onclick={() => (scope = s.id)} type="button">{s.label}</button>
						{/each}
					</div>
					<input class="search" bind:value={query} placeholder="过滤路径…" />
					<div class="treeMeta">
						<span class="count">{visiblePaths.length} / {tree.length} 个文件</span>
						<button id="admin-new" class="btn small" onclick={() => (showNew = true)} type="button">＋ 新建</button>
					</div>
				</div>
				<div class="list">
					{#each visiblePaths as p}
						<div class="itemRow">
							<button class="item" data-path={p} class:active={file?.path === p} onclick={() => open(p)} type="button">{p}</button>
							<button
								class="del"
								data-del={p}
								title={"删除 " + p}
								aria-label={"删除 " + p}
								onclick={(ev) => {
									ev.stopPropagation();
									delPath = p;
								}}
								type="button">✕</button
							>
						</div>
					{/each}
				</div>
			</aside>

			<main class="editor">
				{#if !file}
					<div class="empty">← 左侧选文件：markdown 走表单 + 正文，其余文件走原始文本编辑器</div>
				{:else}
					<div class="fileHead">
						<div class="path mono">{file.path}</div>
						<div class="actions">
							{#if isMd && hasFrontmatter}
								<button class="chip" class:on={mode === "form"} onclick={() => toggleMode("form")} type="button">表单</button>
								<button class="chip" class:on={mode === "raw"} onclick={() => toggleMode("raw")} type="button">原文</button>
							{/if}
							{#if mode === "raw"}
								<button class="chip" class:on={showLineNumbers} onclick={() => (showLineNumbers = !showLineNumbers)} type="button">行号</button>
							{/if}
							<button id="admin-upload" class="chip" onclick={openImagePicker} disabled={uploadBusy} type="button">{uploadBusy ? "上传中…" : "插入图片"}</button>
							<button id="admin-diff" class="chip" class:on={showDiff} onclick={() => (showDiff = !showDiff)} type="button">查看改动</button>
							<input
								bind:this={fileInputEl}
								type="file"
								accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
								onchange={onImagePicked}
								hidden
							/>
						</div>
					</div>
					{#if uploadMsg}<p class="hint">{uploadMsg}</p>{/if}

					{#if mode === "form" && isMd}
						<div class="form">
							{#if isPost}
								{#each POST_FIELDS as def, i (def.key)}
									<div class="field">
										<label for={"f" + i}>{def.label}</label>
										{#if def.type === "bool"}
											<input id={"f" + i} type="checkbox" checked={valueOf(def) === true} onchange={(e) => touch(def, e.currentTarget.checked)} />
										{:else if def.type === "list"}
											<input id={"f" + i} value={listText(valueOf(def) as string[])} oninput={(e) => editList(def, e.currentTarget.value)} placeholder="逗号分隔" />
										{:else}
											<input id={"f" + i} value={String(valueOf(def))} oninput={(e) => touch(def, e.currentTarget.value)} placeholder={def.hint ?? ""} />
										{/if}
									</div>
								{/each}
								{#if extraEntries.length > 0}
									<h3 class="sub">其它字段（不在 posts schema 里，原样保留）</h3>
									{#each extraEntries as e, i (e.key)}
										<div class="field">
											<label for={"x" + i}>{e.key}</label>
											{#if e.kind === "scalar" && (e.value === "true" || e.value === "false")}
												<input id={"x" + i} type="checkbox" checked={e.value === "true"} onchange={(ev) => editEntryScalar(e, ev.currentTarget.checked ? "true" : "false")} />
											{:else if e.kind === "scalar"}
												<input id={"x" + i} value={e.value} oninput={(ev) => editEntryScalar(e, ev.currentTarget.value)} />
											{:else}
												<input id={"x" + i} value={listText(e.items)} oninput={(ev) => editEntryList(e, ev.currentTarget.value)} />
											{/if}
										</div>
									{/each}
								{/if}
							{:else}
								{#each entries.filter((e) => e.kind !== "raw") as e, i (e.key + "-" + i)}
									<div class="field">
										<label for={"g" + i}>{e.key}</label>
										{#if e.kind === "scalar" && (e.value === "true" || e.value === "false")}
											<input id={"g" + i} type="checkbox" checked={e.value === "true"} onchange={(ev) => editEntryScalar(e, ev.currentTarget.checked ? "true" : "false")} />
										{:else if e.kind === "scalar"}
											<input id={"g" + i} value={e.value} oninput={(ev) => editEntryScalar(e, ev.currentTarget.value)} />
										{:else}
											<input id={"g" + i} value={listText(e.items)} oninput={(ev) => editEntryList(e, ev.currentTarget.value)} />
										{/if}
									</div>
								{/each}
							{/if}
							<h3 class="sub">正文（纯文本 Markdown，原样写回）</h3>
							<textarea id="admin-body" class="bodyArea" bind:this={bodyEl} bind:value={body} spellcheck="false"></textarea>
						</div>
					{:else}
						<div class="rawWrap">
							{#if showLineNumbers}
								<div class="gutter mono" bind:this={gutterEl}>
									{#each Array.from({ length: lineCount }, (_, i) => i + 1) as n}
										<div>{n}</div>
									{/each}
								</div>
							{/if}
							<textarea id="admin-raw" class="rawArea mono" bind:this={textEl} bind:value={rawText} spellcheck="false" onscroll={onScroll}></textarea>
						</div>
						{#if isCode}
							<p class="warn">这里直接写源码：语法写错会让构建失败，保存前确认括号与引号闭合。</p>
						{/if}
					{/if}

					{#if showDiff}
						<div class="diffBox" id="admin-diffbox">
							<div class="diffHead">
								<span>原内容 vs 新内容（逐行）</span>
								<span class="mono">+{diffAdd} / −{diffDel}</span>
							</div>
							<div class="diffBody mono">
								{#each diffRows as r, i (i)}
									<div class="diffLine" class:add={r.t === "+"} class:del={r.t === "-"} class:lbl={r.t === "~"}>
										<span class="ln">{r.al > 0 ? r.al : ""}</span>
										<span class="ln">{r.bl > 0 ? r.bl : ""}</span>
										<span class="sign">{r.t}</span>
										<span class="txt">{r.text}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<div class="commit">
						<input class="msg mono" bind:value={commitMessage} placeholder="commit message" />
						<button class="btn ghost" onclick={() => open(file.path)} disabled={busy || !dirty} type="button">还原</button>
						<button id="admin-save" class="btn primary" onclick={save} disabled={busy || !dirty} type="button">{busy ? "提交中…" : dirty ? "保存并提交" : "无改动"}</button>
					</div>
					{#if dirty}<p class="hint">保存 = 一次 commit；推送到 {branch} 后 Vercel 会自动重新构建。</p>{/if}
				{/if}

				{#if showNew}
					<div class="overlay" onclick={() => (showNew = false)} role="presentation">
						<div class="modal" role="dialog" aria-label="新建文件" onclick={(ev) => ev.stopPropagation()}>
							<h3>新建文件</h3>
							<div class="row">
								<label
									>类型
									<select bind:value={newKind}>
										{#each NEW_KINDS as k (k.id)}<option value={k.id}>{k.label}</option>{/each}
									</select>
								</label>
							</div>
							{#if newKind === "path"}
								<div class="row">
									<label>完整路径<input id="admin-new-path" bind:value={newPath} placeholder="src/config/xxxConfig.ts 或 docs/xxx.md" /></label>
								</div>
							{:else}
								<div class="row">
									<label>slug（文件名）<input id="admin-new-slug" bind:value={newSlug} placeholder="my-new-post" /></label>
									<label>标题<input id="admin-new-title" bind:value={newTitle} placeholder="写进 frontmatter 的标题" /></label>
								</div>
							{/if}
							<p class="note mono">将创建：{targetPath() || "（待填）"}</p>
							{#if newKind === "path"}<p class="note">任意路径文件内容为空，创建后直接进编辑器写。</p>{/if}
							{#if newErr}<p class="err">{newErr}</p>{/if}
							<div class="modalActions">
								<button class="btn ghost" onclick={() => (showNew = false)} type="button">取消</button>
								<button id="admin-new-confirm" class="btn primary" onclick={createFile} disabled={newBusy} type="button">{newBusy ? "创建中…" : "创建并提交"}</button>
							</div>
						</div>
					</div>
				{/if}

				{#if delPath}
					<div class="overlay" onclick={() => (delPath = null)} role="presentation">
						<div class="modal" role="dialog" aria-label="确认删除" onclick={(ev) => ev.stopPropagation()}>
							<h3>确认删除这个文件？</h3>
							<p class="delTarget mono">{delPath}</p>
							<p class="note">
								删除会直接提交一次 commit 到 <strong>{branch}</strong>，Vercel 会重新构建。删除也进 git 历史，之后可以在 GitHub 的提交里恢复。
							</p>
							<div class="modalActions">
								<button class="btn ghost" onclick={() => (delPath = null)} type="button">取消</button>
								<button id="admin-del-confirm" class="btn danger" onclick={confirmDelete} disabled={delBusy} type="button">{delBusy ? "删除中…" : "确认删除"}</button>
							</div>
						</div>
					</div>
				{/if}

				{#if error}<p class="err">{error}</p>{/if}
				{#if saveMsg}<p class="ok">{saveMsg}</p>{/if}
			</main>
		</div>
	{/if}

	<footer class="foot">
		<span>随机路径 + 前端密码都只是遮挡（前端可见、能被绕过）。</span>
		<span class="strong">真正的锁是 PAT：没有站主的 fine-grained token，这里任何一次保存都会被 GitHub 拒绝。</span>
	</footer>
</div>

<style>
	.admin {
		--bg: #0d1014;
		--bg2: #141920;
		--line: #232a34;
		--fg: #e6e9ef;
		--dim: #93a0b3;
		--accent: #4ea1ff;
		min-height: 100vh;
		background: var(--bg);
		color: var(--fg);
		font: 14px/1.6 system-ui, -apple-system, "Segoe UI", "Noto Sans SC", sans-serif;
	}
	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	}
	.bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		border-bottom: 1px solid var(--line);
		background: var(--bg2);
		position: sticky;
		top: 0;
		z-index: 5;
		flex-wrap: wrap;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 600;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 10px var(--accent);
	}
	.tag {
		font-weight: 400;
		font-size: 12px;
		color: var(--dim);
	}
	.who {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 12px;
		color: var(--dim);
	}
	.gate {
		max-width: 720px;
		margin: 64px auto;
		padding: 24px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--bg2);
	}
	.gate h1 {
		margin: 0 0 12px;
		font-size: 18px;
	}
	.note {
		color: var(--dim);
		font-size: 13px;
	}
	.note code {
		background: #1d2530;
		padding: 1px 5px;
		border-radius: 4px;
	}
	.row {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		margin: 12px 0;
	}
	.row label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12px;
		color: var(--dim);
		flex: 1 1 180px;
	}
	input,
	textarea {
		background: #0b0e12;
		border: 1px solid var(--line);
		border-radius: 8px;
		color: var(--fg);
		padding: 8px 10px;
		font-size: 13px;
		width: 100%;
		box-sizing: border-box;
	}
	input[type="checkbox"] {
		width: 16px;
		height: 16px;
	}
	input:focus,
	textarea:focus {
		outline: 1px solid var(--accent);
		border-color: var(--accent);
	}
	.btn {
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 8px 14px;
		background: #1b2330;
		color: var(--fg);
		cursor: pointer;
		font-size: 13px;
	}
	.btn.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: #06101c;
		font-weight: 600;
	}
	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.btn.ghost {
		background: transparent;
	}
	.layout {
		display: grid;
		grid-template-columns: 340px minmax(0, 1fr);
		/* 顶栏 49px + 页脚（安全边界提示）约 36px */
		height: calc(100vh - 85px);
	}
	.foot {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		padding: 8px 16px;
		border-top: 1px solid var(--line);
		color: var(--dim);
		font-size: 12px;
	}
	.foot .strong {
		color: #cfe4ff;
	}
	.tree {
		border-right: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.treeHead {
		padding: 10px;
		border-bottom: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.scopes {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		border: 1px solid var(--line);
		background: transparent;
		color: var(--dim);
		border-radius: 999px;
		padding: 3px 10px;
		font-size: 12px;
		cursor: pointer;
	}
	.chip.on {
		color: var(--fg);
		border-color: var(--accent);
		background: rgba(78, 161, 255, 0.12);
	}
	.count {
		font-size: 11px;
		color: var(--dim);
	}
	.list {
		overflow: auto;
		min-height: 0;
		padding: 6px;
	}
	.item {
		display: block;
		width: 100%;
		text-align: left;
		background: transparent;
		border: 0;
		color: var(--dim);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 12px;
		padding: 5px 8px;
		border-radius: 6px;
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.item:hover {
		background: #18202b;
		color: var(--fg);
	}
	.item.active {
		background: #1b2a3d;
		color: #cfe4ff;
	}
	.editor {
		display: flex;
		flex-direction: column;
		min-height: 0;
		padding: 12px 16px 20px;
		overflow: auto;
	}
	.empty {
		color: var(--dim);
		margin: 40px auto;
	}
	.fileHead {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		margin-bottom: 10px;
	}
	.path {
		font-size: 12px;
		color: #bcd0e6;
		word-break: break-all;
	}
	.actions {
		display: flex;
		gap: 6px;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.field {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		align-items: center;
		gap: 10px;
	}
	.field label {
		font-size: 12px;
		color: var(--dim);
	}
	.sub {
		font-size: 12px;
		color: #bcd0e6;
		margin: 14px 0 4px;
		font-weight: 600;
	}
	.bodyArea {
		min-height: 320px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		line-height: 1.65;
		resize: vertical;
	}
	.rawWrap {
		display: flex;
		border: 1px solid var(--line);
		border-radius: 10px;
		overflow: hidden;
		background: #0b0e12;
		min-height: 0;
	}
	.gutter {
		padding: 10px 8px;
		text-align: right;
		color: #4d5a6b;
		font-size: 12px;
		line-height: 1.65;
		user-select: none;
		overflow: hidden;
		background: #0a0d11;
		border-right: 1px solid var(--line);
	}
	.rawArea {
		border: 0;
		border-radius: 0;
		min-height: 62vh;
		line-height: 1.65;
		resize: none;
		white-space: pre;
		overflow: auto;
	}
	.rawArea:focus {
		outline: 0;
	}
	.commit {
		display: flex;
		gap: 8px;
		margin-top: 14px;
		align-items: center;
		flex-wrap: wrap;
	}
	.msg {
		flex: 1 1 320px;
		font-size: 12px;
	}
	.hint {
		font-size: 12px;
		color: var(--dim);
		margin: 8px 0 0;
	}
	.warn {
		font-size: 12px;
		color: #ffca6a;
		margin: 8px 0 0;
	}
	.err {
		color: #ff8080;
		font-size: 13px;
		margin: 10px 0 0;
	}
	.ok {
		color: #6ee7a8;
		font-size: 13px;
		margin: 10px 0 0;
	}
	.treeMeta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.btn.small {
		padding: 3px 10px;
		font-size: 12px;
		border-radius: 999px;
		background: #1b2330;
	}
	.itemRow {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.itemRow .item {
		flex: 1 1 auto;
		min-width: 0;
	}
	.del {
		flex: 0 0 auto;
		border: 0;
		background: transparent;
		color: #5b6b7f;
		cursor: pointer;
		font-size: 12px;
		padding: 3px 6px;
		border-radius: 6px;
		opacity: 0;
	}
	.itemRow:hover .del,
	.del:focus-visible {
		opacity: 1;
	}
	.del:hover {
		color: #ff8080;
		background: rgba(255, 128, 128, 0.12);
	}
	select {
		background: #0b0e12;
		border: 1px solid var(--line);
		border-radius: 8px;
		color: var(--fg);
		padding: 8px 10px;
		font-size: 13px;
		width: 100%;
		box-sizing: border-box;
	}
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(4, 7, 11, 0.72);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 30;
		padding: 20px;
	}
	.modal {
		width: min(560px, 100%);
		background: var(--bg2);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 20px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}
	.modal h3 {
		margin: 0 0 12px;
		font-size: 15px;
	}
	.modal .row {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		margin: 10px 0;
	}
	.modal .row label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12px;
		color: var(--dim);
		flex: 1 1 220px;
	}
	.modalActions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 16px;
	}
	.btn.danger {
		background: #ff6b6b;
		border-color: #ff6b6b;
		color: #160707;
		font-weight: 600;
	}
	.delTarget {
		background: #0b0e12;
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 8px 10px;
		font-size: 12px;
		color: #ffb4b4;
		word-break: break-all;
		margin: 6px 0 10px;
	}
	.diffBox {
		margin-top: 14px;
		border: 1px solid var(--line);
		border-radius: 10px;
		overflow: hidden;
		background: #0b0e12;
	}
	.diffHead {
		display: flex;
		justify-content: space-between;
		padding: 7px 10px;
		font-size: 12px;
		color: var(--dim);
		border-bottom: 1px solid var(--line);
		background: #10151c;
	}
	.diffBody {
		max-height: 300px;
		overflow: auto;
		font-size: 12px;
		line-height: 1.6;
	}
	.diffLine {
		display: flex;
		gap: 8px;
		padding: 0 8px;
		white-space: pre;
	}
	.diffLine .ln {
		width: 34px;
		flex: 0 0 auto;
		text-align: right;
		color: #46536a;
		user-select: none;
	}
	.diffLine .sign {
		width: 10px;
		flex: 0 0 auto;
		color: #6b7a90;
	}
	.diffLine .txt {
		color: #c9d4e3;
	}
	.diffLine.add {
		background: rgba(78, 255, 160, 0.07);
	}
	.diffLine.add .txt {
		color: #93f0bd;
	}
	.diffLine.del {
		background: rgba(255, 107, 107, 0.08);
	}
	.diffLine.del .txt {
		color: #ffb4b4;
	}
	.diffLine.lbl .txt {
		color: var(--dim);
		font-style: italic;
	}
	@media (max-width: 860px) {
		.treeMeta {
			flex-wrap: wrap;
		}

		.layout {
			grid-template-columns: 1fr;
			height: auto;
		}
		.tree {
			max-height: 40vh;
			border-right: 0;
			border-bottom: 1px solid var(--line);
		}
		.field {
			grid-template-columns: 1fr;
		}
	}
</style>
