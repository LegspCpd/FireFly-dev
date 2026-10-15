/**
 * 友链一键申请后端（Cloudflare Worker）
 *
 * 只做一件事：收表单 → 校验 → 用令牌在友链仓建分支 + 文件 + PR。
 * 令牌由站主通过 wrangler secret put GITHUB_TOKEN 自行填写，代码里不出现任何密钥。
 *
 *   GET  /         健康检查
 *   POST /apply    提交申请
 *
 * 站点可达 / 头像可达由前端实时检查；「有没有放本站链接」由友链仓的
 * pr-check Action 在服务端检查并打标签，这里不做。
 */

const LIMITS = { name: 60, description: 100, url: 300, avatar: 500, backlink: 300 };

/** 允许调用本接口的前端来源（多域名部署，逐个列出） */
const ALLOWED_ORIGINS = [
	"https://blog.legspcpd.top",
	"https://www.legspcpd.top",
	"https://legspcpd.top",
	"https://dev.legspcpd.top",
];

function json(body, status) {
	return new Response(JSON.stringify(body), {
		status: status || 200,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

/** CORS：只放行白名单来源，另允许本地调试 */
function corsHeaders(origin) {
	const ok =
		ALLOWED_ORIGINS.indexOf(origin) >= 0 ||
		/^http:\/\/localhost:\d+$/.test(origin) ||
		/^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
	if (!ok) return {};
	return {
		"access-control-allow-origin": origin,
		"access-control-allow-methods": "POST, GET, OPTIONS",
		"access-control-allow-headers": "content-type",
		"access-control-max-age": "86400",
		vary: "origin",
	};
}

/** 只接受公网 http(s) 地址，挡掉本机与内网，避免被当作探测工具 */
function isPublicHttpUrl(value) {
	if (typeof value !== "string") return false;
	let u;
	try {
		u = new URL(value);
	} catch (e) {
		return false;
	}
	if (u.protocol !== "http:" && u.protocol !== "https:") return false;
	const host = u.hostname.toLowerCase();
	if (host === "localhost" || host.endsWith(".localhost")) return false;
	if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
		const p = host.split(".").map(Number);
		if (p[0] === 10 || p[0] === 127 || p[0] === 0) return false;
		if (p[0] === 192 && p[1] === 168) return false;
		if (p[0] === 169 && p[1] === 254) return false;
		if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
	}
	if (host.indexOf(":") >= 0) return false;
	return true;
}

function normalizeUrl(value) {
	try {
		const u = new URL(value);
		return (u.origin + u.pathname).replace(/\/+$/, "").toLowerCase();
	} catch (e) {
		return String(value || "").replace(/\/+$/, "").toLowerCase();
	}
}

/** 由站点域名生成安全文件名：abc.example.com -> abc-example-com */
function slugFromUrl(url) {
	let host = "";
	try {
		host = new URL(url).hostname.toLowerCase();
	} catch (e) {
		host = "";
	}
	const slug = host.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	return slug || "friend-" + Date.now().toString(36);
}

function validate(body) {
	const errors = [];
	const name = typeof body.name === "string" ? body.name.trim() : "";
	const url = typeof body.url === "string" ? body.url.trim() : "";
	const avatar = typeof body.avatar === "string" ? body.avatar.trim() : "";
	const description = typeof body.description === "string" ? body.description.trim() : "";
	const backlink = typeof body.backlink === "string" ? body.backlink.trim() : "";
	if (!name) errors.push("站点名不能为空");
	else if (name.length > LIMITS.name) errors.push("站点名不能超过 " + LIMITS.name + " 字");
	if (!isPublicHttpUrl(url)) errors.push("站点链接必须是可访问的 http(s) 公网地址");
	else if (url.length > LIMITS.url) errors.push("站点链接过长");
	if (avatar && !isPublicHttpUrl(avatar)) errors.push("头像链接必须是 http(s) 地址");
	else if (avatar.length > LIMITS.avatar) errors.push("头像链接过长");
	if (description.length > LIMITS.description) errors.push("简介不能超过 " + LIMITS.description + " 字");
	if (backlink && !isPublicHttpUrl(backlink)) errors.push("友链页链接必须是 http(s) 地址");
	else if (backlink.length > LIMITS.backlink) errors.push("友链页链接过长");
	if (body.agreed !== true) errors.push("请先确认已在自己的友链页面添加本站链接");
	const entry = { name: name, avatar: avatar || null, description: description, url: url };
	if (backlink) entry.backlink = backlink;
	return { errors: errors, entry: entry };
}

/** PEM（PKCS#8）→ DER 字节 */
function pemToDer(pem) {
	const body = String(pem).replace(/-----[^-]+-----/g, "").replace(/[\s\r\n]/g, "");
	const bin = atob(body);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

/** base64url（JWT 用） */
function b64url(input) {
	const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** DER 长度编码 */
function derLen(n) {
	if (n < 0x80) return [n];
	if (n < 0x100) return [0x81, n];
	return [0x82, (n >> 8) & 0xff, n & 0xff];
}

/**
 * PKCS#1 → PKCS#8。
 * GitHub 生成的 App 私钥是 PKCS#1（-----BEGIN RSA PRIVATE KEY-----），
 * 而 WebCrypto 的 importKey 只接受 PKCS#8，所以这里补上外层封装。
 */
function pkcs1ToPkcs8(der) {
	const ver = [0x02, 0x01, 0x00];
	const alg = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
	const inner = [0x04].concat(derLen(der.length), Array.from(der));
	const body = ver.concat(alg, inner);
	return new Uint8Array([0x30].concat(derLen(body.length), body));
}

/** 按 PEM 头判断是 PKCS#1 还是 PKCS#8，返回可被 WebCrypto 导入的 DER */
function appKeyDer(pem) {
	const der = pemToDer(pem);
	return String(pem).indexOf("BEGIN RSA PRIVATE KEY") >= 0 ? pkcs1ToPkcs8(der) : der;
}

/**
 * 用 GitHub App 私钥签发 JWT（RS256）。GitHub 要求 exp 距现在不超过 10 分钟。
 */
async function signAppJwt(env, nowMs) {
	const iat = Math.floor((nowMs || Date.now()) / 1000) - 60;
	const header = { alg: "RS256", typ: "JWT" };
	const payload = { iat: iat, exp: iat + 540, iss: String(env.APP_ID) };
	const data = b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(payload));
	const key = await crypto.subtle.importKey(
		"pkcs8",
		appKeyDer(env.APP_PRIVATE_KEY),
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));
	return data + "." + b64url(new Uint8Array(sig));
}

let cachedAppToken = { value: "", expiresAt: 0 };

/** 用 App 私钥换 installation token（缓存到过期前一分钟） */
async function appToken(env) {
	if (cachedAppToken.value && Date.now() < cachedAppToken.expiresAt - 60000) return cachedAppToken.value;
	const jwt = await signAppJwt(env);
	const appHeaders = {
	authorization: "Bearer " + jwt,
	accept: "application/vnd.github+json",
	"user-agent": "firefly-friends-apply",
	};
	const instRes = await fetch(
		"https://api.github.com/repos/" + env.OWNER + "/" + env.REPO + "/installation",
		{ headers: appHeaders },
	);
	if (!instRes.ok) throw new Error("读取 App 安装信息失败：HTTP " + instRes.status);
	const inst = await instRes.json();
	const tokRes = await fetch("https://api.github.com/app/installations/" + inst.id + "/access_tokens", {
		method: "POST",
		headers: appHeaders,
	});
	if (!tokRes.ok) throw new Error("签发 installation token 失败：HTTP " + tokRes.status);
	const tok = await tokRes.json();
	cachedAppToken = { value: tok.token, expiresAt: new Date(tok.expires_at).getTime() };
	return tok.token;
}

/** 凭据解析：配了 App 就用 App（短期令牌），否则退回 PAT */
/** 从 HTML 的 meta 里取值（property/name 不分先后，属性顺序任意） */
function metaContent(html, keys) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attr = function (n) {
      const m = tag.match(new RegExp(n + "\\s*=\\s*[\"']([^\"']*)[\"']", "i"));
      return m ? m[1] : "";
    };
    const key = (attr("property") || attr("name")).toLowerCase();
    if (keys.indexOf(key) >= 0) {
      const c = attr("content");
      if (c) return c;
    }
  }
  return "";
}

