# GitHub Actions 自动重新激活 + Web 管理台（GitHub Pages）

解决 GitHub 工作流因 **60 天未活动** 被自动停用（状态 `disabled_inactivity`）后，需要批量/手动重新激活的问题。

- **定时自动激活**：跨仓库扫描，重新启用 `disabled_inactivity` 的工作流。
- **Web 管理台**：由 **GitHub Pages** 静态托管，纯前端，浏览器直连 GitHub API。可在网页上配置定时激活参数，或手动启停任意工作流——**无需任何后端服务器**。
- 配置保存在仓库的 `config.json`，网页可直接读写。

---

## 目录结构

```
docs/index.html                               # Web 管理台（单文件，GitHub Pages 托管）
config.json                                   # 网页写入的配置文件
.github/workflows/auto-activate-workflows.yml # 定时批量激活工作流（读取 config.json）
.nojekyll                                     # 让 GitHub Pages 不运行 Jekyll
README.md
```

---

## 一、部署 GitHub Pages

1. 将本仓库推送到 GitHub（main 分支）。
2. 进入仓库 `Settings → Pages`：
   - **Source** 选择 `Deploy from a branch`
   - **Branch** 选择 `main`，目录选 `/docs`
   - 点击 **Save**
3. 几分钟后访问：`https://<你的用户名>.github.io/<仓库名>/`
   （例如 `https://hffgg567.github.io/github-actions-auto-activator/`）

> 页面会自动从 URL 推断「控制仓库」（即存放 config.json 的这个仓库），无需手动填写。

---

## 二、使用 Web 管理台

打开页面后三步即可：

### ① 连接
- **控制仓库**：默认自动填充（来自页面 URL），可改。
- **Token**：填入有 `repo` 权限的 Personal Access Token（PAT）。
  - 需要 `repo` scope（用于读写 config.json、触发工作流、启停工作流）。
  - Token 仅保存在浏览器 `localStorage`，不上传任何服务器。
- 点「连接并加载配置」。

### ② 定时自动激活配置
- 勾选 **启用定时自动激活**。
- **目标仓库**：每行一个 `owner/repo`（要被扫描并激活的仓库）。
- **停用阈值**：默认 60 天（GitHub 自动停用的标准时长）。
- **检查频率**：每 6 / 12 小时 / 每天。
- 点「**保存配置到仓库**」→ 写入 `config.json`，并同步更新 `auto-activate-workflows.yml` 的 cron。
- 点「**立即运行一次**」→ 通过 workflow_dispatch 立刻触发一次扫描（用于验证）。

### ③ 手动管理（任意仓库）
- 填任意 `owner/repo`，点「加载工作流」。
- 列表显示每个工作流的状态（`active` / `disabled_manually` / `disabled_schedule` / `disabled_inactivity`）。
- 单个「启用 / 禁用」按钮，或「一键激活全部『不活跃停用』」。
- 注意：手动管理也只把 `disabled_inactivity` 高亮为可一键恢复；其他状态按需手动操作。

---

## 三、定时激活工作原理

- 工作流因 60 天无活动被 GitHub 自动标记为 `disabled_inactivity`。
- `.github/workflows/auto-activate-workflows.yml` 按设定频率运行：
  - 读取根目录 `config.json` 得到目标仓库、阈值、是否启用。
  - 只处理 `state === "disabled_inactivity"` 的工作流。
  - 用 `PUT /repos/{owner}/{repo}/actions/workflows/{id}/enable` 重新启用。
- 配置优先级：手动 `workflow_dispatch` 输入 > `config.json` > 仅当前仓库。
- 若 `config.json` 中 `enabled: false`，定时触发时自动跳过（手动触发仍会运行）。
- `DRY_RUN`：可在手动触发时勾选「只报告不实际激活」。

---

## 四、权限说明

| 场景 | Token 要求 |
|---|---|
| 管理**本仓库**（控制仓库 == 目标仓库） | 内置 `GITHUB_TOKEN` 即可（Actions 内）；网页手动管理需 PAT `repo` |
| 管理**其他仓库**（跨仓库） | 需要一个对所有目标仓库有 `repo` 权限的 PAT，存入 Secrets 的 `BATCH_TOKEN` |

> 网页「手动管理」和「保存配置」都需要你自己的 PAT（因为纯前端，没有服务端代持 Token）。

---

## 五、安全提醒

- PAT 仅存于浏览器本地，不会发送到除 `api.github.com` 以外的任何地方。
- 建议用**专用、最小权限**的 PAT，用完后可随时在 GitHub 撤销。
- 公开仓库的 GitHub Pages 页面任何人都能访问，但**没有你的 PAT 无法操作任何仓库**。
- 若担心 localStorage，可在浏览器设置中清除站点数据。

---

## 文件说明

| 文件 | 作用 |
|---|---|
| `docs/index.html` | 单文件 Web 管理台（配置 + 手动管理，纯前端） |
| `config.json` | 网页写入的配置（启停开关、目标仓库、阈值、频率） |
| `.github/workflows/auto-activate-workflows.yml` | 定时批量激活，读取 config.json |
| `.nojekyll` | 关闭 GitHub Pages 的 Jekyll 处理 |

---

## 相关 GitHub API

- 列出工作流：`GET /repos/{owner}/{repo}/actions/workflows`
- 启用工作流：`PUT /repos/{owner}/{repo}/actions/workflows/{id}/enable`
- 禁用工作流：`PUT /repos/{owner}/{repo}/actions/workflows/{id}/disable`
- 读取/写入文件：`GET/PUT /repos/{owner}/{repo}/contents/{path}`
- 手动触发：`POST /repos/{owner}/{repo}/actions/workflows/{file}/dispatches`

工作流 `state` 字段：
- `active`：正常启用
- `disabled_manually`：手动禁用
- `disabled_schedule`：调度禁用
- `disabled_inactivity`：因 60 天未活动被 GitHub 自动停用（本工具主要针对此类）
