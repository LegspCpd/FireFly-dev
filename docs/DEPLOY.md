# Firefly 多平台部署指南

本项目一套代码可同时部署到 **Vercel**、**Cloudflare Pages**、**EdgeOne Pages** 三个平台，
各平台通过环境变量 `DEPLOY_TARGET` 自动选择对应的构建 adapter，无需改代码。

---

## 构建命令一览

| 平台 | 命令 | 输出目录（平台后台要填的目录） | 动态接口支持 |
|------|------|----------|--------------|
| Vercel（默认） | `pnpm build` 或 `pnpm build:vercel` | `dist`（另生成 `.vercel/output`，Vercel 自动识别） | ✅ `/api/indexnow`、`/gh/*` |
| Cloudflare Pages | `pnpm build:cloudflare` | **`dist/client`** | ❌ 静态托管（见下文「动态接口」一节） |
| EdgeOne Pages | `pnpm build:edgeone` | `dist` | ✅ 通过 Edge Function（手动配置） |

> 说明：`pnpm build` 未设置 `DEPLOY_TARGET` 时默认走 Vercel，与原有行为完全一致。
> 每次构建的第一行日志会打印选中的 adapter 与产物目录，例如
> `[deploy] DEPLOY_TARGET=cloudflare → adapter=@astrojs/cloudflare；产物目录：dist/client（CF Pages 的 Build output directory 请填 dist/client）`，
> 部署异常时先对照这行日志与平台后台填的目录。

---

## 一、Vercel

**构建命令**：`pnpm build`（或 `pnpm build:vercel`）
**输出目录**：不填 / `dist`（Vercel 自动识别 serverless 输出）

要点：
- 使用 `@astrojs/vercel`，保留全部动态能力（`/api/indexnow`、`/gh/*`）。
- 无需任何额外配置，保持现状即可。

---

## 二、Cloudflare Pages

**构建命令**：`pnpm build:cloudflare`
**输出目录**：`dist/client`
**环境变量**：无需手动设置（构建命令里的 `cross-env` 已注入 `DEPLOY_TARGET=cloudflare`）

### 后台设置（Settings → Build & deployments → Build configuration）

| 字段 | 填什么 | 说明 |
|------|--------|------|
| Framework preset | `Astro`（或 None） | 预设只影响默认建议值，下面两个字段以本表为准 |
| Build command | `pnpm build:cloudflare` | 必须带 `:cloudflare`，否则走默认的 Vercel adapter |
| Build output directory | `dist/client` | **最关键**。填 `dist` 会得到一个根目录没有 `index.html` 的部署 → 全站 404 |

可选：Settings → Environment variables（Production 与 Preview 都加）

| 变量 | 值 | 说明 |
|------|-----|------|
| `DEPLOY_TARGET` | `cloudflare` | 冗余保险，构建命令里已注入 |
| `NODE_VERSION` | `22` | 仓库要求 `node >= 22.23` |

> 仓库根的 `wrangler.jsonc` 是 Pages 项目配置，其中 `pages_build_output_dir = "./dist/client"`
> 是产物目录的事实来源：CF 构建日志出现 `Found wrangler.json file. Reading build configuration...`
> 时以它为准，后台的 Build output directory 只作为该文件未被识别时的兜底。两处填一致最稳。

### 为什么是 `dist/client`，不是 `dist`

`@astrojs/cloudflare`（v12 起）是 **Workers 专用** adapter：它给静态产物设了
`preserveBuildClientDir`，静态站因此落在 `dist/client/`，Workers 包另放在 `dist/server/`
（`entry.mjs` + 自动生成的 `wrangler.json`）。本地实测产物：

```
dist/client/index.html        ← 站点根页，Pages 必须上传到这一层
dist/client/_astro/*、pagefind/*、_headers …
dist/server/entry.mjs、chunks/*、wrangler.json   ← Pages 用不到的 Workers 包
dist/client/_worker.js        ✗ 不存在（v12 起不再生成 Pages 版 _worker.js）
dist/client/_routes.json      ✗ 不存在
```

要点：
- `prerenderEnvironment: "node"` 已配置，保证含 `node:fs` 的构建期逻辑（gallery / OG 图）正常。
- 构建期日志第一行会打印 `DEPLOY_TARGET`、adapter 名与产物目录，便于和后台设置对照。

### 动态接口（`/api/indexnow`、`/gh/*`）在 CF Pages 上会 404

Pages 只托管静态目录，而本 adapter 不再产出 Pages 用的 `_worker.js`，所以两条
`prerender = false` 的路由没有运行载体。站点其余内容（首页、文章、搜索、RSS、
sitemap、OG 图）全部是预渲染静态文件，不受影响。

