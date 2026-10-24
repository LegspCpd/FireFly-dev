# 自建评论系统：后端接入指南（COMMENT_API_BASE）

评论前端在 `src/components/comment/`（官网图标 + 自有样式，无 iframe、无第三方脚本），
客户端在 `src/utils/comment-api.ts`（**纯 fetch**）。本文只讲**后端怎么接**。

---

## 0. 为什么后端必须是「外部服务」

本站一套代码同时部署到 **Cloudflare Pages / Vercel / EdgeOne Pages**（见 [DEPLOY.md](./DEPLOY.md)），
而且三边都是**静态产物**。因此：

- ✗ `functions/api/**`（Cloudflare Pages Functions 的目录约定）**不能用** ——
  它只在 Cloudflare Pages 上执行，Vercel / EdgeOne 上根本不会跑。
- ✗ 依赖 Astro adapter 的 `src/pages/api/**.ts` 也不能当选型 ——
  EdgeOne 没有官方 adapter，动态接口要靠人工挂 Edge Function（`docs/edgeone-edge-function.js` 就是这么做的）。
- ✓ 正确做法：评论后端是**一个独立部署的 HTTP 服务**（任意平台 / 任意语言），
  三个平台的静态页面都通过同一个地址调它。地址由环境变量 `COMMENT_API_BASE` 注入。

代码里**不存在**任何 `functions/api/**` 评论绑定；评论相关改动只落在：

| 路径 | 作用 |
| --- | --- |
| `src/components/comment/EfComments.svelte` | 评论岛（表单 / 列表 / 演示态） |
| `src/components/comment/comment-labels.ts` | 组件文案（六语言，回退英文） |
| `src/components/comment/index.astro` | 挂载点（自建优先，可回落第三方） |
| `src/utils/comment-api.ts` | API 客户端（地址解析 + 归一化 + 错误收敛） |
| `src/config/commentConfig.ts` | `efCommentConfig`（开关 / 兜底地址 / path 前缀 / 长度上限） |

---

## 1. 三步接线

1. **选后端**：方案 A「自建 Worker」（推荐，见 §3）或方案 B「Supabase」（见 §4）。
2. **部署**，拿到根地址，例如 `https://comments.example.workers.dev`（**不要**带尾斜杠，代码会自己去掉）。
3. **在部署平台配环境变量并重新构建**（静态站的环境变量是**构建期**生效的，改了必须重新构建）。

### 变量名（二选一，都配则第一个优先）

| 变量 | 谁读 | 说明 |
| --- | --- | --- |
| `COMMENT_API_BASE` | 构建期的 Astro 层（`index.astro` 前言行） | 推荐。解析后作为 prop 传进评论岛，**不会**以字面量形式进客户端 bundle |
| `PUBLIC_COMMENT_API_BASE` | 构建期 + 浏览器运行时 | Astro/Vite 的公开变量，会被内联进客户端 JS；评论岛在运行时也读它做兜底 |

另有**运行时覆盖**（优先级最高，用于灰度或临时切换）：

```html
<script>window.__COMMENT_API_BASE__ = "https://comments.example.workers.dev"</script>
```

### 各平台在哪配

| 平台 | 位置 | 备注 |
| --- | --- | --- |
| Cloudflare Pages | Settings → Environment variables（Production **和** Preview 各配一遍） | 改完要 Retry deployment |
| Vercel | Project → Settings → Environment Variables | Preview 环境的域名每次部署都变，CORS 要一并放行 |
| EdgeOne Pages | 项目 → 环境变量 | 配完重新触发构建 |
| 本地开发 | 项目根目录 `.env`：`COMMENT_API_BASE=https://…` | `.env` 不要提交 |

> 解析优先级：`window.__COMMENT_API_BASE__` > `COMMENT_API_BASE` > `PUBLIC_COMMENT_API_BASE` > `src/config/commentConfig.ts` 里的 `efCommentConfig.apiBase`。

### 没配会怎样（演示态）

`COMMENT_API_BASE` 为空时，评论区**不会白屏、不会报错刷屏**，而是进入演示态：

