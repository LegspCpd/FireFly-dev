# 评论系统：数据库侧的限流、举报与审核（以及限流的真实局限）

> 配套阅读：[neon-data-api.md](./neon-data-api.md)（表结构 / RLS / Data API 接线）、
> [comment-api.md](./comment-api.md)（端点契约）。
> 本文只讲**数据库侧**新增的东西：限流、举报、审核流转、分页索引、楼中楼约束。
>
> 一句话结论先放这里：**这套限流是「尽力而为」的，不是安全边界。**
> 真正的 IP 限流必须在接入层（CDN / WAF / 反代）做，Neon Data API 给不了。

---

## 0. 先明确一件事：Data API 没有客户端 IP

评论后端不是自建服务，是浏览器**直接 fetch** Neon 的 PostgREST 风格端点
（见 [comment-api.md §5](./comment-api.md)）。请求从浏览器直达 Neon，
中间**没有**任何一段代码是我们能插钩子的。

Data API 会把一部分请求上下文塞进 PostgreSQL 的 GUC 里，实测（2026-10-25）可用的是：

| GUC | 内容 |
| --- | --- |
| `request.headers` | 整个请求头的 JSON（`authorization` / `user-agent` / `content-type` / `prefer` …） |
| `request.method` | `POST` |
| `request.path` | `/neondb/rest/v1/comments?select=…` |
| `request.jwt.claims` | 匿名 JWT 的 claims（`role=anonymous`，`sub=anonymous`） |

**里面没有任何真实客户端 IP**：`x-forwarded-for` 不在，`user-agent` 是所有访客共享的字符串。
所以数据库层**拿不到可信来源标识**，只能退而求其次。

### 采用的方案：请求头 `x-client-key`（主）+ `comments.ip_hash` 列（兜底 / 审计）

前端自己算一个**加盐哈希**（浏览器指纹、localStorage 随机 id 都行，只要是稳定的不透明字符串），
放在请求头里：

```
POST /neondb/rest/v1/comments
Authorization: Bearer <匿名 JWT>
x-client-key: 3f9c1a...(≤64 字符，前端自己生成)
Content-Type: application/json
```

触发器里的取值顺序（`public.comment_client_key()`）：

1. 请求头 `x-client-key`（从 `current_setting('request.headers')::jsonb` 读）；
2. 请求体里的 `ip_hash` 字段（列级授权允许匿名写，作为兜底）；
3. 都没有 → `~unkeyed`（只受全站阀门约束）。

解析出的键会被写回 `comments.ip_hash`（审计用，方便事后查「这条是谁灌的」）。

> **为什么两者都要**：一开始只做请求头、把列删掉，结果 Neon Data API 的 schema cache
> 里还记着 `ip_hash`，于是 `select=*` 直接报
> `42703 column comments.ip_hash does not exist` —— 删列等于把一个能用的接口弄坏。
> 把列留下，接口形状与变更前**完全一致**。

### ⚠️ `ip_hash` 对匿名端是**可读**的

匿名角色在 `comments` 上是**表级 `SELECT`**，所以 `select=*` 和 `select=ip_hash`
都会把这一列读出去。这是有意的取舍：

- 如果把表级 `SELECT` 拆成列级授权来藏住它，`select=*` 会立刻变成 403（实测），
  而前端与调试脚本都在用 `select=*`；
- 因此**前端必须传加盐哈希，绝不能传原始标识**（邮箱、设备 id、明文 IP 都不行）。
  泄漏的后果只是「同一访客的评论可以被关联」，不会暴露身份。

---

## 1. 数据库侧新增了什么

全部语句见 §7「可直接执行的 SQL」。对象清单：

| 对象 | 类型 | 作用 |
| --- | --- | --- |
| `comments.ip_hash` | 列 | 非权威客户端键（加盐哈希），限流兜底 + 审计 |
| `public.comment_rate_limit` | 表 | 限流桶（分钟粒度），`pk(ip_hash, window_start)` |
| `public.comment_reports` | 表 | 举报记录，匿名只能 `INSERT`，读不回来 |
| `public.comment_client_key(text)` | 函数 | 头 → 列 → `~unkeyed` 的取值顺序 |
| `public.comments_before_insert()` | 触发器函数 | 楼中楼同帖校验 + 10 分钟重复抑制 + 限流 |
| `public.comment_reports_before_insert()` | 触发器函数 | 举报限流 + 同一条 24h 内不重复举报 |
| `public.comment_set_status(bigint, text)` | 函数 | owner 审核流转（四种状态，带校验） |
| `public.comment_rate_limit_prune(interval)` | 函数 | 清理限流桶 |
| `comments_path_created_id_idx` | 索引 | `(path, created_at DESC, id DESC)`，支撑 keyset 分页 |

