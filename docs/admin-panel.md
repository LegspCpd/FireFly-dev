# 站点管理面板（随机路径 + 前端密码门 · 纯静态 · 零服务端）

站主 2026-10-29：「我说的是，安装了那个管理面板，然后就能在上面管理这个网站的所有东西了，而不是只能发文章」——
所以后台不是 Astro/Keystatic 的服务端后台，而是一个**随站发布的静态页面**，用 GitHub Contents API 直接读写仓库文件。
没有服务器、没有数据库、没有构建期密钥。

站主 2026-10-30：「难道没密码吗，直接就这样暴露出来吗」——于是补了两层**遮挡**：随机路径 + 前端密码门，
并把边界写清楚（见第 4 节）。注意是遮挡，不是鉴权：真鉴权只有 PAT 和边缘侧 Access 能做到。

## 0. 入口、密码与默认值（站主自己看）

| 项 | 值 | 改哪里 |
| --- | --- | --- |
| 入口路径 | **`/p-c8bd3a/`** | `src/config/adminConfig.ts` 的 `path`；改完重新构建，旧路径立刻 404，旧的 `/admin/` 从来就没有页面 |
| 访问密码（明文） | **不在仓库里**（源码与 docs 都会公开，明文一进仓库就等于公开）；口令由站主自持 | 换口令：`printf '%s' '新口令' \| sha256sum` → 把哈希填进 `passwordHash` |
| 密码提示（公开） | 密码框下面那行小字 | `passwordHint`（只有 hash 和提示会进构建产物） |
| 关掉面板 | — | `enabled: false`：构建期连路由都不注入，产物里没有这个页面 |

> ⚠️ **默认口令只在交付时的对话里给过，仓库里一律不落明文**。
> 换法：本机 `printf '%s' '新口令' | sha256sum` → 哈希粘进 `passwordHash` → 明文自己记（别提交）。
>
> ```bash
> # bash / macOS / Linux
> printf '%s' '你的新密码' | sha256sum | cut -d' ' -f1
> # Windows PowerShell / 任意平台有 node 时
> node -e "process.stdout.write(require('crypto').createHash('sha256').update('你的新密码','utf8').digest('hex'))"
> ```
>
> 密码请用 20 位以上（默认这枚 35 位）。原因见 4.1：hash 在产物里是公开的，短密码等于没有。

## 1. 怎么用

1. 打开 **https://你的域名/p-c8bd3a/**（本地是 http://localhost:4321/p-c8bd3a/）。
   **`/admin/` 现在是 404**——那个路径已经没有任何页面（`dist/client/admin/index.html` 不存在）。
2. 先过密码门：输入上面那枚口令。未解锁时页面里只有一个密码框，**不会发任何 GitHub 请求**，
   也不会读取 sessionStorage 里的旧 token。连续输错 5 次锁定 60 秒（只在前端，刷新页面一样锁着）。
   解锁状态存 sessionStorage（`firefly-admin-unlocked`），与 token 同一生命周期：关标签即失效。
3. 页面会要求粘贴一枚 **fine-grained PAT**：
   - GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token
   - Repository access：只选 `LegspCpd/FireFly-dev`（不要给 All repositories）
   - Permissions：**Contents: Read and write**（只要这一项；Metadata 会自动带上 Read）
   - Expiration：按需，建议 7~30 天，过期重新生成
4. 粘贴后点「连接并列目录」。Token **只写进当前标签页的 sessionStorage**：关掉标签页即失效，
   不写 cookie、不写 localStorage、不进仓库、不进构建产物。
5. 左侧选文件 → 右侧改 → 底部「保存并提交」= 向仓库提交**一次 commit**。

> 面板默认指向 `LegspCpd/FireFly-dev` 的 `main` 分支；Owner / Repo / Branch 三个输入框都可以改，
> 所以临时验证可以切到一个测试分支，验证完把分支删掉，主分支持续干净。

## 2. 能管什么

左侧按作用域分栏，本质是整个仓库的文件树（1756 个文件），按前缀过滤：

| 分栏 | 路径 | 编辑方式 |
| --- | --- | --- |
| 内容 | `src/content/**` | markdown 走**表单 + 正文**；其余走原始文本 |
| 配置 | `src/config/*.ts` | 原始文本（等宽字体 + 行号），保存前提示 TS 语法风险 |
| 样式 | `src/styles/**` | 原始文本 |
| 页面 | `src/pages/**` | 原始文本 |
| 文档 | `docs/**` | 原始文本 |
| 全部文件 | 整个仓库 | 原始文本（顶部有路径过滤框） |