/** 从 <link rel=...> 取 href */
function linkHref(html, rels) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attr = function (n) {
      const m = tag.match(new RegExp(n + "\\s*=\\s*[\"']([^\"']*)[\"']", "i"));
      return m ? m[1] : "";
    };
    const rel = attr("rel").toLowerCase();
    for (const r of rels) {
      if (rel.indexOf(r) >= 0) {
        const h = attr("href");
        if (h) return h;
      }
    }
  }
  return "";
}

function absolutize(href, baseUrl) {
  // 空值 / # / javascript: 之类不能当成有效地址（否则会把页面自身当成头像）
  if (!href || href === "#" || /^javascript:/i.test(href)) return "";
  try {
    const abs = new URL(href, baseUrl).href;
    return abs === baseUrl ? "" : abs;
  } catch (e) {
    return "";
  }
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\u0022")
    .replace(/&#39;/g, "\u0027")
    .replace(/&nbsp;/g, " ");
}

/**
 * 抓取申请人站点，提取「没填时可以自动补全」的字段。
 * 浏览器受同源策略限制读不了别人站点的 HTML，所以这一步放在服务端。
 */
async function probeSite(target) {
  if (!isPublicHttpUrl(target)) return { ok: false, error: "只支持公网 http(s) 地址" };
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, 15000);
  let res;
  try {
    res = await fetch(target, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        // 用浏览器 UA：不少站点/CDN 会直接拒掉明显的 Bot UA（实测返回 400）
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: "打不开：" + String((e && e.message) || e) };
  }
  clearTimeout(timer);
  if (!res.ok) return { ok: false, error: "HTTP " + res.status };
  const ctype = res.headers.get("content-type") || "";
  if (ctype.indexOf("html") < 0) return { ok: false, error: "不是 HTML 页面（" + ctype + "）" };
  const html = (await res.text()).slice(0, 400000);
  const finalUrl = res.url || target;

  let title = metaContent(html, ["og:site_name"]) || metaContent(html, ["og:title"]);
  if (!title) {
    const m = html.match(/<title[^>]*>([\s\S]{1,200}?)<\/title>/i);
    if (m) title = m[1];
  }
  title = decodeEntities(title).replace(/\s+/g, " ").trim();
  // 常见写法「文章名 - 站点名」，取最后一段更像站点名
  const parts = title.split(/\s+[|｜·—–-]\s+/);
  if (parts.length > 1 && parts[parts.length - 1].length >= 2) title = parts[parts.length - 1].trim();

  const description = decodeEntities(metaContent(html, ["description", "og:description"])).trim();

  let avatar = metaContent(html, ["og:image", "twitter:image"]) || linkHref(html, ["apple-touch-icon", "icon"]) || "";
  avatar = absolutize(avatar, finalUrl);

  // 可能的友链页：首页里链接文字/地址带「友链/友情链接/links/friends」的
  const anchorTags = html.match(/<a\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>[\s\S]{0,80}?<\/a>/gi) || [];
  const backlinks = [];
  for (const tag of anchorTags) {
    const href = (tag.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    // 只认地址里带 friend 的（/friends/、/friendlinks.html 这类）。
    // 光看链接文字容易把别的页面误判成友链页。
    if (/friend/i.test(href)) {
      const abs = absolutize(href, finalUrl);
      if (abs && backlinks.indexOf(abs) < 0) backlinks.push(abs);
    }
    if (backlinks.length >= 5) break;
  }

  return {
    ok: true,
    finalUrl: finalUrl,
    title: title.slice(0, 60),
    description: description.slice(0, 120),
    avatar: avatar,
    backlinks: backlinks,
  };
}

async function resolveToken(env) {
	if (env.APP_ID && env.APP_PRIVATE_KEY) return { token: await appToken(env), mode: "github-app" };
	if (env.GITHUB_TOKEN) return { token: env.GITHUB_TOKEN, mode: "pat" };
	return { token: "", mode: "none" };
}

async function gh(env, path, init) {
	const resolved = await resolveToken(env);
	if (!resolved.token) return new Response(JSON.stringify({ message: "no credential" }), { status: 503 });
	const base = {
	authorization: "Bearer " + resolved.token,
	accept: "application/vnd.github+json",
	"user-agent": "firefly-friends-apply",
	"x-github-api-version": "2022-11-28",
	};
	return fetch("https://api.github.com" + path, {
	method: (init && init.method) || "GET",
	body: init && init.body,
	headers: Object.assign(base, (init && init.headers) || {}),
	});
}

/** 字符串转 base64（按 UTF-8 字节，避免中文出错） */
function toBase64(text) {
	const bytes = new TextEncoder().encode(text);
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin);
}

