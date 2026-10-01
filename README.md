# GitHub Actions 自动重新激活 + Web 管理台

解决 GitHub 工作流因 **60 天未活动** 被自动停用（状态 `disabled_inactivity`）后，需要批量/手动重新激活的问题。

包含两部分：

1. **定时批量激活工作流**（`.github/workflows/auto-activate-workflows.yml`）
   - 跨多个仓库扫描
   - 只处理被 GitHub 自动标记为 `disabled_inactivity` 的工作流
   - 支持 DRY_RUN 预览
   - 支持手动触发 + 定时触发

2. **Web 管理台**（`actions-manager/`）
   - 在仓库内嵌入一个网页，手动启动/停止任意 Actions 工作流
   - 高亮显示 `disabled_inactivity` 状态的工作流
   - 一键批量激活所有因不活跃被停用的工作流
   - 支持本地直连（浏览器填 Token）或服务端代理（Vercel 部署）两种模式

---

## 目录结构

```
.github/workflows/auto-activate-workflows.yml   # 定时批量激活工作流
actions-manager/index.html                      # Web 管理台 UI
actions-manager/app.js                          # Web 管理台逻辑
actions-manager/api/workflows.js                # Vercel 服务端：列出工作流
actions-manager/api/workflow/enable.js          # Vercel 服务端：启用工作流
actions-manager/api/workflow/disable.js         # Vercel 服务端：禁用工作流
README.md
```

---

## 一、定时批量激活（跨仓库）

### 工作原理

GitHub 对 60 天未收到任何 `workflow_dispatch` / `schedule` / `push` 等触发的工作流，会自动将其状态改为 `disabled_inactivity`。该工作流本身若处于停用状态则无法被定时触发，因此需要把它放在**一个持续活跃的仓库**里，由它去扫描并激活其他仓库。

- 使用 `GET /repos/{owner}/{repo}/actions/workflows` 列出目标仓库工作流
- 只处理 `state === "disabled_inactivity"` 的工作流
- 使用 `PUT /repos/{owner}/{repo}/actions/workflows/{id}/enable` 重新启用
- `DRY_RUN: true` 时只打印将要激活的列表，不实际执行

### 部署

1. 把 `auto-activate-workflows.yml` 放到一个**会持续触发**的仓库（例如你的控制仓库）的：

   ```
   .github/workflows/auto-activate-workflows.yml
   ```

2. 在仓库 `Settings → Secrets and variables → Actions` 中配置 Token：

   - **仅单仓库**（控制仓库 == 目标仓库）：无需额外配置，使用内置 `GITHUB_TOKEN` 即可
   - **跨仓库**：新建 `BATCH_TOKEN`，内容为对所有目标仓库有 `repo` 权限的 Personal Access Token（PAT）

3. 手动运行一次验证：进入 Actions 页面 → 选择 `Auto-Activate Paused Workflows (Multi-Repo)` → Run workflow。

### 使用参数

手动触发时支持以下输入：

| 参数 | 说明 | 默认值 |
|---|---|---|
| `repos` | 目标仓库列表，每行一个 `owner/repo`。留空 = 仅当前仓库 | （当前仓库） |
| `paused_threshold_days` | 停用天数阈值，超过才激活。GitHub 自动停用一般为 60 天 | `60` |
| `dry_run` | 只报告，不实际激活 | `false` |
| `token` | 跨仓库使用的 PAT，优先级高于 `BATCH_TOKEN` secret | （空） |

### 修改频率

编辑 yml 中的 `on.schedule.cron`：

```yaml
schedule:
  - cron: "0 */12 * * *"   # 每 12 小时一次（UTC）
```

GitHub cron 最小精度为 5 分钟。

---

## 二、Web 管理台

### 功能