原有的列、约束、RLS 策略、`website` 列级授权全部保持不变；
唯一的表结构变更就是新增的 `ip_hash` 列（带 `DEFAULT ''`，老行不受影响）。

---

## 2. 限流：配额、理由、以及它为什么不可靠

### 2.1 配额

| 维度 | 值 | 常量（在 `comments_before_insert()` 里） |
| --- | --- | --- |
| 每客户端 / 60 秒 | **3 条** | `c_minute_limit` |
| 每客户端 / 24 小时 | **30 条** | `c_day_limit` |
| 全站 / 60 秒 | **60 条** | `c_flood_limit` |
| 重复抑制 | 同 `path+nickname+content` 10 分钟内只收 1 条 | `c_dup_window` |
| 举报 / 每客户端 / 1 小时 | 10 条 | `comment_reports_before_insert()` 的 `c_hour_limit` |
| 举报去重 | 同一条评论 + 同一客户端 24 小时内只能举报一次 | 同上 |

### 2.2 为什么是这几个数

- **1 分钟 3 条**：正常读者在一篇文章下连着写三条已经很话痨了；再多基本是脚本。
  阈值取小能挡住「一次性灌 100 条」，同时不会误伤正常对话。
  代价是**同一分钟内第四次提交会失败**，前端应提示「稍后再试」而不是「内容有问题」。
- **24 小时 30 条**：给「一个下午泡在博客里、每条都认真写」的重度读者留足余量，
  同时把单日刷屏的上限压到两位数。
- **全站 60 条/分钟**：这是**不依赖任何客户端键**的硬阀门。
  它存在的唯一理由是：`x-client-key` 可以随便换，换一次就是一个新配额；
  全站阀门至少能保证「整站被灌爆」这件事有个上限，代价是**极端情况下会误伤正常访客**。
  60 这个数远高于本站真实流量（历史峰值个位数/分钟），正常使用碰不到。
- **10 分钟重复抑制**：挡住「网络抖动导致前端重试两次」和「按住回车」这两类最常见的重复。
  只比对 `path+nickname+content`，换任何一个字段就能发出去 —— 它防的是**事故**，不是**恶意**。
- **举报 10 条/小时 + 24 小时去重**：举报是匿名的，没有这个限制一个人就能把同一篇文章
  的所有评论刷成「已举报」，把 owner 的管理界面淹掉。

### 2.3 这套限流**挡不住**什么（必读）

| 绕过方式 | 为什么挡不住 |
| --- | --- |
| 换 `x-client-key` | 它就是前端自己生成的一个字符串，攻击者随便改。改一次 = 一份新配额 |
| 不传 `x-client-key` | 落到 `~unkeyed` 桶，只受全站 60/分钟阀门约束 |
| 并发打 | 桶是 `INSERT ... ON CONFLICT DO UPDATE`，**同一键**并发会串行化，打不穿；但**换键并发**照样能打 |
| 清 cookie / 换浏览器 | 指纹哈希变了就是新客户端 |
| 伪造别人的 key | 能让别人被限流（「陷害式」限流），这是设计上的固有缺陷 |
| 直连 Data API 绕过 CDN | Data API 端点本身就是公开的，CDN 规则拦不住这条路径 |

**一句话**：这层限流的作用是**抬高脚本刷评论的成本、挡住误触与重试**，
让「一个人手动灌满一篇文章」变得很烦。它**不是**安全边界。

### 2.4 真正可靠的限流要放在哪

| 位置 | 能拿到什么 | 可行性 |
| --- | --- | --- |
| **Cloudflare / Vercel / EdgeOne 的 WAF / Rate Limiting 规则** | 真实客户端 IP、ASN、TLS 指纹 | ✅ 推荐。三个平台都有免费额度的速率限制规则，按 IP 计数即可 |
| **自建反代 / Worker** | 真实 IP（`CF-Connecting-IP` 等） | ✅ 但要把评论后端从 Data API 换回自建服务 |
| **Neon Data API** | 只有 `request.headers`，**没有 IP** | ❌ 结构上做不到 |

