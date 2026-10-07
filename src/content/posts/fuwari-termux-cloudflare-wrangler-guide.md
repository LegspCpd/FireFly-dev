---
title: 在 Termux 上配置 Cloudflare Wrangler，并上传已有 Worker 与 D1 数据库
published: 2026-10-02
description: 适合新手的 Termux + Ubuntu + Wrangler 教程：从零安装 Cloudflare Wrangler，登录 Cloudflare，连接已经创建好的 Worker 和 D1，并完成 SQLite/SQL 数据库导入与 Worker 部署。
tags: [Cloudflare, Wrangler, Termux, D1, Worker, Ubuntu, 教程]
category: Cloudflare
draft: false
lang: zh-CN
---

# 在 Termux 上配置 Cloudflare Wrangler，并上传已有 Worker 与 D1 数据库

> 本教程按“完全不会 Wrangler 的新手”来写。
>
> 目标是让你最终可以只使用 Android 手机上的 **Termux**，完成：
>
> - 安装 Wrangler
> - 登录 Cloudflare
> - 查看已经创建好的 Worker
> - 查看已经创建好的 D1
> - 上传 `.sql` 数据库
> - 将 `.db` / `.sqlite` 数据库转换为 SQL 后导入
> - 部署 Worker
> - 检查 D1 是否导入成功
>
> 本教程使用 **Termux → Ubuntu 24.04 → Node.js 24 → Wrangler** 这条路线。这样可以绕开原生 Android/Termux 环境下 Wrangler 原生依赖可能带来的兼容性问题。

## 目录