- 顶部一条黄色标记提示条：「评论服务未配置 —— 当前为演示态……」；
- 表单照常可输入、可提交，提交结果作为带「预览」标记的条目出现在列表里（**仅本页内存，刷新即消失**）；
- 不发起任何请求，列表显示空态文案而不是错误；
- 配好变量重新构建后自动切换为正式提交，无需改代码。

---

## 2. 端点契约（客户端只认这一份）

`{base}` 就是 `COMMENT_API_BASE`。所有响应都应是 JSON，字符集 UTF-8。

### GET `{base}/comments?path={thread}`

```
GET {base}/comments?path=%2Fposts%2Fhello
```

`path` 是**线程键**：文章页为 `/posts/<slug>`，留言板 `/guestbook/`，友链 `/friends/`，
动态页 `/dynamic/`，赞助页 `/sponsor/`。可用 `efCommentConfig.pathPrefix` 加站点前缀。

200 响应（三种形状都认，推荐第一种）：

```json
{ "comments": [
  { "id": "12", "author": "Someone", "content": "第一条", "createdAt": "2026-10-25T05:00:00Z" }
] }
```

- 也可以是 `{ "data": [ … ] }` / `{ "items": [ … ] }` 或直接一个数组；
- 字段名容忍：`id | _id | key | uuid`、`author | nick | nickname | name | username`、
  `content | text | body | message`、`createdAt | created_at | created | time | date`；
- 没有正文的记录会被客户端丢掉（不会渲染出空评论）；
- `createdAt` 请给 **ISO 8601**（带 `Z` 或时区偏移）。给 `"2026-10-25 05:00:00"` 这种空格格式时，
  浏览器会按**本地时间**解析，时间显示会偏。

### POST `{base}/comments`

```json
{ "path": "/posts/hello", "author": "Someone", "content": "你好" }
```

- `author` 可为空/缺省，后端应自行回落成「匿名」；
- 成功状态码：`200` / `201` / `204` 都算成功。推荐返回创建后的实体：

```json
{ "comment": { "id": "13", "author": "Someone", "content": "你好", "createdAt": "2026-10-25T05:01:00Z" } }
```

  返回 `204`（空体）也可以用 —— 客户端会用本地回显兜底，界面不会看起来像失败。

### 错误

非 2xx 一律视为失败：界面出**一条**黄色错误条，**草稿保留**，可点「重试」。
状态码语义建议：`400` 参数不合法、`403` 被拦截（验证码 / 频率限制）、`429` 太频繁、`500` 服务端异常。
响应体里的短文本会折叠显示在错误条下方，方便排查。

### 客户端保证

- 请求超时 8 秒（AbortController），超时归为「超时」而不是崩溃；
- 任何异常都被收敛成结果对象，**不抛到界面**；
- 评论正文按**纯文本**渲染（`{text}` 插值，不做 `{@html}`），HTML 不会被执行；
- 头像不发起第三方图片请求（用首字母方块），避免把访客 IP 送给第三方；
- 列表 GET 带 `cache: "no-store"`，不会被 CDN 缓存住。

---

## 3. 方案 A：自建 Worker（推荐）

一个**独立**的 Worker（不是 Pages Functions），Cloudflare Workers / Deno Deploy / Vercel 都能跑，
因为它们都只提供「收到 Request 返回 Response」这一件事。下面这份是 Cloudflare Workers + D1 版。

### 3.1 建库

```bash
npx wrangler d1 create firefly-comments
```

建表（`npx wrangler d1 execute firefly-comments --remote --file=./schema.sql`）：

```sql
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  path       TEXT    NOT NULL,
  author     TEXT    NOT NULL DEFAULT '',
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS comments_path_id ON comments (path, id DESC);
```

### 3.2 Worker 本体（`src/index.js`）