如果以后要「真的可靠」：在 CDN 侧对 `POST /rest/v1/comments` 加一条
「同 IP 每分钟 ≤ N 次」的规则，数据库这层降级为**兜底**。
两层都留着才是完整方案 —— 注意 CDN 规则只能拦「经 CDN 的流量」，
数据库触发器拦的是「所有能连 Data API 的流量」，两者互补。

### 2.5 客户端会收到什么错误

PostgREST 认 `PT<status>` 形式的自定义 SQLSTATE，把它映射成对应 HTTP 状态码
（实测 `PT429 → 429`、`PT409 → 409`）。所以触发器里用的是：

| SQLSTATE | HTTP | `details` | 含义 |
| --- | --- | --- | --- |
| `PT429` | **429** | `comment_rate_limit_minute` | 1 分钟配额用尽 |
| `PT429` | **429** | `comment_rate_limit_day` | 24 小时配额用尽 |
| `PT429` | **429** | `comment_rate_limit_global` | 全站阀门 |
| `PT409` | **409** | `comment_duplicate` | 10 分钟内重复内容 |
| `23503` | 409 | `comment_parent_missing` | `parent_id` 指向不存在的评论 |
| `23514` | 400 | `comment_parent_cross_thread` | `parent_id` 属于另一个 `path` |
| `PT409` | 409 | `comment_report_duplicate` | 24 小时内重复举报同一条 |
| `PT429` | 429 | `comment_report_rate_limit` | 举报太频繁 |

响应体形如：

```json
{
  "code": "PT429",
  "message": "rate limit exceeded: at most 3 comments per minute",
  "details": "comment_rate_limit_minute",
  "hint": "retry in 9s"
}
```

前端 `src/utils/comment-api.ts` 会把非 2xx 收敛成一条错误条（草稿保留、可重试），
`details` 可以直接用来区分「太频繁」和「内容不合法」。
**注意**：`details` 是给程序看的稳定标识，`message` 可能随版本变化，不要匹配 `message`。

---

## 3. 举报

### 3.1 谁能做什么

| 角色 | `comment_reports` |
| --- | --- |
| `anonymous`（浏览器） | 只能 `INSERT` 三个业务列（`comment_id` / `reason` / `ip_hash`），**没有任何 `SELECT`** |
| `neondb_owner`（只有 owner 直连时用） | 全部权限 |

匿名端**读不回来**是故意的：举报列表是管理数据，不能让人枚举「谁举报了谁」。
实测匿名 `GET /comment_reports` → `403 permission denied for table comment_reports`。

RLS 的 `WITH CHECK` 要求：

- `comment_id > 0`
- `btrim(reason)` 长度 1–200
- `ip_hash` 长度 ≤ 64

`comment_id` 必须真实存在由 **外键**（`REFERENCES public.comments(id) ON DELETE CASCADE`）保证，
指向不存在的评论会拿到 `409 / 23503`。

### 3.2 举报限流（触发器）

`comment_reports_before_insert()` 做三件事：

1. 用 `comment_client_key()` 补齐 `ip_hash`（客户端没传时从 `x-client-key` 取）；
2. 同一 `comment_id` + 同一客户端 24 小时内重复举报 → `PT409 / comment_report_duplicate`；
3. 同一客户端 1 小时内超过 10 条 → `PT429 / comment_report_rate_limit`。

没有客户端键（`~unkeyed`）时只做外键与 RLS 校验，不做频率限制。

### 3.3 owner 怎么看待处理的举报

```sql
-- 最近 7 天的举报，按评论聚合
SELECT r.comment_id,
       count(*)                        AS reports,
       min(r.created_at)               AS first_report,
       max(r.created_at)               AS last_report,
       (array_agg(r.reason ORDER BY r.created_at DESC))[1] AS latest_reason
  FROM public.comment_reports r
 WHERE r.created_at > now() - interval '7 days'
 GROUP BY r.comment_id
 ORDER BY reports DESC, last_report DESC;
```

处理完一条之后，把该评论设成 `hidden`，再决定举报留不留：

```sql
SELECT public.comment_set_status(123, 'hidden');            -- 先下架
DELETE FROM public.comment_reports WHERE comment_id = 123;  -- 再清举报
```

