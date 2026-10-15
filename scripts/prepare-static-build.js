/**
 * EdgeOne / 纯静态构建辅助脚本
 *
 * 背景：
 *  - 项目默认用 @astrojs/vercel（serverless）与 @astrojs/cloudflare（CF Pages Functions），
 *    这两个平台都能承载 `prerender = false` 的动态路由（api/indexnow、gh/[...path] GitHub 代理）。
 *  - EdgeOne Pages 没有官方 Astro adapter，只能做纯静态部署。静态构建（output: static）
 *    遇到 `prerender = false` 的动态路由会直接报错 [NoAdapterInstalled]。
 *
 * 解决方案：
 *  - EdgeOne / 纯静态构建时，把动态路由文件临时移出 src/pages，让静态构建通过；
 *  - 这些接口在 EdgeOne 上通过手动配置的 Edge Function 承载（见 docs/edgeone-edge-function.js）。
 *  - 构建完成后自动把文件放回，不影响 Vercel / Cloudflare 的构建。
 *
 * 用法：
 *   node scripts/prepare-static-build.js   # 暂移（EdgeOne 构建前）
 *   node scripts/prepare-static-build.js --restore  # 恢复（EdgeOne 构建后）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagesDir = path.join(rootDir, "src", "pages");
const backupDir = path.join(rootDir, "node_modules", ".cache", "firefly-api-backup");

// 需要暂移的动态路由（相对于 src/pages）
const DYNAMIC_ROUTES = ["api/indexnow.ts", "gh/[...path].astro"];

const isRestore = process.argv.includes("--restore");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

try {
  if (isRestore) {
    for (const rel of DYNAMIC_ROUTES) {
      const targetFile = path.join(pagesDir, rel);
      const backupFile = path.join(backupDir, rel);
      if (fs.existsSync(backupFile) && !fs.existsSync(targetFile)) {
        ensureDir(path.dirname(targetFile));
        fs.copyFileSync(backupFile, targetFile);
        fs.rmSync(backupFile, { force: true });
        console.log(`[static-build] ✅ 已恢复 src/pages/${rel}`);
      }
    }
  } else {
    for (const rel of DYNAMIC_ROUTES) {
      const targetFile = path.join(pagesDir, rel);
      if (fs.existsSync(targetFile)) {
        const backupFile = path.join(backupDir, rel);
        ensureDir(path.dirname(backupFile));
        fs.copyFileSync(targetFile, backupFile);
        fs.rmSync(targetFile, { force: true });
        console.log(`[static-build] 🗑️  已暂移 src/pages/${rel}（EdgeOne 静态构建）`);
      }
    }
  }
} catch (err) {
  console.error("[static-build] ❌ 执行失败:", err.message);
  process.exit(1);
}