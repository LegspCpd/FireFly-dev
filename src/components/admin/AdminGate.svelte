<script lang="ts">
	// 管理面板的前端密码门。
	//
	// 诚实的边界：这是「遮挡」，不是鉴权。整页 HTML/JS 都从 CDN 直接给到浏览器，
	// 校验只在本地做（crypto.subtle.digest 出来的 SHA-256 与 adminConfig.passwordHash 比对），
	// 所以能读到 hash 的人可以离线爆破；真正拦住写入的是 PAT（GitHub 侧拒绝）。
	//
	// 未解锁时这里**只有密码框**：不渲染 AdminPanel、不读 sessionStorage 里的旧 token、
	// 不发任何 api.github.com 请求。解锁状态与 token 同一生命周期（sessionStorage，关标签即失效）。
	import { onMount } from "svelte";
	import { adminPanelConfig } from "@/config/adminConfig";
	import AdminPanel from "./AdminPanel.svelte";

	const UNLOCK_KEY = "firefly-admin-unlocked";
	const FAIL_KEY = "firefly-admin-attempts";
	const MAX_FAILS = 5;
	const LOCK_MS = 60_000;

	const hasPassword = adminPanelConfig.passwordHash.length > 0;

	let unlocked = $state(!hasPassword);
	let pwd = $state("");
	let busy = $state(false);
	let fails = $state(0);
	let lockedUntil = $state(0);
	let clock = $state(Date.now());
	let envError = $state("");

	const remaining = $derived(lockedUntil > clock ? Math.ceil((lockedUntil - clock) / 1000) : 0);
	const locked = $derived(remaining > 0);
	const leftBeforeLock = $derived(Math.max(0, MAX_FAILS - fails));
	const notice = $derived(
		locked
			? "连续输错 " + MAX_FAILS + " 次，已锁定 " + remaining + " 秒（只在前端，刷新页面也一样）"
			: fails > 0
				? "密码不对（已错 " + fails + " 次，再错 " + leftBeforeLock + " 次锁定 60 秒）"
				: "",
	);

	function persist() {
		try {
			sessionStorage.setItem(FAIL_KEY, JSON.stringify({ fails: fails, lockedUntil: lockedUntil }));
		} catch {
			// 隐私模式下写不进去，忽略
		}
	}

	async function sha256Hex(text: string): Promise<string> {
		const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
		let out = "";
		for (const byte of new Uint8Array(digest)) out += byte.toString(16).padStart(2, "0");
		return out;
	}

	async function submit() {
		if (busy || locked || !pwd) return;
		busy = true;
		envError = "";
		try {
			const hex = await sha256Hex(pwd);
			if (hex.toLowerCase() === adminPanelConfig.passwordHash.trim().toLowerCase()) {
				fails = 0;
				lockedUntil = 0;
				pwd = "";
				try {
					sessionStorage.setItem(UNLOCK_KEY, "1");
					sessionStorage.removeItem(FAIL_KEY);
				} catch {
					// 同上
				}
				unlocked = true;
			} else {
				fails += 1;
				if (fails >= MAX_FAILS) lockedUntil = Date.now() + LOCK_MS;
				pwd = "";
				persist();
			}
		} catch (e) {
			// crypto.subtle 只在安全上下文（https / localhost）可用
			envError = "当前环境无法计算 SHA-256（需要 https 或 localhost）：" + String(e).slice(0, 80);
		} finally {
			busy = false;
			clock = Date.now();
		}
	}

	onMount(() => {
		if (!hasPassword) return;
		try {
			if (sessionStorage.getItem(UNLOCK_KEY) === "1") unlocked = true;
			const raw = sessionStorage.getItem(FAIL_KEY);
			if (raw) {
				const saved = JSON.parse(raw);
				const n = Number(saved?.fails);
				if (Number.isFinite(n) && n > 0) fails = n;
				const until = Number(saved?.lockedUntil);
				if (Number.isFinite(until) && until > Date.now()) lockedUntil = until;
			}
		} catch {
			// 坏值忽略
		}
		clock = Date.now();
		const timer = setInterval(() => {
			clock = Date.now();
			// 锁定到期：清掉计数，可以重新试
			if (lockedUntil !== 0 && Date.now() >= lockedUntil) {
				lockedUntil = 0;
				fails = 0;
				persist();
			}
		}, 500);
		return () => clearInterval(timer);
	});