---

## 4. 审核流转（status 四种值）

`status` 的取值域由 `comments_status_enum` 约束锁死：
`visible` / `pending` / `hidden` / `spam`。

| 值 | 匿名可见 | 含义 |
| --- | --- | --- |
| `visible` | ✅ | 正常展示（匿名端只能插这个值） |
| `pending` | ❌ | 待审。匿名端**也插不进去**（RLS 只放行 `visible`），只有 owner 能设 |
| `hidden` | ❌ | 已下架（保留数据） |
| `spam` | ❌ | 判定为垃圾（留着做样本） |

> 想让「新评论先待审」，需要把 `comments_insert_anon` 策略的 `status = 'visible'`
> 改成 `status = 'pending'`，同时前端要能提示「已提交，等待审核」。
> **当前是直接可见**，不要以为已经有审核队列。

owner 用带校验的函数改状态（四种值都认，非法值直接报错）：

```sql
SELECT public.comment_set_status(123, 'visible');
SELECT public.comment_set_status(123, 'pending');
SELECT public.comment_set_status(123, 'hidden');
SELECT public.comment_set_status(123, 'spam');

-- 等价的原生 UPDATE（owner 直连时也能直接跑，函数只是多了校验与返回值）
UPDATE public.comments SET status = 'hidden' WHERE id = 123;
```

匿名端**永远**改不了 `status`：`comments` 上没有任何 `UPDATE` 策略，
也没有给 `anonymous` 授予 `UPDATE`。实测：

- 插入时写 `status='hidden' / 'pending' / 'spam'` → `403 / 42501`（RLS）
- `PATCH /comments?id=eq.N` → `403 permission denied for table comments`
- `DELETE /comments` → `403 permission denied for table comments`

**删除不开放给匿名**，保持现状：只有 owner 直连（或 SQL Editor）能删。

---

## 5. 分页、楼中楼、website

### 5.1 分页：keyset

排序键是 `(created_at DESC, id DESC)`。`created_at` 在批量插入时可能重复，
必须带上 `id` 做 tiebreaker，否则会漏行/重复行。

索引：

```sql
CREATE INDEX comments_path_created_id_idx
  ON public.comments (path, created_at DESC, id DESC);
```

> 旧的 `(path, created_at DESC)` 二列索引已经 `DROP` —— 三列索引的最左前缀完全覆盖它，
> 留着只是多一份写放大。

Data API 上的翻页写法（用 `or=` 表达行值比较）：

```
GET /comments?select=id,created_at,content
    &path=eq./posts/hello
    &status=eq.visible
    &order=created_at.desc,id.desc
    &limit=20
    &or=(created_at.lt.<上一页最后一条的 created_at>,
         and(created_at.eq.<同一 created_at>,id.lt.<同一 id>))
```

PostgREST 没有原生的 `(created_at, id) < (?, ?)` 行值语法，所以拆成
「时间更早」或「时间相同但 id 更小」两支。实测三页翻完 7 条、无重复无遗漏（见 §8）。

### 5.2 楼中楼

`parent_id` 原本就有 `REFERENCES public.comments(id) ON DELETE CASCADE`，
删父评论会连子评论一起删。

触发器 `comments_before_insert()` 额外保证**父评论必须同 `path`**：

- `parent_id` 指向不存在的行 → `409 / comment_parent_missing`
- `parent_id` 属于另一个 `path` → `400 / comment_parent_cross_thread`

没有这条约束，任何人可以把 A 文章的评论挂到 B 文章下面，做出「跨帖串楼」。

### 5.3 `website` 列

列存在（`text NOT NULL DEFAULT ''`，长度 ≤ 200），
并且**在匿名端的列级 `INSERT` 授权里**
（`path / nickname / website / content / status / parent_id / ip_hash`），前端可以直接写。
**本次没有改它。**

---

## 6. Neon Data API 的 schema cache（踩过的坑）

Data API 会缓存数据库 schema，**新建的表 / 新加的列不会立刻生效**：

```json
{"code":"PGRST205","message":"Could not find the table 'public.comment_reports' in the schema cache"}
```

反过来，**删列也会立刻出事**：缓存里还记着 `ip_hash`，于是 `select=*` 报

```json
{"code":"42703","message":"column comments.ip_hash does not exist"}
```

