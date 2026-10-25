# 评论管理脚本（owner 本地 CLI）

> 对应脚本：[`scripts/comments-admin.ts`](../scripts/comments-admin.ts)
> 相关文档：[comment-api.md](./comment-api.md)（端点契约）、[neon-data-api.md](./neon-data-api.md)（Neon Data API 后端 + 表结构 / RLS）

## 0. 为什么是脚本，不是网页

评论区「审核后台 / 自助删除」**不能**做成网页功能：本站三端
（Cloudflare Pages / Vercel / EdgeOne）交付的都是**纯静态产物**，浏览器里能跑的东西等于
公开。要做网页后台，就必须把 owner 连接串（或等价的长期密钥）塞进前端 —— 任何人
F12 就能拿到，等于把数据库交出去。

所以这两件事只在**本机**做，入口是一个 CLI 脚本：

| 能力 | 谁做 | 放哪 |
| --- | --- | --- |
| 发表评论 / 读可见评论 | 浏览器（匿名 JWT） | 前端 `src/utils/comment-api.ts` |
| 审核（放行 / 隐藏 / 标垃圾） | **owner，本机** | `scripts/comments-admin.ts` |
| 物理删除 | **owner，本机** | 同上 |
| 统计 / 举报数 | **owner，本机** | 同上 |

