/**
 * EdgeOne（纯静态）构建脚本
 *
 * 串起：暂移动态路由 -> 生成 GitHub 卡片数据 -> LQIP -> VNDB 封面
 *      -> astro 静态构建 -> 看板娘资源裁剪 -> 字体子集 -> 内联脚本压缩
 *      -> pagefind 索引 -> IndexNow 推送 -> 恢复动态路由
 *
 * 使用 try/finally 确保无论构建是否成功都会恢复被暂移的动态路由文件，避免污染工作区。
 * 说明：合并上游 Astro 7 后，原先的 scripts/generate-icons.js 已被上游移除
 *      （图标数据改由提交在仓库里的 src/constants/icons-data.json 提供），
 *      站内搜索改由上游 scripts/run-pagefind.ts 统一处理。
 *
 * 用法：
 *   node scripts/build-edgeone.js
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 直接用 node 执行各 CLI 的 JS 入口，避免 Windows 下 shell 解析 .cmd / 带空格路径的问题
const tsxCli = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const astroCli = path.join(rootDir, "node_modules", "astro", "bin", "astro.mjs");

function run(cmd, args, extraEnv = {}) {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ...extraEnv },
  });
  return result.status ?? 1;
}

// 支持 OUT_DIR 覆盖（默认为 dist），便于无痛验证
const outDir = process.env.OUT_DIR || "dist";
const prepareStatic = path.join(rootDir, "scripts", "prepare-static-build.js");

function tsx(relativeScript, extraEnv = {}) {
  return run(process.execPath, [tsxCli, path.join(rootDir, relativeScript)], extraEnv);
}

function main() {
  // 1. 暂移动态路由（indexnow / gh 代理）——EdgeOne 用 Edge Function 承载
  const prepStatus = run(process.execPath, [prepareStatic]);
  if (prepStatus !== 0) process.exit(prepStatus);

  try {
    // 2. 构建前置脚本
    let status = tsx("scripts/generate-github-card-data.ts");
    if (status !== 0) process.exit(status);

    status = tsx("scripts/generate-lqips.ts");
    if (status !== 0) process.exit(status);

    status = tsx("scripts/generate-vndb-covers.ts");
    if (status !== 0) process.exit(status);

    // 2.5 同步外部友链数据（网络失败会沿用已有数据并返回 0；只有完全无数据才失败）
    status = run(process.execPath, [path.join(rootDir, "scripts", "sync-friends.mjs")]);
    if (status !== 0) process.exit(status);

    // 3. astro 纯静态构建
    status = run(process.execPath, [astroCli, "build"], {
      DEPLOY_TARGET: "static",
      OUT_DIR: outDir,
    });
    if (status !== 0) process.exit(status);

    // 4. 构建后处理：看板娘裁剪 -> 字体子集 -> 内联脚本压缩
    status = tsx("scripts/prune-pio-assets.ts");
    if (status !== 0) process.exit(status);

    status = tsx("scripts/subset-fonts.ts");
    if (status !== 0) process.exit(status);

    status = tsx("scripts/minify-inline-scripts.ts");
    if (status !== 0) process.exit(status);

    // 5. 站内搜索索引（pagefind，自动探测 dist / dist/client）
    status = tsx("scripts/run-pagefind.ts");
    if (status !== 0) process.exit(status);

    // 6. IndexNow 推送（可选，失败不影响构建产物）
    run(process.execPath, [path.join(rootDir, "scripts", "ping-indexnow.js")]);
  } finally {
    // 7. 无论成败都恢复动态路由，保证工作区干净
    run(process.execPath, [prepareStatic, "--restore"]);
  }
}

main();