刷新只有两条路（Neon 文档 *Data API → Troubleshooting → New table not found*）：

1. 控制台 **Postgres database → Data API → Refresh schema cache**；
2. `PATCH https://console.neon.tech/api/v2/projects/{project_id}/branches/{branch_id}/data-api/{database}`
   （要 `NEON_API_KEY`，空 body 即可）。

**`NOTIFY pgrst, 'reload schema'` 只能算「催促」，不是可靠手段。**
实测：同一条 NOTIFY 之后，新表/新列在十几分钟内**时好时坏**（不同实例的缓存不同步），
稳定下来之前别指望它。结论：**每次改 schema 都去控制台点一次刷新**，并写进变更流程。

判断某个实例的缓存到哪一步：

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "$API/comment_reports?select=id&limit=1" -H "Authorization: Bearer $T"
# 403 = 表已在缓存里，只是匿名没权限（正常）
# 404 PGRST205 = 缓存还没刷新
```

---

## 7. 可直接执行的 SQL

整段可重复执行（`IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP ... IF EXISTS`）。
执行方式：Neon 控制台 SQL Editor，或 owner 直连
（连接串只走环境变量 `EF_OWNER_DSN`，**不要**写进仓库、不要打印）。

```sql
-- ===========================================================================
-- A. 非权威客户端键列（限流兜底 + 审计）
-- ===========================================================================
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS ip_hash text NOT NULL DEFAULT '';

ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_ip_hash_len;
ALTER TABLE public.comments
  ADD CONSTRAINT comments_ip_hash_len
  CHECK (char_length(ip_hash) <= 64 AND ip_hash !~ '[[:cntrl:]]');

GRANT INSERT (ip_hash) ON public.comments TO anonymous;

COMMENT ON COLUMN public.comments.ip_hash IS
  '非权威客户端键（加盐哈希），仅用于限流与审计；匿名端可读，禁止放原始标识';

-- ===========================================================================
-- B. 限流桶（分钟桶；24h 配额 = 最近 1440 个桶求和）
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.comment_rate_limit (
  ip_hash      text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  first_seen   timestamptz NOT NULL DEFAULT now(),
  last_seen    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comment_rate_limit_pkey     PRIMARY KEY (ip_hash, window_start),
  CONSTRAINT comment_rate_limit_count_ok CHECK (count >= 0)
);

CREATE INDEX IF NOT EXISTS comment_rate_limit_window_idx
  ON public.comment_rate_limit (window_start);

ALTER TABLE public.comment_rate_limit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comment_rate_limit FROM PUBLIC, authenticated;

-- ===========================================================================
-- C. 举报表：匿名只能 INSERT，读不回来
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.comment_reports (
  id         bigint      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  comment_id bigint      NOT NULL REFERENCES public.comments (id) ON DELETE CASCADE,
  reason     text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ip_hash    text        NOT NULL DEFAULT '',
  CONSTRAINT comment_reports_reason_len CHECK (char_length(btrim(reason)) BETWEEN 1 AND 200),
  CONSTRAINT comment_reports_ip_len     CHECK (char_length(ip_hash) <= 64)
);