### markdown 表单

- `src/content/posts/**`：字段严格照 `src/content.config.ts` 的 posts zod schema
  （title / published / updated / draft / description / image / tags / category / lang / pinned /
  author / sourceLink / licenseName / licenseUrl / comment / password / passwordHint / series / seriesOrder），
  正文是纯文本 Markdown。
- 其它 markdown（dynamic / projects / spec / 任意 .md）：走通用 frontmatter 键值表单 + 正文。
- **格式不会被打乱**：解析时保留每个键的原始行；只有你**改过**的键会按原来的引号风格与数组风格重写，
  没改的键原样写回；新增的键追加在 frontmatter 末尾。正文除你编辑的部分外不做任何格式化。
- 没有 frontmatter 的文件（例如 `src/content/spec/about.md`）自动落到原始文本模式，不会被强行加 `---` 头。

### 配置文件 / 样式文件

- 面板**不解析 TypeScript**，也不为它们编表单：就是纯文本编辑器（行号可开关）。
- 改 `src/config/*.ts` 时页面上有黄色提示：括号/引号写错会让构建失败，Vercel 那次部署会直接失败；
  所以改配置建议一次只改一个值，保存后看部署结果。

### 新建 / 删除 / 传图 / diff（同一套「一次操作 = 一次 commit」）

- **新建**：左栏「＋ 新建」→ 选类型（posts / dynamic / projects / 任意路径）→ 填 slug（和标题）或完整路径 →
  「创建并提交」。模板严格照 `src/content.config.ts` 只写 schema 里存在的键（posts 一定带 title + published，
  默认 `draft: true`，tags/category 给空值），建完自动打开编辑器。任意路径文件内容为空，可直接写。
- **删除**：文件树每项右侧的 ✕ → 弹层里会**写清完整路径**再确认。删除同样进 git 历史，之后能在 GitHub 的提交里恢复。
- **上传图片**：编辑器右上「插入图片」→ 选本地图片 → 直接 commit 到 `public/uploads/YYYY/MM/<名字>-<随机>.<ext>`
  → 自动把 `![](/uploads/...)` 插到**光标处**。上限 5MB，只收 png / jpg / webp / svg / gif。
- **查看改动**：保存前点「查看改动」，逐行 diff（前端 LCS 算的，不引第三方库），绿色 + / 红色 −，带行号与 +N/−N 统计。

## 3. 保存之后会怎样

1. 面板调用 `PUT /repos/{owner}/{repo}/contents/{path}`，带上文件 `sha`，message 默认 `chore(admin): 更新 {path}`（可改）。
2. GitHub 立刻产生一次 commit；Vercel 监听到分支变动会**自动重新构建**，几十秒后线上生效。
3. 想回滚：面板里再改回去提交一次，或者本地 `git revert <sha>`；面板每次提交的 sha 会显示在绿色提示里。

## 4. 安全边界（先读这一节再上线）

一句话：**这个面板里没有任何一样东西能当访问控制用**。密码和随机路径都是遮挡，真正的锁是 PAT。

### 4.1 前端密码 = 遮挡，不是加密，也不是鉴权

- 本站是**纯静态**：没有服务端，没有任何能在服务器上执行的校验代码，任何「密码」都只能在浏览器里比对。
- 校验方式：`crypto.subtle.digest('SHA-256', 输入)` 与 `adminConfig.passwordHash` 比对（十六进制、大小写不敏感）。
- 因此 **hash 是公开的**：它躺在构建出来的 JS 里，谁都读得到。拿到 hash 就能离线爆破，
  所以**密码必须长**（默认 35 位；八位字母数字在显卡面前是几分钟的事）。
- 前端校验也**可以被绕过**（改内存、关 JS、直接打 GitHub API）——它只挡手滑的人和批量扫描的脚本。
- 它唯一真实的好处：未解锁时页面里根本没渲染 AdminPanel，所以浏览器**一个 `api.github.com` 请求都不发**，
  sessionStorage 里的旧 token 也不会被读出来。
