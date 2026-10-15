#!/usr/bin/env node
/**
 * 构建前同步友链数据。
 *
 * 数据源：GitHub 仓库 LegspCpd/friends 的 friends.json
 * 策略：**失败绝不中断构建** —— 拉取失败时保留仓库里上一次成功的数据，只打印醒目警告。
 *
 * 环境变量：
 *   FRIENDS_REPO   默认 LegspCpd/friends
 *   FRIENDS_REF    默认 main
 *   FRIENDS_TOKEN  可选；GitHub fine-grained token（只读 contents）。缺失时退回匿名请求。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "data", "friends.json");
const REPO = process.env.FRIENDS_REPO || "LegspCpd/friends";
const REF = process.env.FRIENDS_REF || "main";
const TOKEN = process.env.FRIENDS_TOKEN || "";
const TIMEOUT_MS = 10000;
const RETRIES = 2;

const LIMITS = { name: 60, description: 200, tag: 20, tags: 5 };

function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
function isHttpUrl(v) {
  if (!isNonEmptyString(v)) return false;
  try { const u = new URL(v); return u.protocol === "http:" || u.protocol === "https:"; }
  catch (e) { return false; }
}

/** 与友链仓 build.js 同一套规则（此处重复实现，因为跨仓库无法共享代码） */
function validateEntry(d) {
  const errs = [];
  if (!d || typeof d !== "object" || Array.isArray(d)) return ["不是 JSON 对象"];
  if (!isNonEmptyString(d.name)) errs.push("name 缺失或为空");
  else if (d.name.length > LIMITS.name) errs.push("name 过长");
  if (!(d.avatar === null || typeof d.avatar === "string")) errs.push("avatar 必须是字符串或 null");
  else if (typeof d.avatar === "string" && !isHttpUrl(d.avatar)) errs.push("avatar 不是 http(s) URL");
  if (d.description !== undefined && typeof d.description !== "string") errs.push("description 必须是字符串");
  if (!isHttpUrl(d.url)) errs.push("url 缺失或不是 http(s) URL");
  if (d.vip !== undefined && typeof d.vip !== "boolean") errs.push("vip 必须是布尔");
  return errs;
}

function validatePayload(list) {
  if (!Array.isArray(list)) return ["顶层不是数组"];
  if (list.length === 0) return ["列表为空"];
  const errs = [];
  const seen = new Set();
  list.forEach(function (d, i) {
    const e = validateEntry(d);
    if (e.length) errs.push("第 " + (i + 1) + " 条：" + e.join("；"));
    else {
      const k = d.url.replace(/\/+$/, "").toLowerCase();
      if (seen.has(k)) errs.push("第 " + (i + 1) + " 条：url 重复 " + d.url);
      seen.add(k);
    }
  });
  return errs;
}

async function fetchOnce(url, headers) {
  const ctl = new AbortController();
  const timer = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: headers, signal: ctl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
  } finally { clearTimeout(timer); }
}

async function fetchWithRetry(label, url, headers) {
  for (let i = 1; i <= RETRIES; i++) {
    try {
      const text = await fetchOnce(url, headers);
      return { ok: true, text: text, source: label };
    } catch (e) {
      console.warn("   ⚠ " + label + " 第 " + i + " 次失败：" + e.message);
    }
  }
  return { ok: false, source: label };
}

function authHeaders(extra) {
  const h = Object.assign({ "User-Agent": "legspcpd-blog-build" }, extra || {});
  if (TOKEN) h.Authorization = "Bearer " + TOKEN;
  return h;
}

function readExisting() {
  if (!fs.existsSync(OUT)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(OUT, "utf8"));
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) { return null; }
}

async function main() {
  console.log("\n🔗 同步友链数据 ← " + REPO + "@" + REF);

  const attempts = [
    { label: "GitHub API", url: "https://api.github.com/repos/" + REPO + "/contents/friends.json?ref=" + REF,
      headers: authHeaders({ Accept: "application/vnd.github.raw" }) },
    { label: "raw.githubusercontent", url: "https://raw.githubusercontent.com/" + REPO + "/" + REF + "/friends.json",
      headers: authHeaders({}) },
  ];

  for (const a of attempts) {
    const r = await fetchWithRetry(a.label, a.url, a.headers);
    if (!r.ok) continue;
    let data;
    try { data = JSON.parse(r.text); }
    catch (e) { console.warn("   ⚠ " + a.label + " 返回的不是合法 JSON，跳过"); continue; }
    const errs = validatePayload(data);
    if (errs.length) {
      console.warn("   ⚠ " + a.label + " 数据未通过校验，跳过：");
      errs.slice(0, 5).forEach(function (m) { console.warn("      - " + m); });
      continue;
    }
    const next = JSON.stringify(data, null, 2) + "\n";
    const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (next === prev) {
      console.log("   ✓ 无变化（" + data.length + " 条），来源 " + r.source);
    } else {
      W_OK: {
        fs.mkdirSync(path.dirname(OUT), { recursive: true });
        fs.writeFileSync(OUT, next, "utf8");
      }
      console.log("   ✓ 已更新（" + data.length + " 条），来源 " + r.source);
    }
    return;
  }

  const existing = readExisting();
  if (existing && existing.length > 0) {
    console.warn("\n   ⚠⚠ 所有数据源都失败了，继续使用仓库里已有的数据（" + existing.length + " 条）。");
    console.warn("   ⚠⚠ 若刚合并了新友链，本次构建不会包含它。\n");
    return;
  }
  console.error("\n   ❌ 拉取失败，且仓库里没有可用的 src/data/friends.json —— 无法继续。\n");
  process.exit(1);
}

main().catch(function (e) {
  console.error("\n   ❌ 同步脚本异常：" + (e && e.message ? e.message : String(e)));
  const existing = readExisting();
  if (existing && existing.length > 0) {
    console.warn("   ⚠ 继续使用已有数据（" + existing.length + " 条）\n");
    process.exit(0);
  }
  process.exit(1);
});
