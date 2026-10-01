#!/bin/bash
# GitHub Actions 工作流自动激活脚本
# 用法: ./activate_workflows.sh <github_token> <owner> <repo>

set -e

GITHUB_TOKEN="${1:?使用方法: $0 <github_token> <owner> <repo>}"
OWNER="${2:?缺少 owner 参数}"
REPO="${3:?缺少 repo 参数}"

echo "🚀 开始激活 GitHub Actions 工作流"
echo "   仓库: $OWNER/$REPO"
echo ""

# 调用 Python 脚本
python3 github_workflow_activator.py &

# 设置环境变量
export GITHUB_TOKEN="$GITHUB_TOKEN"
export GITHUB_OWNER="$OWNER"
export GITHUB_REPO="$REPO"

# 重新执行 Python 脚本
python3 github_workflow_activator.py