CREATE INDEX IF NOT EXISTS comment_reports_comment_idx
  ON public.comment_reports (comment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comment_reports_created_idx
  ON public.comment_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS comment_reports_ip_idx
  ON public.comment_reports (ip_hash, created_at DESC);

ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comment_reports FROM PUBLIC, authenticated;

DROP POLICY IF EXISTS comment_reports_insert_anon ON public.comment_reports;
CREATE POLICY comment_reports_insert_anon ON public.comment_reports
  FOR INSERT TO anonymous
  WITH CHECK (
    comment_id > 0
    AND char_length(btrim(reason)) BETWEEN 1 AND 200
    AND char_length(ip_hash) <= 64
  );

GRANT INSERT (comment_id, reason, ip_hash) ON public.comment_reports TO anonymous;
GRANT USAGE, SELECT ON SEQUENCE public.comment_reports_id_seq TO anonymous;

-- ===========================================================================
-- D. 客户端键：请求头 > 请求体列 > ~unkeyed
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.comment_client_key(p_fallback text DEFAULT '')
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  v_headers text;
  v_raw     text;
BEGIN
  v_raw := nullif(btrim(coalesce(p_fallback, '')), '');
  BEGIN
    v_headers := current_setting('request.headers', true);
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;
  IF v_raw IS NULL AND v_headers IS NOT NULL AND btrim(v_headers) <> '' THEN
    BEGIN
      v_raw := nullif(btrim(v_headers::jsonb ->> 'x-client-key'), '');
    EXCEPTION WHEN OTHERS THEN
      v_raw := NULL;
    END;
  END IF;
  IF v_raw IS NULL THEN
    RETURN '~unkeyed';
  END IF;
  IF char_length(v_raw) > 64 OR v_raw ~ '[[:cntrl:]]' THEN
    RETURN '~unkeyed';
  END IF;
  RETURN lower(v_raw);
END;
$fn$;

REVOKE ALL ON FUNCTION public.comment_client_key(text) FROM PUBLIC;

-- ===========================================================================
-- E. comments BEFORE INSERT：楼中楼同帖 / 重复抑制 / 限流
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.comments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  c_minute_limit CONSTANT integer  := 3;      -- 每客户端 / 60s
  c_day_limit    CONSTANT integer  := 30;     -- 每客户端 / 24h
  c_flood_limit  CONSTANT integer  := 60;     -- 全站 / 60s
  c_dup_window   CONSTANT interval := interval '10 minutes';
  v_key        text;
  v_keyed      boolean;
  v_minute     timestamptz;
  v_min_count  integer;
  v_day_count  integer;
  v_flood      integer;
  v_parent_path text;
BEGIN
  -- E1. 楼中楼：父评论必须存在且同 path
  IF NEW.parent_id IS NOT NULL THEN
    SELECT c.path INTO v_parent_path FROM public.comments c WHERE c.id = NEW.parent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'parent comment % does not exist', NEW.parent_id
        USING ERRCODE = '23503',
              DETAIL  = 'comment_parent_missing',
              HINT    = 'parent_id must reference an existing comment';
    END IF;
    IF v_parent_path IS DISTINCT FROM NEW.path THEN
      RAISE EXCEPTION 'parent comment % belongs to another thread', NEW.parent_id
        USING ERRCODE = '23514',
              DETAIL  = 'comment_parent_cross_thread',
              HINT    = 'parent_id must point to a comment on the same path';
    END IF;
  END IF;

  -- E2. 重复抑制
  IF EXISTS (
    SELECT 1 FROM public.comments c
     WHERE c.path      = NEW.path
       AND c.nickname  = NEW.nickname
       AND c.content   = NEW.content
       AND c.created_at > now() - c_dup_window
  ) THEN
    RAISE EXCEPTION 'duplicate comment'
      USING ERRCODE = 'PT409',
            DETAIL  = 'comment_duplicate',
            HINT    = 'identical path+nickname+content already posted within 10 minutes';
  END IF;

  -- E3. 限流
  v_key    := public.comment_client_key(NEW.ip_hash);
  v_keyed  := v_key <> '~unkeyed';
  NEW.ip_hash := CASE WHEN v_keyed THEN v_key ELSE '' END;
  v_minute := date_trunc('minute', now());

  INSERT INTO public.comment_rate_limit AS rl (ip_hash, window_start, count)
  VALUES (v_key, v_minute, 1)
  ON CONFLICT (ip_hash, window_start)
    DO UPDATE SET count = rl.count + 1, last_seen = now()
  RETURNING rl.count INTO v_min_count;

  IF v_keyed THEN
    IF v_min_count > c_minute_limit THEN
      RAISE EXCEPTION 'rate limit exceeded: at most % comments per minute', c_minute_limit
        USING ERRCODE = 'PT429',
              DETAIL  = 'comment_rate_limit_minute',
              HINT    = format('retry in %ss', 60 - floor(extract(second from now()))::int);
    END IF;

    SELECT coalesce(sum(rl.count), 0)::integer INTO v_day_count
      FROM public.comment_rate_limit rl
     WHERE rl.ip_hash = v_key
       AND rl.window_start > v_minute - interval '24 hours';

    IF v_day_count > c_day_limit THEN
      RAISE EXCEPTION 'rate limit exceeded: at most % comments per 24h', c_day_limit
        USING ERRCODE = 'PT429',
              DETAIL  = 'comment_rate_limit_day',
              HINT    = 'daily quota exhausted for this client';
    END IF;
  END IF;

  SELECT coalesce(sum(rl.count), 0)::integer INTO v_flood
    FROM public.comment_rate_limit rl
   WHERE rl.window_start >= now() - interval '1 minute';

  IF v_flood > c_flood_limit THEN
    RAISE EXCEPTION 'rate limit exceeded: site-wide flood valve (%/min)', c_flood_limit
      USING ERRCODE = 'PT429',
            DETAIL  = 'comment_rate_limit_global',
            HINT    = 'too many comments in the last 60 seconds across all clients';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS comments_before_insert_trg ON public.comments;
CREATE TRIGGER comments_before_insert_trg
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.comments_before_insert();

REVOKE ALL ON FUNCTION public.comments_before_insert() FROM PUBLIC;

-- ===========================================================================
-- F. comment_reports BEFORE INSERT：补齐键 + 举报限流 + 去重
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.comment_reports_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  c_hour_limit CONSTANT integer := 10;
  v_key     text;
  v_keyed   boolean;
  v_in_hour integer;
BEGIN
  v_key   := public.comment_client_key(NEW.ip_hash);
  v_keyed := v_key <> '~unkeyed';
  NEW.ip_hash := CASE WHEN v_keyed THEN v_key ELSE '' END;

  IF NOT v_keyed THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.comment_reports r
     WHERE r.comment_id = NEW.comment_id
       AND r.ip_hash    = v_key
       AND r.created_at > now() - interval '24 hours'
  ) THEN
    RAISE EXCEPTION 'already reported'
      USING ERRCODE = 'PT409',
            DETAIL  = 'comment_report_duplicate',
            HINT    = 'this client already reported this comment within 24 hours';
  END IF;

  SELECT count(*)::integer INTO v_in_hour
    FROM public.comment_reports r
   WHERE r.ip_hash = v_key
     AND r.created_at > now() - interval '1 hour';

  IF v_in_hour >= c_hour_limit THEN
    RAISE EXCEPTION 'rate limit exceeded: at most % reports per hour', c_hour_limit
      USING ERRCODE = 'PT429',
            DETAIL  = 'comment_report_rate_limit',
            HINT    = 'too many reports from this client in the last hour';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS comment_reports_before_insert_trg ON public.comment_reports;