- 连续输错 5 次锁定 60 秒，只记在 sessionStorage（刷新仍在，换标签/清存储就没了）——同样只是「挡手滑」。

### 4.2 随机路径 = 遮挡，而且会漏

- 固定 `/admin/` 是扫描器的第一梯队；换成随机 slug（现在是 `/p-c8bd3a/`）能挡掉大部分盲扫。
- 但它**保不了密**：`robots.txt` 里有 `Disallow: /p-c8bd3a/`（robots.txt 是公开文件，任何人都能读），
  任何一次链接分享、浏览器历史、截图也会泄漏。**别把路径当密码用。**
- 唯一严谨的加固是 4.4 的第 1/2 条（边缘侧鉴权），或者干脆不发布这个页面。

### 4.3 真正的锁是 PAT

- 面板的每一次改动都是 `PUT /repos/{owner}/{repo}/contents/{path}`，带 `Authorization: Bearer <你的 token>`。
- 别人就算猜到了路径、绕过了密码门、点下了保存，**没有站主的 fine-grained token，GitHub 会直接 403**——一个字节也改不了。
  访问控制发生在 GitHub 那边，不在这台静态站里。
- 所以 token 才是权限本体：fine-grained、只授权本仓库、只开 `Contents: Read and write`、设过期时间。
  一旦怀疑泄露 → **立刻删 token**（比改密码有用得多）。
- **仓库和构建产物里没有任何 token**：CI 可跑 `grep -rE 'ghp_|github_pat_|gho_' dist/` 校验为 0；
  `grep -r 'password' dist/` 只会命中代码变量名与那枚 hash，**永远不会出现明文**（明文只在本文档）。

### 4.4 想要「真鉴权」怎么办（三条路，各一句）

1. **Cloudflare Access（Zero Trust）**：在 CF 后台给 `/p-c8bd3a/*` 挂一条 Access 策略、只允许站主邮箱或 OTP —— 请求在 CDN 边缘就被拦下，免费额度（50 用户）对个人站够用。
2. **Vercel 密码保护 / Deployment Protection**：平台侧口令页，最省事，但要付费套餐。
3. **面板只在本机跑**：不发布到线上，本机 `pnpm dev` 里用（这个面板或 `ENABLE_KEYSTASTIC=1` 的 Keystatic 都行），暴露面直接归零。

> 这三条都是「服务端/边缘校验」，只有这类才叫鉴权。纯前端做到头就是遮挡。

### 4.5 其他已做的加固

- 页面级 `noindex,nofollow,noarchive,nosnippet`；`robots.txt` 的 `Disallow` 由配置生成；不进 sitemap；不进站内导航。
- 页面不发任何埋点、不加载评论区与 swup（独立 HTML 壳，不套 `Layout.astro`）。
- `adminConfig.enabled: false` 时构建期连路由都不注入，产物里不存在这个页面。
- 有人打开这个路径但没密码：只有一个密码框；过了密码但没 token：只有一个连接表单，读不到仓库任何内容。

## 5. 和 Keystatic 的关系

Keystatic 仍然保留，但**只在本机开发用**（`pnpm admin`，见 `docs/keystatic.md`）：
它 schema-driven、体验更好，但需要 dev server，且改不了任意 TS/CSS。
两个东西分工：**线上改内容/配置 → 随机路径面板（`/p-c8bd3a/`，入口见第 0 节）**；**本机大改内容 → Keystatic**。

## 6. 已知限制

- 一次操作 = 一次 commit（改 / 新建 / 删除 / 传图各算一次），没有草稿区、没有「暂存多文件再一起提交」。
- 列表用 `git/trees?recursive=1`，超大仓库会慢；本仓库 1764 个文件，1~2 秒。
- 删除是**硬删除**（文件从树上消失），但 commit 还在，可以在 GitHub 里 revert 找回。
- 图片固定进 `public/uploads/YYYY/MM/`，不能选 `src/assets`（那需要构建期图片处理管线，浏览器端改不了）。
- 传图后 markdown 用根路径 `/uploads/...`：Astro 会把 `public/` 原样搬到站点根，路径一定存在。
- diff 是逐行文本比较（LCS），超过 400 万格（约 2000×2000 行）会自动降级为「只显示相同前缀 + 提示」。
- 仍然不解析 TypeScript、不做 schema 校验；配置改错 → 那次 Vercel 构建会失败，回面板改回来即可。