数据库侧的边界由 RLS + GRANT 兜住（见 [neon-data-api.md §1](./neon-data-api.md#1-表结构已在库上执行可重复执行)）：
匿名角色**只能**读 `status = 'visible'`、**只能**插入 `status = 'visible'` 的行，
没有 UPDATE / DELETE 权限。所以审核与删除**不可能**从前端越权完成，必须走 owner 通道。

---

## 1. 前置条件

- **Node.js ≥ 22**（仓库 `package.json` 的 engines 要求），用 `npx tsx` 跑 TS；
- 一个 **owner 连接串**（`neondb_owner` 角色，不是 `anonymous` / 只读角色）；
- `pg` 包。⚠️ 仓库的 `package.json` **没有** pg（前端走 Data API，用不到它），
  而本脚本约定**不修改仓库依赖清单**，所以 pg 装在仓库外，用 `EF_PG_ROOT` 指过去（见 §3）。

---

## 2. `EF_OWNER_DSN` 从哪来、怎么传

**取值**：

1. Neon Console → 项目 → **Connect**；
2. 角色下拉选 **owner**（`neondb_owner`）；
3. 勾上 **Connection pooling**（主机名带 `-pooler`，脚本本身是短连接，pooler 更省事）；
4. 复制完整连接串，形如：

   ```text
   postgresql://<user>:<password>@<host>/<db>?sslmode=require
   ```

**传入**（只在当前 shell 里，**不要写进任何文件**）：

```bash
# bash / zsh
export EF_OWNER_DSN='postgresql://<user>:<password>@<host>/<db>?sslmode=require'
```

```powershell
# PowerShell
$env:EF_OWNER_DSN = 'postgresql://<user>:<password>@<host>/<db>?sslmode=require'
```

```bash
# 只给一条命令用，不进 shell 历史
EF_OWNER_DSN='postgresql://…' npx tsx scripts/comments-admin.ts list --status=pending
```

**脚本里的硬约束**（写死在代码里，别绕过）：

- 只读 `process.env.EF_OWNER_DSN`，**没有任何兜底 / 默认连接串**；
- 缺失或不是 `postgres://` / `postgresql://` 开头 → 立刻以**退出码 2** 结束，
  不去猜、也不回落到任何默认库；
- 日志里只出现**主机名**（`dsnHost()`），账号 / 密码 / 完整 DSN 一律不打印；
- `delete` 默认只**演练**，必须显式加 `--yes` 才真删。

---

## 3. 装 pg（仓库外）

```bash
mkdir -p /tmp/ef-comments-admin && cd /tmp/ef-comments-admin
npm i pg
export EF_PG_ROOT=/tmp/ef-comments-admin     # Windows: C:/Users/<you>/AppData/Local/Temp/ef-comments-admin
```

脚本按这个顺序找 pg，命中即用：

1. `$EF_PG_ROOT`（该目录下需有 `node_modules/pg`）
2. 仓库根目录（`scripts/` 的上一级）
3. 当前工作目录 → Node 默认解析

都找不到就报错退出，并在提示里给出上面的安装命令。**不要**为了让脚本跑起来去
`pnpm add pg` —— 改了 `package.json` 就跑偏了。

---

## 4. 命令参考

```text
EF_OWNER_DSN='postgresql://…' npx tsx scripts/comments-admin.ts <命令> [参数]
```

| 命令 | 作用 |
| --- | --- |
| `list [--path=<p>] [--status=<s>] [--limit=50]` | 按 `created_at` 倒序列出：id / 时间 / 昵称 / path / status / 摘要 |
| `publish <id...>` | `status → visible`（放行） |
| `hide <id...>` | `status → hidden`（前台不可见） |
| `spam <id...>` | `status → spam`（垃圾） |
| `delete <id...> [--yes]` | 物理删除；不带 `--yes` 只打印将要删除的行 |
| `stats` | 总数 / 按 status 分布 / 按线程 Top 10 / 举报数 |
| `--help` / 无参数 | 打印用法 |

细节：

- `--status` 只接受 `visible | pending | hidden | spam`，其它值直接报参数错误；
- `--limit` 范围 `1..500`，默认 `50`；
- 选项同时支持 `--path=/guestbook/` 与 `--path /guestbook/` 两种写法；
- 时间按**本机时区**显示并带偏移（如 `2026-10-25 08:53:29 +08:00`）；
- **所有写操作都打印 before → after**（after 取自数据库 `RETURNING`），方便审计；
- 传入的 id 里有不存在的 → 其余的照常处理，结束后退出码 `1` 并在输出里点名；
- `delete` 会先查「有没有子评论」，有就提前警告（子评论会随 `ON DELETE CASCADE` 一起没）；
- 退出码：`0` 成功，`1` 部分 id 不存在 / 运行失败，`2` 用法或环境变量错误。

### 示例输出

```text
$ npx tsx scripts/comments-admin.ts list --path=/guestbook/ --status=pending --limit=10
# 连接：ep-xxxx-pooler.ap-southeast-1.aws.neon.tech · 表 public.comments
== list ==
筛选：path=/guestbook/ · status=pending · limit=10
id  时间                        昵称    path          status   摘要
--  --------------------------  ------  ------------  -------  ---------------
41  2026-10-25 08:53:29 +08:00  cli-a   /guestbook/   pending  CLI test A 测试
共 1 行（按 created_at 倒序）。

$ npx tsx scripts/comments-admin.ts publish 41
# 连接：ep-xxxx-pooler.ap-southeast-1.aws.neon.tech · 表 public.comments
== status → visible ==
id  线程         昵称    before   after
--  -----------  ------  -------  -------
41  /guestbook/  cli-a   pending  visible
已更新 1 行（after 取自数据库 RETURNING）。

$ npx tsx scripts/comments-admin.ts delete 41
# 连接：ep-xxxx-pooler.ap-southeast-1.aws.neon.tech · 表 public.comments
== delete（物理删除）==
id  时间                        昵称    path          status   摘要
--  --------------------------  ------  ------------  -------  ---------------
41  2026-10-25 08:53:29 +08:00  cli-a   /guestbook/   visible  CLI test A 测试
（演练）未执行删除，待删 1 行。确认无误后加 --yes 重跑同一条命令。

$ npx tsx scripts/comments-admin.ts delete 41 --yes
== delete（物理删除）==
...
已物理删除 1 行：
  id=41  before=visible  after=(已删除)
```

```text
$ npx tsx scripts/comments-admin.ts stats
# 连接：ep-xxxx-pooler.ap-southeast-1.aws.neon.tech · 表 public.comments
== stats ==
总数：8
按 status 分布：
status   数量
-------  ----
visible  8
pending  0
hidden   0
spam     0
按线程 Top 10：
path          数量
------------  ----
/guestbook/   5
举报：public.comment_reports 共 0 条
```

> `comment_reports` 表当前**还不存在**（`stats` 会打印「表不存在，跳过」）。
> 表建好后脚本会**自动**多打一段举报统计：总数，外加按 `status` / `resolved` 列分组
> —— 具体打哪几段，按 `information_schema` 里实际有的列决定，不需要改脚本。

---

## 5. 状态机

```text
pending / hidden / spam  ──publish──▶  visible
visible                  ──hide─────▶  hidden
visible / hidden         ──spam─────▶  spam
```

| status | 前端能看到 | 含义 |
| --- | --- | --- |
| `visible` | ✅ | 正常展示（RLS 只放行这一档） |
| `pending` | ❌ | 待审（默认值改成 `pending` 才用得上，见 neon-data-api.md §1） |
| `hidden` | ❌ | 人工隐藏 |
| `spam` | ❌ | 垃圾，留档不展示 |

流转没有方向限制：`publish` 可以把 `spam` 直接拉回 `visible`，误操作重跑一次即可。
每次流转都留 before → after 输出，按 id 可回溯。

---

## 6. 安全注意（必读）

1. **`EF_OWNER_DSN` 只放环境变量**。不要写进 `.env`、不要写进脚本、不要写进文档、
   不要提交，不要贴进 issue / 聊天记录。
2. 仓库 `.gitignore` 已经忽略 `.env` / `.env.production`，但**忽略不等于安全**：
   本脚本的约定就是「不经文件」。
3. 脚本**不打印**凭据：日志里的「连接」行只输出 `dsnHost()`（主机名）。
   pg 自己抛的网络 / 认证错误文本里可能出现用户名（如 `password authentication failed for user "neondb_owner"`），
   但不会出现密码。分享输出前扫一眼即可。
4. 前端**永远**不碰 owner 通道：`src/utils/comment-api.ts` 只用匿名 JWT，这一点不要改。
5. `delete` 是物理删除、不可撤销。养成「先不带 `--yes` 跑一遍看清单」的习惯。
6. 需要轮换凭据时：Neon Console 里改密码，然后重开一个 shell 重新 `export`；
   旧 shell 里的变量不会自己更新。
7. 有共享终端 / 录屏 / CI 日志的环境，优先用 `EF_OWNER_DSN='…' 命令` 的单次形式，别 `export` 到持久 shell。

---

## 7. 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| `缺少环境变量 EF_OWNER_DSN`（退出码 2） | 没 `export`，或 export 在另一个 shell 里。重开终端重来一遍 |
| `找不到可用的 pg 包` | 没装 pg 或 `EF_PG_ROOT` 指错。按 §3 装好再指过去 |
| `ECONNREFUSED` / `timeout` | 网络或 host 写错；pooler 主机名里那个 `-pooler` 别漏 |
| `password authentication failed` | 角色/密码不对，或复制时漏了字符（重开 Connect 面板重新复制） |
| 打印一长串 `SECURITY WARNING: The SSL modes 'prefer','require','verify-ca'…` | pg `8.x` 的**预警**，不是错误：它在说 pg v9 里 `sslmode=require` 的语义会变。当前连接行为不变，可以忽略；想彻底消掉就在 DSN 里写 `sslmode=verify-full`（或加 `uselibpqcompat=true`） |
| Git Bash / MSYS 下 `--path=/guestbook/` 变成了 `C:/Users/…/guestbook/` | MSYS 把以 `/` 开头的参数当路径转义了。加 `MSYS_NO_PATHCONV=1`，或写成 `--path=//guestbook/` |
| 摘要列全是 `��` | **读**这一侧没问题（脚本固定 `client_encoding = UTF8`）。这种是**写**那一侧把中文按 GBK 编进了库（多见于 Windows 控制台直接 `curl -d` 中文字面量），数据本身在写的时候就已经坏了，只能重发 |

---

## 8. 回滚

脚本只是读取/更新 `public.comments`，删掉 `scripts/comments-admin.ts` 与本文件即可，
数据库结构不受影响。真要连表一起清掉，见
[neon-data-api.md §8](./neon-data-api.md#8-回滚)。