CREATE TRIGGER comment_reports_before_insert_trg
  BEFORE INSERT ON public.comment_reports
  FOR EACH ROW EXECUTE FUNCTION public.comment_reports_before_insert();

REVOKE ALL ON FUNCTION public.comment_reports_before_insert() FROM PUBLIC;

-- ===========================================================================
-- G. 分页索引（替换旧的二列索引）
-- ===========================================================================
CREATE INDEX IF NOT EXISTS comments_path_created_id_idx
  ON public.comments (path, created_at DESC, id DESC);
DROP INDEX IF EXISTS public.comments_path_created_idx;

-- ===========================================================================
-- H. 审核流转
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.comment_set_status(p_id bigint, p_status text)
RETURNS public.comments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_row public.comments;
BEGIN
  IF p_status NOT IN ('visible', 'pending', 'hidden', 'spam') THEN
    RAISE EXCEPTION 'invalid status %', p_status
      USING ERRCODE = '23514',
            HINT    = 'status must be one of visible / pending / hidden / spam';
  END IF;
  UPDATE public.comments SET status = p_status WHERE id = p_id RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment % not found', p_id USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$fn$;

REVOKE ALL ON FUNCTION public.comment_set_status(bigint, text) FROM PUBLIC;

-- ===========================================================================
-- I. 维护：清理限流桶
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.comment_rate_limit_prune(p_keep interval DEFAULT interval '48 hours')
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.comment_rate_limit WHERE window_start < now() - p_keep;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.comment_rate_limit_prune(interval) FROM PUBLIC;
```

执行完记得去控制台点一次 **Refresh schema cache**（见 §6）。

### 7.1 日常维护

```sql
-- 限流桶会持续增长（每个客户端每分钟一行）。每天清一次两天前的桶即可。
SELECT public.comment_rate_limit_prune();            -- 默认保留 48 小时
SELECT public.comment_rate_limit_prune('7 days');    -- 想留久一点做取证

-- 当前 24h 内最活跃的客户端（排查灌水）
SELECT ip_hash, sum(count) AS n_24h
  FROM public.comment_rate_limit
 WHERE window_start > now() - interval '24 hours'
 GROUP BY ip_hash
 ORDER BY n_24h DESC
 LIMIT 20;
