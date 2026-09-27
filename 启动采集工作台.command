#!/bin/bash
# 一键启动数据采集工作台（双击即用）
# 流程：检查环境 → 首跑自动安装依赖/构建界面 → 起本机服务 → 打开浏览器。
# 退出：关闭本窗口或按 Ctrl+C，服务随之停止。
set -e
cd "$(dirname "$0")"

# Finder 双击启动时 PATH 不含 Homebrew，兼容 Apple Silicon 与 Intel
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "== 数据采集工作台 =="

if ! command -v node >/dev/null 2>&1; then
  echo "[缺少环境] 未找到 Node.js。"
  echo "请先安装：打开 https://nodejs.org 下载 LTS 版本；或联系技术同学协助。"
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "[缺少环境] 未找到 pnpm。请在终端执行：npm install -g pnpm"
  echo "（或联系技术同学协助）"
  exit 1
fi

# 依赖始终对齐 lockfile（跨机同步代码后依赖可能已变化；pnpm 无变更时秒级跳过）
pnpm install

if [ ! -f apps/workbench/web/dist/index.html ]; then
  echo "[首次运行] 构建工作台界面…"
  pnpm --filter workbench build
fi

PORT="${PORT:-4180}"
SERVER_PID=""

# 已有一个实例在运行时，直接打开浏览器（避免重复起服务撞端口）
if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/api/health"; then
  echo "[提示] 工作台已在运行，直接打开浏览器。"
  open "http://127.0.0.1:$PORT"
  exit 0
fi

cleanup() {
  if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

echo "[启动] 本机服务 http://127.0.0.1:$PORT"
pnpm --filter workbench start &
SERVER_PID=$!

for _ in $(seq 1 60); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/api/health"; then break; fi
  sleep 1
done

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  # 服务进程没起来：多半是已有一个实例在运行
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/api/health"; then
    echo "[提示] 工作台已在运行，直接打开浏览器。"
    SERVER_PID=""
    open "http://127.0.0.1:$PORT"
    exit 0
  fi
  echo "[启动失败] 服务未能启动（端口 $PORT 可能被其他程序占用）。"
  echo "请把本窗口内容截图发给技术同学。"
  exit 1
fi

open "http://127.0.0.1:$PORT"
echo "[就绪] 浏览器已打开；最小化本窗口不影响使用。"

wait "$SERVER_PID"