const NL = String.fromCharCode(10);
const TAB = String.fromCharCode(9);

/** 取客户端 IP（Cloudflare 会带上真实来源） */
function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "unknown";
}

function rateConfig(env) {
  return {
    perIp: Number(env.RATE_PER_IP || 2),
    global: Number(env.RATE_GLOBAL || 20),
  };
}

/**
 * 读取当前计数（不写入）。只在「成功建出 PR」时才计数，
 * 这样字段填错、被校验拦下的提交不会白扣用户额度。
 */
async function rateRead(env, ip) {
  if (!env.RATE_LIMIT) return { ok: true, skipped: true, used: 0 };
  const cfg = rateConfig(env);
  const hour = Math.floor(Date.now() / 3600000);
  const [ipVal, gVal] = await Promise.all([
    env.RATE_LIMIT.get("ip:" + ip + ":" + hour),
    env.RATE_LIMIT.get("g:" + hour),
  ]);
  const usedIp = Number(ipVal || 0);
  const usedGlobal = Number(gVal || 0);
  if (usedIp >= cfg.perIp) {
    return { ok: false, error: "同一来源每小时最多提交 " + cfg.perIp + " 次，请过一会儿再试" };
  }
  if (usedGlobal >= cfg.global) {
    return { ok: false, error: "当前提交较多，请稍后再试" };
  }
  return { ok: true, used: usedIp, remaining: Math.max(0, cfg.perIp - usedIp) };
}

