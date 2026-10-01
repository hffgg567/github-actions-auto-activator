#!/usr/bin/env python3
"""
GitHub Actions 工作流自动激活工具
自动查找并激活已暂停的 GitHub Actions 工作流
"""

import os
import sys
import json
import requests
from datetime import datetime
from typing import Optional


class GitHubWorkflowActivator:
    """GitHub Actions 工作流激活器"""

    def __init__(self, token: str, owner: str, repo: str):
        self.token = token
        self.owner = owner
        self.repo = repo
        self.base_url = f"https://api.github.com/repos/{owner}/{repo}"
        self.headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "GitHub-Workflow-Activator"
        }

    def get_workflows(self) -> list:
        """获取仓库中的所有工作流"""
        url = f"{self.base_url}/actions/workflows"
        response = requests.get(url, headers=self.headers)

        if response.status_code != 200:
            raise Exception(f"获取工作流失败: {response.status_code} - {response.text}")

        workflows = response.json().get("workflows", [])
        return workflows

    def get_workflow_runs(self, workflow_id: int, status: str = "paused") -> list:
        """获取特定工作流的运行记录"""
        url = f"{self.base_url}/actions/workflows/{workflow_id}/runs"
        params = {"status": status, "per_page": 100}
        response = requests.get(url, headers=self.headers, params=params)

        if response.status_code != 200:
            return []

        return response.json().get("workflow_runs", [])

    def enable_workflow(self, workflow_id: int) -> bool:
        """启用指定的工作流"""
        url = f"{self.base_url}/actions/workflows/{workflow_id}/enable"
        response = requests.put(url, headers=self.headers)

        if response.status_code in [200, 204]:
            return True
        else:
            print(f"  ✗ 启用失败: {response.status_code} - {response.text}")
            return False

    def find_paused_workflows(self) -> list:
        """查找已暂停的工作流"""
        workflows = self.get_workflows()
        paused_workflows = []

        for workflow in workflows:
            if workflow.get("state") == "disabled_manually":
                paused_workflows.append({
                    "id": workflow["id"],
                    "name": workflow["name"],
                    "path": workflow["path"],
                    "state": workflow["state"]
                })

        return paused_workflows

    def activate_all_paused(self) -> dict:
        """激活所有已暂停的工作流"""
        result = {
            "total_found": 0,
            "activated": 0,
            "failed": 0,
            "details": []
        }

        print(f"\n🔍 正在扫描仓库: {self.owner}/{self.repo}")
        print("=" * 60)

        # 获取所有工作流
        workflows = self.get_workflows()
        result["total_found"] = len(workflows)

        # 查找已暂停的工作流
        paused_workflows = self.find_paused_workflows()

        if not paused_workflows:
            print("✅ 没有找到已暂停的工作流")
            return result

        print(f"📋 发现 {len(paused_workflows)} 个已暂停的工作流:\n")

        # 逐个激活
        for workflow in paused_workflows:
            print(f"📌 {workflow['name']}")
            print(f"   路径: {workflow['path']}")
            print(f"   ID: {workflow['id']}")

            if self.enable_workflow(workflow["id"]):
                print(f"   ✅ 已激活\n")
                result["activated"] += 1
                result["details"].append({
                    "name": workflow["name"],
                    "id": workflow["id"],
                    "status": "activated"
                })
            else:
                print(f"   ✗ 激活失败\n")
                result["failed"] += 1
                result["details"].append({
                    "name": workflow["name"],
                    "id": workflow["id"],
                    "status": "failed"
                })

        return result

    def activate_by_name(self, workflow_name: str) -> bool:
        """根据名称激活指定工作流"""
        workflows = self.get_workflows()

        for workflow in workflows:
            if workflow_name.lower() in workflow["name"].lower():
                print(f"📌 找到工作流: {workflow['name']} (ID: {workflow['id']})")
                return self.enable_workflow(workflow["id"])

        print(f"✗ 未找到匹配的工作流: {workflow_name}")
        return False


def main():
    """主函数"""
    # 从环境变量获取配置
    token = os.environ.get("GITHUB_TOKEN")
    owner = os.environ.get("GITHUB_OWNER")
    repo = os.environ.get("GITHUB_REPO")

    # 如果没有环境变量，尝试从参数获取
    if not all([token, owner, repo]):
        print("❌ 缺少必要的环境变量")
        print("\n请设置以下环境变量:")
        print("  GITHUB_TOKEN    - GitHub Personal Access Token (需要 repo 权限)")
        print("  GITHUB_OWNER    - 仓库所有者用户名或组织名")
        print("  GITHUB_REPO     - 仓库名称")
        print("\n示例:")
        print('  export GITHUB_TOKEN=ghp_xxxxxxxxxxxx')
        print('  export GITHUB_OWNER=your-username')
        print('  export GITHUB_REPO=your-repo')
        sys.exit(1)

    # 创建激活器
    activator = GitHubWorkflowActivator(token, owner, repo)

    # 执行激活
    try:
        result = activator.activate_all_paused()

        # 输出结果摘要
        print("\n" + "=" * 60)
        print("📊 执行结果:")
        print(f"   发现工作流总数: {result['total_found']}")
        print(f"   成功激活: {result['activated']}")
        print(f"   激活失败: {result['failed']}")

        if result["details"]:
            print("\n📝 详细记录:")
            for detail in result["details"]:
                status_icon = "✅" if detail["status"] == "activated" else "✗"
                print(f"   {status_icon} {detail['name']}")

        sys.exit(0 if result["failed"] == 0 else 1)

    except Exception as e:
        print(f"\n❌ 执行失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