```js
const MAX_CONTENT = 1000;
const MAX_AUTHOR = 40;
const PAGE_SIZE = 200;

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allow = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const matched = allow.includes(origin) ? origin : allow[0] || "";
  return {
    "Access-Control-Allow-Origin": matched,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const url = new URL(request.url);
    if (url.pathname !== "/comments") return json({ error: "not found" }, 404, headers);

    if (request.method === "GET") {
      const path = url.searchParams.get("path") || "";
      if (!path) return json({ error: "missing path" }, 400, headers);
      const { results } = await env.DB.prepare(
        `SELECT id, author, content,
                strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS createdAt
           FROM comments WHERE path = ?1 ORDER BY id DESC LIMIT ?2`
      )
        .bind(path, PAGE_SIZE)
        .all();
      return json({ comments: results ?? [] }, 200, headers);
    }

    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid json" }, 400, headers);
      }
      const path = String(body?.path ?? "").trim();
      const author = String(body?.author ?? "").trim().slice(0, MAX_AUTHOR);
      const content = String(body?.content ?? "").trim();
      if (!path) return json({ error: "missing path" }, 400, headers);
      if (!content) return json({ error: "empty content" }, 400, headers);
      if (content.length > MAX_CONTENT) return json({ error: "content too long" }, 400, headers);

      const inserted = await env.DB.prepare(
        "INSERT INTO comments (path, author, content) VALUES (?1, ?2, ?3) RETURNING id"
      )
        .bind(path, author, content)
        .first();

      const row = await env.DB.prepare(
        `SELECT id, author, content,
                strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS createdAt
           FROM comments WHERE id = ?1`
      )
        .bind(inserted.id)
        .first();

      return json({ comment: row }, 201, headers);
    }

    return json({ error: "method not allowed" }, 405, headers);
  },
};
```

### 3.3 `wrangler.toml`

```toml
name = "firefly-comments"
main = "src/index.js"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "firefly-comments"
database_id = "<wrangler d1 create 输出的 database_id>"

[vars]
# 允许的站点来源，逗号分隔（含自定义域名 + 各平台 Preview 域名）
ALLOWED_ORIGINS = "https://blog.example.com,https://your-project.pages.dev,https://your-project.vercel.app"
```

`npx wrangler deploy` 之后拿到的 `https://firefly-comments.<你的子域>.workers.dev` 就是 `COMMENT_API_BASE`。

> 换成 Vercel：把同一份 handler 放进 Vercel Function（Node/Edge 均可），
> 用 `@vercel/postgres` 或 Neon 代替 D1；换成 Deno Deploy：用 `Deno.serve` + Deno KV / Postgres。
> 契约不变，前端不用动。

---

## 4. 方案 B：Supabase

Supabase 的 PostgREST 原生形状和 §2 的契约不完全一样（需要 `apikey` 头、返回体是数组），
所以**推荐用 Edge Function 包一层**再作为 `COMMENT_API_BASE`；这样前端仍然只认一份契约。

### 4.1 建表 SQL（Supabase SQL Editor 直接跑）

```sql
create table if not exists public.comments (
  id         bigint generated by default as identity primary key,
  path       text not null,
  author     text not null default '',
  content    text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists comments_path_created_idx
  on public.comments (path, created_at desc);

alter table public.comments enable row level security;

-- 任何人可读
drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments
  for select using (true);

-- 任何人可写，但内容必须合法；不含 update / delete 策略 = 不允许改删
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to anon
  with check (
    char_length(content) between 1 and 1000
    and char_length(author) <= 40
  );

grant select, insert on public.comments to anon;
grant usage, select on sequence public.comments_id_seq to anon;
```

### 4.2 Edge Function（`supabase/functions/comments/index.ts`）

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*", // 生产建议改成自己的域名
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });

const FIELDS = "id,author,content,createdAt:created_at";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // service_role 只在服务端使用，绝不能出现在前端
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);

  if (req.method === "GET") {
    const path = url.searchParams.get("path") ?? "";
    if (!path) return json({ error: "missing path" }, 400);
    const { data, error } = await supabase
      .from("comments")
      .select(FIELDS)
      .eq("path", path)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return json({ error: error.message }, 500);
    return json({ comments: data ?? [] });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    const path = String(body?.path ?? "").trim();
    const author = String(body?.author ?? "").trim().slice(0, 40);
    const content = String(body?.content ?? "").trim();
    if (!path) return json({ error: "missing path" }, 400);
    if (!content) return json({ error: "empty content" }, 400);
    if (content.length > 1000) return json({ error: "content too long" }, 400);

    const { data, error } = await supabase
      .from("comments")
      .insert({ path, author, content })
      .select(FIELDS)
      .single();
    if (error) return json({ error: error.message }, 500);
    return json({ comment: data }, 201);
  }

  return json({ error: "not found" }, 404);
});
```

部署后地址形如 `https://<project-ref>.supabase.co/functions/v1/comments`，
把它填进 `COMMENT_API_BASE` 即可。

---

## 5. 方案 C：Neon Data API（本站当前选用的落地）

Neon 托管的 PostgREST 风格 REST 端点，**同样不需要自建服务端**：静态站直接 fetch
`https://<endpoint-id>.apirest.<region>.aws.neon.tech/<database>/rest/v1`。
没有 `Authorization` 头的请求会被网关切到数据库里的 `anonymous` 角色，
能不能读、能写什么，全由 `GRANT` + RLS 决定（前端零密钥）。

- 建表 SQL、控制台开启步骤、公开 URL、排查表：见 [neon-data-api.md](./neon-data-api.md)
- 客户端不用改：`src/utils/comment-api.ts` 发现地址以 `/rest/v1` 结尾会自动切到
  PostgREST 方言（`?select=…&path=eq.…&status=eq.visible`、
  `Prefer: return=representation`、字段名 `nickname`），
  归一化与错误收敛与 §2 完全一致；地址为空时仍是演示态。

## 6. 验证

```bash
# 1) 读
curl -s "https://comments.example.workers.dev/comments?path=/posts/hello"

# 2) 写
curl -s -X POST "https://comments.example.workers.dev/comments" \
  -H "Content-Type: application/json" \
  -d '{"path":"/posts/hello","author":"tester","content":"第一条测试"}'

# 3) 看 CORS 头（浏览器跨域，必须带 Access-Control-Allow-Origin）
curl -s -D - -o /dev/null -X OPTIONS "https://comments.example.workers.dev/comments" \
  -H "Origin: https://blog.example.com" \
  -H "Access-Control-Request-Method: POST"
```

然后在站点上确认：文章页/留言板评论区出现表单与列表；断网或把地址改错时，只出现一条错误条 + 重试按钮。
本地自测可以先不配变量，直接看演示态。

---

## 7. 排查清单

| 现象 | 多半是 |
| --- | --- |
| 控制台报 CORS 错误 | 后端没回 `Access-Control-Allow-Origin`，或没处理 `OPTIONS` 预检；Vercel Preview 域名每次部署都变，要一起放行 |
| 一直是演示态 | 变量配在了「运行时」而不是构建期；静态站要**重新构建**才生效 |
| 时间显示偏 | `createdAt` 不是 ISO 8601（缺 `Z` / 时区），浏览器按本地时间解析 |
| 提交成功但列表看不到 | 后端没把新评论返回成 `{comment:{…}}`，且 GET 也没带上新记录 |
| 列表报 500 | 看错误条下方折叠的短文本；通常是建表少列 / 缺索引 / 绑定错数据库 |
| EdgeOne 上 403 | 那台 Edge Function 的触发规则或 WAF 挡了 `/comments` |

## 8. 反垃圾（按需加，都属于后端职责）

- **长度与频率**：`content ≤ 1000`、`author ≤ 40`，同 IP 每分钟 N 条（Workers KV / D1 计数都行）；
- **验证码**：honeypot 字段或 Cloudflare Turnstile，token 在后端校验；
- **只读不需要密钥**：读接口别要求密钥，写接口的密钥**只能放后端**，永远不要塞进前端配置；
- **不在前端做净化**：前端按纯文本渲染，净化与审核都放后端 / 数据库约束里。
