# 站点管理面板（/admin/，纯静态 · 零服务端）

站主 2026-10-29：「我说的是，安装了那个管理面板，然后就能在上面管理这个网站的所有东西了，而不是只能发文章」——
所以后台不是 Astro/Keystatic 的服务端后台，而是一个**随站发布的静态页面**，用 GitHub Contents API 直接读写仓库文件。
没有服务器、没有数据库、没有构建期密钥。

## 1. 怎么用

1. 打开 **https://你的域名/admin/**（本地是 http://localhost:4321/admin/）。
2. 页面会要求粘贴一枚 **fine-grained PAT**：
   - GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token
   - Repository access：只选 `LegspCpd/FireFly-dev`（不要给 All repositories）
   - Permissions：**Contents: Read and write**（只要这一项；Metadata 会自动带上 Read）
   - Expiration：按需，建议 7~30 天，过期重新生成
3. 粘贴后点「连接并列目录」。Token **只写进当前标签页的 sessionStorage**：关掉标签页即失效，
   不写 cookie、不写 localStorage、不进仓库、不进构建产物。
4. 左侧选文件 → 右侧改 → 底部「保存并提交」= 向仓库提交**一次 commit**。

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

## 3. 保存之后会怎样

1. 面板调用 `PUT /repos/{owner}/{repo}/contents/{path}`，带上文件 `sha`，message 默认 `chore(admin): 更新 {path}`（可改）。
2. GitHub 立刻产生一次 commit；Vercel 监听到分支变动会**自动重新构建**，几十秒后线上生效。
3. 想回滚：面板里再改回去提交一次，或者本地 `git revert <sha>`；面板每次提交的 sha 会显示在绿色提示里。

## 4. 安全边界

- **仓库里没有任何 token**；构建产物里也没有（CI 可跑 `grep -rE 'ghp_|github_pat_|gho_' dist/` 校验为 0）。
- 页面级 `noindex,nofollow,noarchive,nosnippet` + `robots.txt` 的 `Disallow: /admin/` + 不进 sitemap + 不进站内导航。
- 页面不发任何埋点、不加载评论区与 swup（独立 HTML 壳，不套 `Layout.astro`）。
- 因为凭据在浏览器端，**面板本身不是访问控制**：它只是「谁拿到 token 谁就能改」。
  因此 PAT 必须 fine-grained 且只授权本仓库 Contents，泄露了删 token 即可止损。
- 有人打开 `/admin/` 但没 token 时只能看到一个连接表单，读不到仓库任何内容。

## 5. 和 Keystatic 的关系

Keystatic 仍然保留，但**只在本机开发用**（`pnpm admin`，见 `docs/keystatic.md`）：
它 schema-driven、体验更好，但需要 dev server，且改不了任意 TS/CSS。
两个东西分工：**线上改内容/配置 → /admin/ 面板**；**本机大改内容 → Keystatic**。

## 6. 已知限制

- 一次保存 = 一次 commit，没有草稿区、没有 diff 预览（改前请自己看一遍原文）。
- 列表用 `git/trees?recursive=1`，超大仓库会慢；本仓库 1756 个文件，1~2 秒。
- 不支持新建/删除文件（只改已有文件）。需要新建文章请用 `pnpm new-post`，或直接在 GitHub 网页端建。
- 图片上传没做（浏览器端要另接 uploads API），需要换图请用 GitHub 网页端传。