这两条都不是关键路径：`/gh/*` 是 GitHub 页面代理，`/api/indexnow` 是搜索引擎主动推送接口
（构建时 `scripts/ping-indexnow.js` 已推送，不依赖该路由）。若要恢复，可在仓库根新增
Cloudflare Pages Functions（`functions/` 目录）单独实现这两条路由。

### 不要把 Workers 配置混进 Pages 配置

Pages 只允许 `pages_build_output_dir` / `name` / `compatibility_date` /
`compatibility_flags` / `vars` / 各类 binding 等字段。一旦加入 Workers 专属的
`main` 或 `assets`，CF 会判定该文件不是合法 Pages 配置并跳过它：

```
Found wrangler.json file. Reading build configuration...
A wrangler.toml file was found but it does not appear to be valid.
Did you mean to use wrangler.toml to configure Pages? If so, then make sure the file is
valid and contains the `pages_build_output_dir` property. Skipping file and continuing.
```

被跳过后只剩后台面板的 Build output directory 生效，填错就是「构建成功但全站打不开」。

> 需要部署成 Cloudflare **Worker**（`wrangler deploy` / Workers Builds）时，请单独建 Worker
> 项目并使用 `main` + `assets.directory = "./dist/client"` 的配置，不要塞进本仓库的
> `wrangler.jsonc`。

---

## 三、EdgeOne Pages

**构建命令**：`pnpm build:edgeone`
**输出目录**：`dist`
**环境变量**：无需手动设置（脚本内部固定 `DEPLOY_TARGET=static`）

要点：
- EdgeOne 没有官方 Astro adapter，因此采用**纯静态输出**（无 adapter）。
- `build:edgeone` 会自动临时移出两条 `prerender=false` 的动态路由（`api/indexnow`、`gh/[...path]`），
  构建完成后再自动恢复，不影响 Vercel / Cloudflare 构建。
- 静态部署后 `/api/indexnow` 与 `/gh/*` 需通过 **Edge Function** 承载（见下）。

### EdgeOne Edge Function 配置

1. 打开 EdgeOne 控制台 → **站点** → **Edge Functions**。
2. 新建 Edge Function，将 **`docs/edgeone-edge-function.js`** 的内容粘贴进去。
3. 绑定触发规则（URL 匹配）：
   - `/api/indexnow` → 触发（GET / POST）
   - `/gh/*` → 触发
4. 保存并发布。

此函数为 `/api/indexnow`（IndexNow URL 提交）与 `/gh/*`（GitHub 反向代理）提供与
Vercel / Cloudflare 一致的功能。若不配置，这两条路径返回 404，其余功能不受影响；
站点收录仍由构建时的 `scripts/ping-indexnow.js` 自动完成。

---

## 常见问题

**Q：Cloudflare Pages 构建成功，但站点打不开（全站 404）？**
先看后台 Build output directory 是不是填了 `dist`。本仓库 CF 链路的静态产物在
`dist/client`（原因见上文），`dist` 根目录只有 `client/` 子目录、没有 `index.html`，
上传的就是一个空站。把该字段改成 `dist/client`、Build command 改成
`pnpm build:cloudflare` 后重新部署。仓库 `wrangler.jsonc` 的
`pages_build_output_dir` 已指向 `./dist/client`，构建日志出现
`Reading build configuration...` 时以该文件为准。

**Q：EdgeOne 上访问首页报错 / 显示异常？**
确认输出目录填的是 `dist`，且构建命令是 `pnpm build:edgeone`（不能用默认 `pnpm build`，
否则会生成 serverless 格式、`dist` 根目录没有 `index.html`）。

**Q：站内搜索没结果？**
本项目已修复 pagefind 索引生成（自动探测 `dist` 或 `dist/client`）。
若仍异常，检查构建产物中是否存在 `pagefind/` 目录；没有则说明构建未跑完 pagefind 步骤。

**Q：本地 Windows 构建报 EPERM / 产物被清空？**
Windows Search 索引服务（SearchIndexer）会占用 `dist` 下文件，触发 Astro 收尾清理失败。
这是本机环境问题，不影响 Linux CI（三平台构建服务器）。可用 `OUT_DIR=dist-check` 指向
全新目录临时验证。

---

## 相关文件

- `astro.config.mjs` — 按 `DEPLOY_TARGET` 切换 adapter，并打印产物目录自证日志
- `wrangler.jsonc` — Cloudflare Pages 配置（`pages_build_output_dir = ./dist/client`）
- `scripts/run-pagefind.ts` + `scripts/site-root.ts` — 搜索索引生成与产物根目录探测（`dist` / `dist/client`）
- `scripts/build-edgeone.js` — EdgeOne 纯静态构建编排
- `scripts/prepare-static-build.js` — 动态路由暂移/恢复
- `docs/edgeone-edge-function.js` — EdgeOne Edge Function 代码