</script>

{#if unlocked}
	<AdminPanel />
{:else}
	<div class="admin">
		<header class="bar">
			<div class="brand">
				<span class="dot"></span>
				<span>站点管理面板</span>
				<span class="tag">静态 / 无服务端 / 先过密码门</span>
			</div>
		</header>

		<section class="gate">
			<h1>需要访问密码</h1>
			<p class="note">
				密码在前端校验（SHA-256 与配置里的哈希比对），所以它只是<strong>遮挡</strong>，不是鉴权。
				真正的锁是后面的 PAT：没有站主的 fine-grained token，面板里任何一次保存都会被 GitHub 拒绝。
			</p>
			<form
				class="row"
				onsubmit={(ev) => {
					ev.preventDefault();
					void submit();
				}}
			>
				<label
					>访问密码<input
						id="admin-pwd"
						type="password"
						bind:value={pwd}
						autocomplete="current-password"
						placeholder="输入站主口令"
						disabled={locked || busy}
					/></label
				>
			</form>
			{#if adminPanelConfig.passwordHint}
				<p class="hint" id="admin-pwd-hint">{adminPanelConfig.passwordHint}</p>
			{/if}
			<div class="actions">
				<button id="admin-unlock" class="btn primary" type="button" onclick={submit} disabled={locked || busy || !pwd}>
					{busy ? "校验中…" : locked ? "锁定 " + remaining + "s" : "解锁"}
				</button>
				{#if fails > 0 && !locked}
					<span class="tries" id="admin-pwd-tries">{"●".repeat(fails) + "○".repeat(leftBeforeLock)}</span>
				{/if}
			</div>
			{#if envError || notice}
				<p class="err" id="admin-lock-msg">{envError || notice}</p>
			{/if}
		</section>

		<footer class="foot">
			<span>随机路径 + 这层密码都只是遮挡（前端可见，能被绕过）。</span>
			<span class="strong">真正的锁是 PAT：没有站主的 fine-grained token，这里什么也改不了。</span>
		</footer>
	</div>
{/if}

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
		display: flex;
		flex-direction: column;
	}
	.bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		border-bottom: 1px solid var(--line);
		background: var(--bg2);
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
	.gate {
		width: 100%;
		max-width: 720px;
		margin: 64px auto 24px;
		padding: 24px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--bg2);
		box-sizing: border-box;
	}
	.gate h1 {
		margin: 0 0 12px;
		font-size: 18px;
	}
	.note {
		color: var(--dim);
		font-size: 13px;
		margin: 0 0 4px;
	}
	.note strong {
		color: #cfe4ff;
	}
	.row {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		margin: 16px 0 6px;
	}
	.row label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12px;
		color: var(--dim);
		flex: 1 1 220px;
	}
	input {
		background: #0b0e12;
		border: 1px solid var(--line);
		border-radius: 8px;
		color: var(--fg);
		padding: 8px 10px;
		font-size: 13px;
		width: 100%;
		box-sizing: border-box;
	}
	input:focus {
		outline: 1px solid var(--accent);
		border-color: var(--accent);
	}
	input:disabled {
		opacity: 0.6;
	}
	.hint {
		margin: 4px 0 0;
		font-size: 12px;
		color: var(--dim);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 14px;
	}
	.tries {
		font-size: 12px;
		color: var(--dim);
		letter-spacing: 2px;
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
	.err {
		color: #ff8f8f;
		font-size: 13px;
		margin: 12px 0 0;
	}
	.foot {
		margin-top: auto;
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		padding: 10px 16px;
		border-top: 1px solid var(--line);
		color: var(--dim);
		font-size: 12px;
	}
	.foot .strong {
		color: #cfe4ff;
	}
</style>
