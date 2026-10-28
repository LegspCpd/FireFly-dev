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
					<div class="count">{visiblePaths.length} / {tree.length} 个文件</div>
				</div>
				<div class="list">
					{#each visiblePaths as p}
						<button class="item" data-path={p} class:active={file?.path === p} onclick={() => open(p)} type="button">{p}</button>
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
						</div>
					</div>

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
							<textarea id="admin-body" class="bodyArea" bind:value={body} spellcheck="false"></textarea>
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

					<div class="commit">
						<input class="msg mono" bind:value={commitMessage} placeholder="commit message" />
						<button class="btn ghost" onclick={() => open(file.path)} disabled={busy || !dirty} type="button">还原</button>
						<button id="admin-save" class="btn primary" onclick={save} disabled={busy || !dirty} type="button">{busy ? "提交中…" : dirty ? "保存并提交" : "无改动"}</button>
					</div>
					{#if dirty}<p class="hint">保存 = 一次 commit；推送到 {branch} 后 Vercel 会自动重新构建。</p>{/if}
				{/if}

				{#if error}<p class="err">{error}</p>{/if}
				{#if saveMsg}<p class="ok">{saveMsg}</p>{/if}
			</main>
		</div>
	{/if}
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
		height: calc(100vh - 49px);
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
	@media (max-width: 860px) {
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