async function rateBump(env, ip) {
  if (!env.RATE_LIMIT) return;
  const cfg = rateConfig(env);
  const hour = Math.floor(Date.now() / 3600000);
  const ipKey = "ip:" + ip + ":" + hour;
  const gKey = "g:" + hour;
  const [ipVal, gVal] = await Promise.all([env.RATE_LIMIT.get(ipKey), env.RATE_LIMIT.get(gKey)]);
  await Promise.all([
    env.RATE_LIMIT.put(ipKey, String(Number(ipVal || 0) + 1), { expirationTtl: 3700 }),
    env.RATE_LIMIT.put(gKey, String(Number(gVal || 0) + 1), { expirationTtl: 3700 }),
  ]);
}

async function apply(request, env) {
	const ip = clientIp(request);
	const rate = await rateRead(env, ip);
	if (!rate.ok) return json({ error: rate.error }, 429);
	const credential = env.APP_ID && env.APP_PRIVATE_KEY ? "app" : env.GITHUB_TOKEN ? "pat" : "none";
	if (credential === "none") {
		return json({ error: "服务端尚未配置 GitHub 凭据（App 或 PAT），请联系站主" }, 503);
	}
	// 先读原文再解析：出错时能报出实际长度与原因（不回显内容）
	const raw = await request.text().catch(function () { return ""; });
	if (!raw) return json({ error: "请求体为空", length: 0 }, 400);
	let body;
	try {
		body = JSON.parse(raw);
	} catch (e) {
		return json({
			error: "请求体不是合法 JSON",
			detail: String((e && e.message) || e),
			length: raw.length,
		}, 400);
	}
	const checked = validate(body);
	if (checked.errors.length) {
		return json({ error: checked.errors.join("；"), errors: checked.errors }, 400);
	}
	const entry = checked.entry;
	const owner = env.OWNER;
	const repo = env.REPO;
	const base = env.BASE_BRANCH || "main";

	// 去重：与聚合产物比对，只花一次请求
	try {
		const raw = await gh(env, "/repos/" + owner + "/" + repo + "/contents/friends.json?ref=" + base, {
			headers: { accept: "application/vnd.github.raw" },
		});
		if (raw.ok) {
			const list = await raw.json();
			const mine = normalizeUrl(entry.url);
			const dup = list.find((x) => normalizeUrl(x.url) === mine);
			if (dup) return json({ error: "该站点已在友链列表中：" + dup.name }, 409);
		}
	} catch (e) {
		// 去重失败不阻塞提交
	}

	const slug = slugFromUrl(entry.url);
	const branch = "friend/" + slug;
	const filePath = "data/friends/" + slug + ".json";

	const refRes = await gh(env, "/repos/" + owner + "/" + repo + "/git/ref/heads/" + base);
	if (!refRes.ok) return json({ error: "读取仓库基线分支失败" }, 502);
	const baseSha = (await refRes.json()).object.sha;

	const mkRef = await gh(env, "/repos/" + owner + "/" + repo + "/git/refs", {
		method: "POST",
		body: JSON.stringify({ ref: "refs/heads/" + branch, sha: baseSha }),
	});
	if (!mkRef.ok) {
		const detail = await mkRef.text();
		if (mkRef.status === 422) {
			return json({ error: "你之前提交过同一个站点，等站主处理即可；如需重提交请联系站主" }, 409);
		}
		return json({ error: "创建分支失败", detail: detail.slice(0, 300) }, 502);
	}

	// 缩进用制表符，与仓库 Biome 格式一致
	const content = JSON.stringify(entry, null, TAB) + NL;
	const put = await gh(env, "/repos/" + owner + "/" + repo + "/contents/" + filePath, {
		method: "PUT",
		body: JSON.stringify({
			message: "feat(friends): 新增友链 " + entry.name,
			content: toBase64(content),
			branch: branch,
		}),
	});
	if (!put.ok) return json({ error: "写入条目失败", detail: (await put.text()).slice(0, 300) }, 502);

	const prBody = [
		"由友链页的「一键申请」自动提交。",
		"",
		"- 站点名：" + entry.name,
		"- 站点链接：" + entry.url,
		"- 头像：" + (entry.avatar || "（未填）"),
		"- 友链页：" + (entry.backlink || "（未填，将检查站点首页）"),
		"- 简介：" + (entry.description || "（未填）"),
		"",
		"机器人会自动校验字段、检查网站/头像可达性与反向链接，并在本 PR 上打标签。",
	].join(NL);

	const pr = await gh(env, "/repos/" + owner + "/" + repo + "/pulls", {
		method: "POST",
		body: JSON.stringify({ title: "友链申请：" + entry.name, head: branch, base: base, body: prBody }),
	});
	if (!pr.ok) return json({ error: "创建 PR 失败", detail: (await pr.text()).slice(0, 300) }, 502);
	const prJson = await pr.json();
	await rateBump(env, ip);
	return json({ ok: true, pr: prJson.html_url, number: prJson.number, file: filePath, remaining: Math.max(0, (rate.remaining || 0) - 1) });
}

