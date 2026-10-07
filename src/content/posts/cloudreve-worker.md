---
title: Cloudreve也能部署到Cloudflare Worker上面了？！
published: 2026-09-21
description: Cloudreve-Worker 使用与部署完整指南。需要 R2 存储（开通需绑卡），支持多数据库主备容灾。推荐 fork 仓库后在 Cloudflare 面板手动部署，部署后务必绑定自定义域名。
tags: [Cloudreve, Cloudflare Workers, R2, Neon, 部署教程]
category: 教程
draft: false
---

把 Cloudreve v4 的后端重写为可直接跑在 Cloudflare Workers 上的 TypeScript 实现（不是编译、不是移植）。

本项目**强制依赖 Cloudflare R2** 作为默认存储。R2 目前开通需要绑定银行卡（或信用卡），请提前准备好。免费额度有 10GB 存储 + 每月 100 万次 A 类操作，个人使用基本够用。

数据库推荐使用 Neon（免费档即可），支持主库 + 最多 4 个备库的全量同步容灾。

---

## 一键部署

先去 [neon.tech](https://neon.tech) 注册并新建项目，复制首页的 Connection string（`postgresql://...` 那串）。

然后点击下方按钮：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/LegspCpd/Cloudreve-Worker)

部署页把 `DATABASE_URL` 填成上面的连接串，其余默认，点 Deploy。KV 和 R2 会自动创建，建表和初始化在**首次打开站点时自动完成**。

打开 Worker 地址后注册第一个账号 —— **第一个注册的用户自动成为管理员**。

---

## 手动部署（推荐大多数人使用）

大多数用户都是先 Fork 仓库，再到 Cloudflare 面板里接上，而不是点一键按钮。流程很简单，全程浏览器操作，不需要克隆到本地。

### 1. Fork 仓库

打开 [https://github.com/LegspCpd/Cloudreve-Worker](https://github.com/LegspCpd/Cloudreve-Worker)，点击右上角 **Fork**，把仓库 fork 到自己的账号下。

### 2. 准备 Neon 数据库

1. 打开 [neon.tech](https://neon.tech)，用 GitHub 登录，新建一个项目。
2. 进入项目后复制 **Connection string**（`postgresql://...` 开头的那串，带 `sslmode=require`）。

### 3. 在 Cloudflare 接上仓库

1. 打开 Cloudflare 面板 → **Workers & Pages** → **Create**。
2. 选择你刚 fork 的仓库。
3. 只需要填两格：

| 框 | 填什么 |
|---|---|
| **构建命令**（Build command） | `npm install` |
| **部署命令**（Deploy command） | `npm run deploy` |

输出目录留空。

`npm run deploy` 会自动处理 KV 和 R2：账号里已有同名资源就直接复用，没有才新建，并把真实 ID 回填，不需要你改 `wrangler.toml`。

### 4. 配置环境变量

在项目 **设置 → 环境变量**（或 Workers Builds 的构建环境变量）里添加以下变量，保存后重新部署一次。

部署脚本会把它们自动写入 Worker 的运行时 Secret。

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon 主库连接串 |
| `SITE_URL` | 建议 | 站点对外地址（部署后填你的域名或 Worker 地址），分享短链 / 下载直链会用到 |
| `JWT_SECRET` | 可选 | 令牌签名密钥（32 位以上随机串）。不设会自动生成并入库 |
| `FRONTEND_URL` | 可选 | 官方前端默认已随 Worker 一起发布。只有把前端单独部署到别处时才填 |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD` | 可选 | 兜底管理员。两者都配后，Worker 会保证该邮箱存在、密码一致、属于管理员组。用于找回管理员权限，建议存成 Secret |
| `DATABASE_URL_2` … `DATABASE_URL_5` | 可选 | 备库连接串（另外新建的 Neon 项目）。配了之后每次构建会自动把主库整库全量同步过去，最多 4 个备库 |
| `KV_COUNT` | 可选 | 建几个 KV namespace，取值 1–5，默认 1。**必须放在构建能读到的地方**（仓库根目录的 `KV_COUNT` 文件，或 Workers Builds 的构建环境变量），不要填在「变量和机密」里 |
| `DB_FAILOVER` | 可选 | 填 `1` 打开主库故障切换：主库连不上时自动降级到第一个备库。切换期间写到备库的数据会在下次全量同步时被覆盖，仅作临时应急 |

邮件、全文检索、存储策略等全部在**管理后台**配置，不占环境变量。

### 5. 首次访问 & 管理员

部署完成后打开 Worker 地址，注册第一个账号。第一个注册的用户会自动成为管理员。

如果之后管理员密码丢了，可以在 Worker 设置 → 变量和机密里临时加上 `ADMIN_EMAIL` + `ADMIN_PASSWORD`，下一个冷启动会自动恢复，用完记得删掉。

---

## 部署后请绑定自定义域名

Cloudflare 自带的 `*.workers.dev` 域名在国内几乎打不开，挂梯子也经常直接 1101 错误。

强烈建议绑定自己的域名：

1. Cloudflare 面板 → 你的 Worker → **设置** → **触发器** / **自定义域**。
2. 添加你的域名（域名最好也托管在 Cloudflare）。
3. 绑定完成后，把环境变量 `SITE_URL` 改成你的域名地址，再重新部署一次。

绑定域名后访问会稳定很多。

---

仓库地址：[https://github.com/LegspCpd/Cloudreve-Worker](https://github.com/LegspCpd/Cloudreve-Worker)

更详细的 CLI 本地部署、多 KV 角色分工、备库同步机制等，见仓库内的 `DEPLOY.md` 和 `README.md`。
