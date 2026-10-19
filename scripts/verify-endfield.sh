#!/usr/bin/env bash
# 终末地改造批次的统一验证。用法：bash scripts/verify-endfield.sh
#
# 为什么需要它：astro check 只做类型/语法诊断，**不做打包解析**，
# 因此抓不到 UNRESOLVED_IMPORT 这类只在构建期暴露的错误
# （第 12 轮就因此推出过一次 Failure 部署）。所以 check 与 build 必须一起跑。
set -o pipefail

fail=0

echo "== 1/2 astro check =="
if npx astro check 2>&1 | tail -6; then
  echo "   check: 通过"
else
  echo "   check: 失败"
  fail=1
fi

echo "== 2/2 astro build =="
if npx astro build 2>&1 | tail -4; then
  echo "   build: 通过"
else
  echo "   build: 失败"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "RESULT: FAIL —— 不要推送"
  exit 1
fi
echo "RESULT: PASS —— check 与 build 均通过，可以推送"
