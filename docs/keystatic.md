# Keystatic（本机内容后台，默认不进构建）

Keystatic 是 schema 驱动的内容后台。本站只把它当**本机开发工具**：
线上改内容/配置请用静态面板 `/admin/`（见 `docs/admin-panel.md`）。

## 1. 怎么起

```bash
pnpm admin          # = cross-env ENABLE_KEYSTASTIC=1 astro dev
# 或者：ENABLE_KEYSTASTIC=1 pnpm dev
```

打开 **http://127.0.0.1:4321/keystatic**。

`ENABLE_KEYSTASTIC` 是唯一的开关：不设它，`astro.config.mjs` 里那行 `await import("@keystatic/astro")`
根本不会执行，集成数组里也不会出现 Keystatic。

## 2. 能改哪些 collection

`keystatic.config.ts`（项目根）定义了三个 collection，路径与字段和 `src/content.config.ts` 的 zod schema 对齐：

| collection | 路径 | 说明 |
| --- | --- | --- |
| `posts` 博客文章 | `src/content/posts/**` | 含子目录；markdoc 编辑器 + 完整字段表单 |
| `dynamic` 动态 | `src/content/dynamic/*` | published / pinned / location + 正文 |
| `projects` 项目 | `src/content/projects/*` | title / published / order / tags / link[] / status 等 + 正文 |

### posts 字段映射（对照 `src/content.config.ts`）

| zod | Keystatic | 备注 |
| --- | --- | --- |
| `title: z.string()` | `fields.text` | 同时是 `slugField`（文件名保持原样，不会因为改标题而改名） |
| `published: z.date()` | `fields.date` | 写 `YYYY-MM-DD`，与现有文件一致 |
| `updated?: z.date()` | `fields.date` | 可选，不填不写 |
| `draft: z.boolean()` | `fields.checkbox` | 默认 false |
| `description / image / author / sourceLink / licenseName / licenseUrl / password / passwordHint / series` | `fields.text` | `image` 用 text 而不是 `fields.image`：现有值是 `images/xxx.avif` 这种裸路径，image 字段会按 directory+publicPath 重算并改写 |
| `tags: z.array(z.string())` | `fields.array(fields.text)` | |
| `category: z.string().nullable()` | `fields.text` | |
| `pinned / comment` | `fields.checkbox` | comment 默认 true |
| `seriesOrder?: z.number()` | `fields.integer` | |
| 正文 | `fields.markdoc({ extension: "md" })` | `format.contentField: "content"` |
| `prevTitle / prevSlug / nextTitle / nextSlug` | **不入面板** | schema 注释写明 internal use；加进面板会让每次保存都往文章里塞 4 个空键 |

### `spec` 为什么只读

`src/content/spec/{about,guestbook,friends.mdx}` 的 zod schema 是 `z.object({})`，
文件本身**没有任何 frontmatter**（正文直接就是 `# 标题`）。Keystatic 的条目集合强制要求
`slugField` + 至少一个字段，硬接进去会往正文前插入 `title:` 之类的键，破坏文件。
结论：spec 不进 Keystatic，需要改就编辑文件或用 `/admin/` 的原始文本模式。

## 3. 改了之后怎么发布

Keystatic 在本机模式下**直接写文件**（local storage），不产生 commit：

```bash
git diff                 # 看一眼它写了什么
git add src/content/...  # 只加你改的
git commit -m "chore: 更新文章"
git push dev HEAD:main && git push dev HEAD:dev/main
```

推上去后 Vercel 自动重新构建。**永远不要推 `origin`**（那是正式版仓库）。

> 注意：Keystatic 保存时会按 schema 重写整块 frontmatter，
> 内联数组 `[日记]` 会变成块数组、可选空字段可能被补上 `""`，diff 会比手改大。
> 这就是线上默认用 `/admin/` 面板（只重写你改过的键）的原因。

## 4. 为什么默认在构建里关掉

`@keystatic/astro` 的 `astro:config:setup` 会 `injectRoute` 两条 **`prerender: false`** 的路由：

- `/keystatic/[...params]`
- `/api/keystatic/[...params]`

本站默认 `output: "static"`（Cloudflare Pages / EdgeOne 都是纯静态）。静态产物里不存在运行时，
这两条路由既跑不起来，也会把整个 React 后台打进 `dist`。所以：

- 集成只在 `ENABLE_KEYSTASTIC=1` 时动态 import 并挂载；
- 默认构建产物里 `grep -ri keystatic dist/` = 0（本次验证见提交说明）。
- 反证：`ENABLE_KEYSTASTIC=1 pnpm dev` 时 `/keystatic` 正常打开。

## 5. GitHub 模式怎么开（本仓库不适用）

Keystatic 支持把内容存在 GitHub 仓库里：

```ts
export default config({
  storage: { kind: "github", repo: "LegspCpd/FireFly-dev" },
  // 或 { kind: "github", repo: { owner: "LegspCpd", name: "FireFly-dev" } }
  collections: { /* ... */ },
});
```

但 GitHub 模式**必须有服务端**：面板要通过 GitHub App / OAuth 回调换 token，
`/api/keystatic/*` 要能处理登录、读仓库、写 commit。静态托管（Cloudflare Pages 纯静态目录 / EdgeOne 静态）
提供不了这些，所以：

1. 线上不启用 Keystatic；
2. 要远程改内容，用 `/admin/` 面板（浏览器端带自己的 PAT 调 Contents API，不需要服务端）；
3. 真要 Keystatic 的 GitHub 模式，得把它跑在 Cloudflare Workers / Vercel Serverless 这类有运行时的地方，
   并配 Keystatic GitHub App（`https://keystatic.com/docs/github-mode`），本站当前架构不选这条路。