```

Neon 上可以装 `pg_cron` 定时跑 `SELECT public.comment_rate_limit_prune();`；
不装的话手动/脚本每天跑一次也够（表很小）。

---

## 8. 验证记录（2026-10-25，全部为公网匿名 JWT 真实调用）

环境：`neondb` @ `ep-mute-term-a1vyn73h`（ap-southeast-1）。
匿名 JWT 从 `GET {auth}/token/anonymous` 换取，**没有任何 owner 凭据参与请求**。

| 用例 | 结果 |
| --- | --- |
| 正常插入（`path/nickname/website/content/status` + `x-client-key`） | **201**，回填 `id/created_at`，`ip_hash` 落库 |
| 楼中楼同帖回复（`parent_id` 指向同 `path` 的评论） | **201** |
| 同一 `x-client-key` 1 分钟内第 4、5 条 | **429** `PT429 / comment_rate_limit_minute`，`hint: retry in 9s` |
| 换一个 `x-client-key` 立即插入 | **201**（证明按 key 计数，不是全局误伤） |
| 不带 `x-client-key` 连插两条 | **201 ×2**（落 `~unkeyed`，不受 3/分钟约束，符合设计） |
| 24 小时配额（先铺 30 个历史桶） | **429** `PT429 / comment_rate_limit_day` |
| 全站阀门（当前分钟已 66 条） | **429** `PT429 / comment_rate_limit_global` |
| 同 `path+nickname+content` 10 分钟内第二次 | **409** `PT409 / comment_duplicate` |
| 同内容换 nickname | **201**（证明只拦完全相同的三元组） |
| 举报 INSERT（`comment_id` 存在） | **201** |
| 同一条评论重复举报（同客户端 24h） | **409** `PT409 / comment_report_duplicate` |
| 举报 `reason` 全空白 | **403** `42501`（RLS `WITH CHECK`） |
| 举报不存在的 `comment_id` | **409** `23503`（外键） |
| `parent_id` 指向另一个 `path` 的评论 | **400** `23514 / comment_parent_cross_thread` |
| `parent_id` 指向不存在的 id / 0 | **409** `23503 / comment_parent_missing` |
| 匿名插 `status=hidden` / `pending` / `spam` | **403** `42501`（RLS 回归，行为未变） |
| 匿名 `PATCH / DELETE` 评论 | **403** `permission denied for table comments` |
| 匿名读 `comment_reports` / `comment_rate_limit` | **403** `permission denied for table …` |
| keyset 分页（`limit=3`，7 条数据） | 3 + 3 + 1 页，7 个 id 无重复无遗漏、严格降序 |
| `comment_set_status` 四种值 | `pending → hidden → spam → visible` 全部成功 |
| `comment_set_status(…, 'deleted')` / 不存在的 id | 分别报 `invalid status` / `comment … not found` |

验证完成后测试数据已清空，最终行数：
`comments = 0`、`comment_reports = 0`、`comment_rate_limit = 0`。

---

## 9. 回滚

```sql
DROP TRIGGER IF EXISTS comments_before_insert_trg         ON public.comments;
DROP TRIGGER IF EXISTS comment_reports_before_insert_trg ON public.comment_reports;
DROP FUNCTION IF EXISTS public.comments_before_insert();
DROP FUNCTION IF EXISTS public.comment_reports_before_insert();
DROP FUNCTION IF EXISTS public.comment_client_key(text);
DROP FUNCTION IF EXISTS public.comment_set_status(bigint, text);
DROP FUNCTION IF EXISTS public.comment_rate_limit_prune(interval);
DROP TABLE IF EXISTS public.comment_reports;
DROP TABLE IF EXISTS public.comment_rate_limit;
DROP INDEX IF EXISTS public.comments_path_created_id_idx;
CREATE INDEX IF NOT EXISTS comments_path_created_idx ON public.comments (path, created_at DESC);

-- 想连 ip_hash 列一起去掉（⚠️ 会触发 §6 的 select=* 报错，除非同时刷新 schema cache）
-- ALTER TABLE public.comments DROP COLUMN IF EXISTS ip_hash;
```

回滚后 `public.comments` 的读/写行为与本次变更前一致（除了多出来的 `ip_hash` 列）。