- 输入仓库（`owner/repo`）和 Token
- 列出该仓库所有工作流及状态（`active` / `disabled_manually` / `disabled_schedule` / `disabled_inactivity`）
- 高亮显示因不活跃被停用的工作流（`disabled_inactivity`）
- 手动「启用」或「禁用」单个工作流
- 一键「激活不活跃工作流」：批量启用所有 `disabled_inactivity` 状态的工作流
- 一键「全部禁用」：批量禁用所有 `active` 状态的工作流
- Token 保存在浏览器 `localStorage`，不上传服务器

### 两种运行模式

页面会自动探测当前运行环境：

| 模式 | 触发条件 | Token 存放位置 | 适合场景 |
|---|---|---|---|
| 本地直连 | 双击 `index.html`（`file://`）或本地静态服务器 | 浏览器 `localStorage` | 本地使用、个人 |
| 服务端 | 部署在 Vercel，探测到 `/api/workflows` 端点 | 服务端环境变量 `GITHUB_TOKEN` | 团队共享、公开托管 |

### 方式 A：本地打开（最快）

1. 直接用浏览器打开 `actions-manager/index.html`，或启动一个本地静态服务器：

   ```bash
   cd actions-manager
   python3 -m http.server 8080
   ```

2. 浏览器访问 `http://localhost:8080`。
3. 粘贴一个有 `repo` 权限的 PAT，输入仓库，点击「加载工作流」。

> 页面右上角会显示「本地直连」。

### 方式 B：部署到 Vercel（推荐团队使用）

1. 把整个仓库推到 GitHub。
2. 在 Vercel 上 import 该仓库，**Framework 选 `Other`**。
3. 在项目环境变量添加 `GITHUB_TOKEN`（对所有目标仓库有 `repo` 权限的 PAT）。
4. 部署后访问 `https://<你的域名>/actions-manager/`，页面右上角显示「服务端模式」。

部署后 `actions-manager/api/` 目录下的文件会自动变成 Vercel serverless 函数，前端会走 `/api/...` 通道，浏览器无需填写 Token。

### 排错

| 症状 | 处理 |
|---|---|
| 401 Unauthorized | Token 无权限或过期，重新生成 PAT |
| 403 Forbidden | 目标仓库 `Settings → Actions → General` 未勾选 "Allow GitHub Actions"，或 Token 缺少 `repo` 权限 |
| 加载后空列表 | 确认仓库路径写全 `owner/repo`，且仓库有 `.github/workflows/*.yml` |
| 写操作 CORS 报错 | 改用方式 B（Vercel 部署），或确认浏览器允许跨域请求 |
| 模式标签一直「检测中…」 | 页面被 iframe 嵌入时可能探测不到 `/api`；本地直接打开会显示「本地直连」 |

---

## 文件说明

| 文件 | 作用 |
|---|---|
| `.github/workflows/auto-activate-workflows.yml` | 定时批量激活：只处理 `disabled_inactivity`，支持多仓库 + DRY_RUN |
| `actions-manager/index.html` | 管理台 UI |
| `actions-manager/app.js` | 管理台逻辑：自动检测模式、分页加载、启停工作流 |
| `actions-manager/api/workflows.js` | Vercel 服务端：列出工作流（合并分页） |
| `actions-manager/api/workflow/enable.js` | Vercel 服务端：启用工作流 |
| `actions-manager/api/workflow/disable.js` | Vercel 服务端：禁用工作流 |

---

## 相关 GitHub API

- 列出工作流：`GET /repos/{owner}/{repo}/actions/workflows`
- 启用工作流：`PUT /repos/{owner}/{repo}/actions/workflows/{workflow_id}/enable`
- 禁用工作流：`PUT /repos/{owner}/{repo}/actions/workflows/{workflow_id}/disable`

工作流 `state` 字段说明：

- `active`：正常启用
- `disabled_manually`：手动禁用
- `disabled_schedule`：调度禁用
- `disabled_inactivity`：因 60 天未活动被 GitHub 自动停用（本工具主要针对此类）