export { pemToDer, b64url, signAppJwt, resolveToken, pkcs1ToPkcs8, appKeyDer };

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const origin = request.headers.get("origin") || "";
		const extra = corsHeaders(origin);
		const withCors = (res) => {
			const merged = new Headers(res.headers);
			for (const k of Object.keys(extra)) merged.set(k, extra[k]);
			return new Response(res.body, { status: res.status, headers: merged });
		};

		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: extra });
		}
		if (url.pathname === "/" || url.pathname === "/health") {
			return withCors(
				json({
					ok: true,
					service: "firefly-friends-apply",
					credential: env.APP_ID && env.APP_PRIVATE_KEY ? "github-app" : env.GITHUB_TOKEN ? "pat" : "missing",
				}),
			);
		}
    if (url.pathname === "/probe" && request.method === "GET") {
      const target = url.searchParams.get("url") || "";
      try {
        const r = await probeSite(target);
        return withCors(json(r, r.ok ? 200 : 400));
      } catch (e) {
        return withCors(json({ ok: false, error: "抓取失败：" + String((e && e.message) || e) }, 500));
      }
    }

		if (url.pathname === "/apply" && request.method === "POST") {
			try {
				return withCors(await apply(request, env));
			} catch (e) {
				return withCors(json({ error: "服务端异常", detail: String(e && e.message ? e.message : e).slice(0, 300) }, 500));
			}
		}
		return withCors(json({ error: "not found" }, 404));
	},
};