- [一、先理解整个流程](#一先理解整个流程)
- [二、第一步：更新 Termux](#二第一步更新-termux)
- [三、第二步：安装 Ubuntu 2404](#三第二步安装-ubuntu-2404)
- [四、第三步：进入 Ubuntu](#四第三步进入-ubuntu)
- [五、第四步：给 Termux 访问手机存储的权限](#五第四步给-termux-访问手机存储的权限)
- [六、第五步：更新 Ubuntu 并安装基础工具](#六第五步更新-ubuntu-并安装基础工具)
- [七、第六步：安装 NVM](#七第六步安装-nvm)
- [八、第七步：安装 Node.js 24](#八第七步安装-nodejs-24)
- [九、第八步：安装 Wrangler](#九第八步安装-wrangler)
- [十、第九步：登录 Cloudflare](#十第九步登录-cloudflare)
- [十一、第十步：检查登录状态](#十一第十步检查登录状态)
- [十二、第十一步：查看已有 D1](#十二第十一步查看已有-d1)
- [十三、第十二步：查看 D1 详细信息](#十三第十二步查看-d1-详细信息)
- [十四、第十三步：获取已经创建好的 Worker](#十四第十三步获取已经创建好的-worker)
- [十五、第十四步：进入 Worker 项目](#十五第十四步进入-worker-项目)
- [十六、第十五步：检查 Wrangler 配置](#十六第十五步检查-wrangler-配置)
- [十七、第十六步：理解 D1 Binding](#十七第十六步理解-d1-binding)
- [十八、第十七步：备份现有 D1](#十八第十七步备份现有-d1)
- [十九、第十八步：上传 SQL 数据库](#十九第十八步上传-sql-数据库)
- [二十、第十九步：如果手里的是 db/sqlite 文件](#二十第十九步如果手里的是-dbsqlite-文件)
- [二十一、第二十步：检查 D1 数据](#二十一第二十步检查-d1-数据)
- [二十二、第二十一步：部署 Worker 前先测试](#二十二第二十一步部署-worker-前先测试)
- [二十三、第二十二步：正式部署 Worker](#二十三第二十二步正式部署-worker)
- [二十四、第二十三步：以后怎么更新 Worker](#二十四第二十三步以后怎么更新-worker)
- [二十五、常见问题](#二十五常见问题)
- [二十六、完整命令速查](#二十六完整命令速查)
- [二十七、参考资料](#二十七参考资料)

---

## 一、先理解整个流程

我们最终的环境大概是：

```text
Android 手机
└── Termux
    └── Ubuntu 24.04
        ├── Node.js 24
        ├── npm
        └── Wrangler
            ├── Cloudflare Worker
            └── Cloudflare D1
```

以后你更新 Worker 时，基本只需要：

```bash
npx wrangler deploy --keep-vars
```

如果要把 SQL 导入 D1：

```bash
npx wrangler d1 execute 你的D1名称 --remote --file=./database.sql --yes
```

---

## 二、第一步：更新 Termux

打开 Termux，执行：

```bash
pkg update
```

然后：

```bash
pkg upgrade -y
```

再安装 PRoot-Distro：

```bash
pkg install proot-distro -y
```

### 为什么要安装 PRoot-Distro？

我们不直接把 Wrangler 装进 Android 的 Termux 环境，而是在 Termux 里面运行一个 Ubuntu 24.04 环境，再在 Ubuntu 里安装 Node.js 和 Wrangler。

这条路线更适合新手，也更容易处理 Wrangler 的 Linux/Node 原生依赖。

---

## 三、第二步：安装 Ubuntu 24.04

执行：

```bash
proot-distro install ubuntu:24.04
```

等待安装完成。

如果看到类似：

```text
[*] Installing Ubuntu (24.04)...
```

就耐心等它结束。

安装结束后，输入：

```bash
proot-distro list
```

你应该能看到已经安装好的 Ubuntu。

---

## 四、第三步：进入 Ubuntu

执行：

```bash
proot-distro login ubuntu --shared-home
```

成功进入后，命令行通常会变成类似：

```text
root@localhost:~#
```

这就说明：

> 你已经不是在 Android 的原生 Termux Shell 里，而是在 Termux 里的 Ubuntu 环境中了。

### 为什么使用 `--shared-home`？

因为这样 Termux 和 Ubuntu 可以更方便地共享 Home 目录。

以后你在 Termux 的：

```text
~/storage/downloads
```

里放 Worker 文件、数据库文件，进入 Ubuntu 后也能更方便地访问。

---

## 五、第四步：给 Termux 访问手机存储的权限

如果你还没有执行过：

```bash
termux-setup-storage
```

建议现在退出 Ubuntu，回到原生 Termux：

```bash
exit
```

然后：

```bash
termux-setup-storage
```

Android 会弹出权限请求。

点击：

**允许**

之后手机的“下载”目录一般可以通过：

```text
~/storage/downloads
```

访问。

例如：

```text
手机：
Download/database.db
```

对应：

```text
~/storage/downloads/database.db
```

### 再次进入 Ubuntu

```bash
proot-distro login ubuntu --shared-home
```

---

## 六、第五步：更新 Ubuntu 并安装基础工具

进入 Ubuntu 后执行：

```bash
apt update
```

然后：

```bash
apt upgrade -y
```

安装我们后面需要的工具：

```bash
apt install -y curl ca-certificates git sqlite3 unzip nano
```

这些工具分别用于：

| 工具 | 用途 |
|---|---|
| `curl` | 下载脚本、访问网络 |
| `ca-certificates` | HTTPS 证书 |
| `git` | 获取项目代码 |
| `sqlite3` | 转换 SQLite 数据库 |
| `unzip` | 解压 ZIP |
| `nano` | 编辑配置文件 |

---

## 七、第六步：安装 NVM

先安装 NVM：

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

安装结束后：

```bash
source ~/.bashrc
```

检查：

```bash
nvm --version
```

如果出现类似：

```text
0.40.3
```

就说明 NVM 已经安装成功。

> 如果版本号稍有不同，不需要和示例完全一致。

---

## 八、第七步：安装 Node.js 24

安装 Node.js 24：

```bash
nvm install 24
```

启用：

```bash
nvm use 24
```

设为默认版本：

```bash
nvm alias default 24
```

检查 Node：

```bash
node -v
```

应该看到类似：

```text
v24.x.x
```

再检查 npm：

```bash
npm -v
```

正常出现版本号即可。

---

## 九、第八步：安装 Wrangler

建议不要把 Wrangler 随便全局安装，而是在一个专门的 Cloudflare 工作目录里面作为项目依赖使用。

创建目录：

```bash
mkdir -p ~/cloudflare
```

进入：

```bash
cd ~/cloudflare
```

初始化 npm 项目：

```bash
npm init -y
```

安装 Wrangler：

```bash
npm install --save-dev wrangler@latest
```

安装完成后检查：

```bash
npx wrangler --version
```

如果看到类似：

```text
⛅ wrangler 4.x.x
```

就成功了。

> Wrangler 版本会持续更新，所以版本号不一定和教程中的示例完全相同。

---

## 十、 第九步：登录 Cloudflare

执行：

```bash
npx wrangler login --device
```

Cloudflare 会给你一个网址和验证码。

一般会看到类似：

```text
To authorize Wrangler, please visit:

https://dash.cloudflare.com/oauth2/device

and enter the code:

XXXXXXXX
```

### 接下来做什么？

1. 复制网址。
2. 在手机浏览器打开。
3. 登录你的 Cloudflare 账号。
4. 输入 Termux 显示的验证码。
5. 授权 Wrangler。
6. 回到 Termux。

如果成功，会看到类似：

```text
Successfully logged in.
```

---

## 十一、第十步：检查登录状态

执行：

```bash
npx wrangler whoami
```

如果能正常显示 Cloudflare 账号信息，说明登录成功。

### 如果这里失败

先不要继续操作。

常见原因包括：

- 没有完成浏览器授权
- 登录到了错误的 Cloudflare 账号
- 网络连接失败
- Wrangler 没有正常安装

---

## 十二、第十一步：查看已有 D1

因为你说 **D1 已经创建过了**，所以我们不要重新创建。

执行：

```bash
npx wrangler d1 list
```

你应该可以看到类似：

```text
Name          UUID
my-database   xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

记下：

```text
D1 名称
D1 ID
```

例如：

```text
D1 名称：
my-database

D1 ID：
12345678-1234-1234-1234-123456789abc
```

> 不要自己编数据库 ID，以 `npx wrangler d1 list` 显示的为准。

---

## 十三、第十二步：查看 D1 详细信息

执行：

```bash
npx wrangler d1 info 你的D1名称
```

例如：

```bash
npx wrangler d1 info my-database
```

这一步可以帮助你确认数据库确实存在，以及 Wrangler 已经能够正常访问它。

---

## 十四、第十三步：获取已经创建好的 Worker

你有两种情况。

### 情况 A：Worker 已经在 Cloudflare Dashboard 创建

这是最方便的。

进入：

```bash
cd ~/cloudflare
```

然后执行：

```bash
npx wrangler init my-worker --from-dash 你的Worker名称
```

例如：

```bash
npx wrangler init my-worker --from-dash my-worker
```

Wrangler 会尝试把 Dashboard 里已经存在的 Worker 初始化到本地项目。

> `my-worker` 是你本地项目目录的名字。
>
> `你的Worker名称` 是 Cloudflare Dashboard 里面实际存在的 Worker 名字。

---

### 情况 B：你手里已经有 Worker 源代码

例如你手里有：

```text
my-worker/
├── package.json
├── wrangler.jsonc
├── src/
└── ...
```

那么不需要从 Dashboard 拉取，直接把整个项目放到：

```text
~/cloudflare/
```

即可。

---

## 十五、第十四步：进入 Worker 项目

假设本地项目叫：

```text
my-worker
```

执行：

```bash
cd ~/cloudflare/my-worker
```

然后：

```bash
ls -la
```

正常情况下可能看到：

```text
package.json
wrangler.jsonc
src
```

或者：

```text
package.json
wrangler.toml
worker.js
```

不同项目结构可能不同。

---

## 十六、第十五步：检查 Wrangler 配置

优先检查：

```bash
cat wrangler.jsonc
```

如果没有：

```bash
cat wrangler.toml
```

### 一个典型的 `wrangler.jsonc`

例如：

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",

  "name": "my-worker",

  "main": "src/index.js",

  "compatibility_date": "2026-10-02",

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "my-database",
      "database_id": "12345678-1234-1234-1234-123456789abc"
    }
  ]
}
```

这里最重要的是：

```text
name
main
d1_databases
```

以及 D1 下面的：

```text
binding
database_name
database_id
```

---

## 十七、第十六步：理解 D1 Binding

这个概念非常重要。

例如 Wrangler 配置：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "my-database",
    "database_id": "12345678-1234-1234-1234-123456789abc"
  }
]
```

那么 Worker 代码里面通常会通过：

```javascript
env.DB
```

访问这个 D1。

例如：

```javascript
export default {
  async fetch(request, env) {
    const result = await env.DB
      .prepare("SELECT * FROM users")
      .all();

    return Response.json(result);
  }
};
```

这里：

```text
DB
```

必须和配置里的：

```jsonc
"binding": "DB"
```

一致。

### 一个常见错误

配置写：

```jsonc
"binding": "DB"
```

代码却写：

```javascript
env.DATABASE
```

这样 Worker 就找不到对应的 D1 绑定。

所以：

> **先看原来的 Worker 代码，再决定 binding 叫什么。不要随便改。**

---

## 十八、第十七步：备份现有 D1

因为你的 D1 已经创建过了，所以在导入新的数据库之前，建议先备份。

例如：

```bash
npx wrangler d1 export my-database --remote --output=./d1-backup.sql
```

成功以后，你的项目目录里会多出：

```text
d1-backup.sql
```

### 为什么要备份？

假设你的 D1 原来已经存在：

```text
users
settings
messages
```

而你的新 SQL 里又执行：

```sql
CREATE TABLE users ...
```

就有可能发生表已经存在、重复插入等问题。

先备份，至少还有恢复依据。

---

## 十九、第十八步：上传 SQL 数据库

如果你的数据库文件已经是：

```text
database.sql
```

把它放到 Worker 项目目录，例如：

```text
~/cloudflare/my-worker/database.sql
```

然后：

```bash
cd ~/cloudflare/my-worker
```

执行：

```bash
npx wrangler d1 execute 你的D1名称 --remote --file=./database.sql --yes
```

例如：

```bash
npx wrangler d1 execute my-database --remote --file=./database.sql --yes
```

这条命令的意思：

```text
操作 D1
↓
指定数据库
↓
操作远程 Cloudflare D1
↓
读取 database.sql
↓
执行里面的 SQL
```

---

## 二十、 第十九步：如果手里的是 `.db` / `.sqlite` 文件

这一步非常重要。

假设你拿到的是：

```text
database.db
```

或者：

```text
database.sqlite
```

不要直接把它作为 `--file` 上传。

因为 `.db` 是 SQLite 数据库文件本身，而 `wrangler d1 execute --file` 使用的是 SQL 文本。

### 第 1 步：进入数据库文件所在目录

例如：

```bash
cd ~/cloudflare/my-worker
```

### 第 2 步：把 SQLite 导出成 SQL

如果文件叫：

```text
database.db
```

执行：

```bash
sqlite3 database.db ".dump" > database.sql
```

完成后检查：

```bash
ls -lh
```

应该能看到：

```text
database.db
database.sql
```

### 第 3 步：检查 SQL 有没有正常生成

执行：

```bash
head -n 30 database.sql
```

正常情况下可能看到：

```sql
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE ...
INSERT INTO ...
```

如果能看到这些 SQL 内容，就说明转换成功。

### 第 4 步：导入 D1

```bash
npx wrangler d1 execute 你的D1名称 --remote --file=./database.sql --yes
```

例如：

```bash
npx wrangler d1 execute my-database --remote --file=./database.sql --yes
```

---

## 二十一、第二十步：检查 D1 数据

数据库导入之后，建议马上检查表。

执行：

```bash
npx wrangler d1 execute 你的D1名称 --remote --command="SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name;"
```

例如：

```bash
npx wrangler d1 execute my-database --remote --command="SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name;"
```

如果导入成功，可能看到：

```text
users
settings
messages
```

这样就说明：

> D1 不只是“创建成功”，而是已经真正拥有数据库表。

### 再进一步查询某个表

例如有：

```text
users
```

可以：

```bash
npx wrangler d1 execute my-database --remote --command="SELECT * FROM users LIMIT 10;"
```

---

## 二十二、第二十一步：部署 Worker 前先测试

进入 Worker 目录：

```bash
cd ~/cloudflare/my-worker
```

先运行：

```bash
npx wrangler deploy --dry-run
```

这个命令主要用于检查部署过程，而不会直接把 Worker 正式部署上线。

如果这里报错：

> **不要急着正式部署。**

先把错误解决。

---

## 二十三、第二十二步：正式部署 Worker

确认 `--dry-run` 没问题后：

```bash
npx wrangler deploy --keep-vars
```

推荐使用：

```text
--keep-vars
```

因为你的 Worker 如果之前在 Cloudflare Dashboard 中设置过普通环境变量，部署时最好注意不要意外覆盖原来的变量。

部署成功以后，一般会看到 Worker 的 URL，例如：

```text
https://my-worker.example.workers.dev
```

这就表示：

> Worker 已经重新部署。

---

## 二十四、第二十三步：以后怎么更新 Worker

以后就简单很多。

每次打开 Termux：

```bash
proot-distro login ubuntu --shared-home
```

进入项目：

```bash
cd ~/cloudflare/my-worker
```

然后先测试：

```bash
npx wrangler deploy --dry-run
```

确认无误后：

```bash
npx wrangler deploy --keep-vars
```

---

## 更新 D1 数据时

如果新的数据已经是 SQL：

```bash
npx wrangler d1 execute 你的D1名称 --remote --file=./database.sql --yes
```

如果还是 SQLite：

```bash
sqlite3 database.db ".dump" > database.sql
```

然后：

```bash
npx wrangler d1 execute 你的D1名称 --remote --file=./database.sql --yes
```

---

# 二十五、常见问题

## 1. `node: command not found`

检查：

```bash
source ~/.bashrc
```

然后：

```bash
nvm use 24
```

再：

```bash
node -v
```

---

## 2. `nvm: command not found`

执行：

```bash
source ~/.bashrc
```

然后检查：

```bash
nvm --version
```

如果还是不行，可以重新进入 Ubuntu：

```bash
exit
```

再：

```bash
proot-distro login ubuntu --shared-home
```

---

## 3. `wrangler: command not found`

如果你是通过：

```bash
npm install --save-dev wrangler@latest
```

安装的，不要直接输入：

```bash
wrangler
```

而应该：

```bash
npx wrangler
```

例如：

```bash
npx wrangler --version
```

---

## 4. `npx wrangler login` 登录失败

手机环境推荐：

```bash
npx wrangler login --device
```

不要优先折腾本地回调地址。

---

## 5. `d1 list` 看不到我的 D1

先检查：

```bash
npx wrangler whoami
```

确认登录的是正确的 Cloudflare 账号。

然后：

```bash
npx wrangler d1 list
```

如果你的 D1 属于其他 Cloudflare 账号/账户，登录身份不对时自然看不到。

---

## 6. `table already exists`

说明你的 D1 里已经存在这个表。

先备份：

```bash
npx wrangler d1 export 你的D1名称 --remote --output=./d1-backup.sql
```

不要直接乱删表。

如果你不清楚 SQL 文件到底会做什么，可以先打开：

```bash
nano database.sql
```

检查里面的：

```sql
CREATE TABLE
DROP TABLE
INSERT INTO
```

等语句。

---

## 7. `.db` 文件直接导入失败

不要：

```bash
npx wrangler d1 execute xxx --remote --file=database.db
```

正确方法：

```bash
sqlite3 database.db ".dump" > database.sql
```

然后：

```bash
npx wrangler d1 execute xxx --remote --file=database.sql --yes
```

---

## 8. Worker 部署成功，但是网站还是不能用

重点检查：

### D1 binding

配置：

```jsonc
"binding": "DB"
```

代码：

```javascript
env.DB
```

两者是否一致。

### 数据库 ID

检查：

```text
database_id
```

是不是你真正的 D1 ID。

### 数据库名字

检查：

```text
database_name
```

是不是已经存在的 D1。

### 环境变量

如果 Worker 原来在 Dashboard 配置了变量，部署时可以使用：

```bash
npx wrangler deploy --keep-vars
```

---

# 二十六、完整命令速查

## 第一次安装

### Termux

```bash
pkg update
pkg upgrade -y
pkg install proot-distro -y
termux-setup-storage
proot-distro install ubuntu:24.04
proot-distro login ubuntu --shared-home
```

### Ubuntu

```bash
apt update
apt upgrade -y
apt install -y curl ca-certificates git sqlite3 unzip nano
```

### NVM

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 24
nvm use 24
nvm alias default 24
```

### Wrangler

```bash
mkdir -p ~/cloudflare
cd ~/cloudflare
npm init -y
npm install --save-dev wrangler@latest
npx wrangler --version
```

### 登录 Cloudflare

```bash
npx wrangler login --device
```

### 检查账号

```bash
npx wrangler whoami
```

### 查看 D1

```bash
npx wrangler d1 list
```

### 查看 D1 信息

```bash
npx wrangler d1 info 你的D1名称
```

### 获取已有 Worker

```bash
cd ~/cloudflare
npx wrangler init my-worker --from-dash 你的Worker名称
```

### 备份 D1

```bash
cd ~/cloudflare/my-worker
npx wrangler d1 export 你的D1名称 --remote --output=./d1-backup.sql
```

### SQLite 转 SQL

```bash
sqlite3 database.db ".dump" > database.sql
```

### 上传 SQL 到 D1

```bash
npx wrangler d1 execute 你的D1名称 --remote --file=./database.sql --yes
```

### 检查表

```bash
npx wrangler d1 execute 你的D1名称 --remote --command="SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name;"
```

### 查询数据

```bash
npx wrangler d1 execute 你的D1名称 --remote --command="SELECT * FROM users LIMIT 10;"
```

### 部署前检查

```bash
npx wrangler deploy --dry-run
```

### 正式部署

```bash
npx wrangler deploy --keep-vars
```

---

# 二十七、参考资料

- [Fuwari 官方仓库](https://github.com/saicaca/fuwari)
- [Fuwari 官方文章格式说明](https://github.com/saicaca/fuwari/blob/main/src/content/posts/guide/index.md)
- [Cloudflare Wrangler 官方文档](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare D1 官方文档](https://developers.cloudflare.com/d1/)
- [Cloudflare D1 导入/执行 SQL](https://developers.cloudflare.com/d1/reference/cli/)
- [Cloudflare D1 导入 SQLite 数据](https://developers.cloudflare.com/d1/reference/migration-guides/)
- [Termux PRoot-Distro 官方仓库](https://github.com/termux/proot-distro)
- [Node.js 官方网站](https://nodejs.org/)

---

## 最后记住 4 条命令

以后最常用的其实就这几个：

### 进入 Ubuntu

```bash
proot-distro login ubuntu --shared-home
```

### 查看 Cloudflare 登录状态

```bash
npx wrangler whoami
```

### 上传 D1 SQL

```bash
npx wrangler d1 execute 你的D1名称 --remote --file=./database.sql --yes
```

### 部署 Worker

```bash
npx wrangler deploy --keep-vars
```

> **建议第一次操作时严格按照本文顺序执行，不要跳步骤。**
>
> 尤其是 D1：**先确认数据库 → 再备份 → 再导入 → 再检查表 → 最后部署 Worker。**
