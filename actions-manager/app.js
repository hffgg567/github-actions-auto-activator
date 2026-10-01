// GitHub Actions 管理台逻辑
// 自动检测运行模式：本地直连（file://）或 服务端代理（部署在 Vercel）
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const state = { workflows: [], repo: "", apiMode: "direct" };

  // 判断是否部署在 Vercel 服务端模式：页面非 file:// 且同源存在 /api 端点
  function detectMode() {
    if (location.protocol === "file:") {
      state.apiMode = "direct";
      $("modeTag").textContent = "本地直连";
      return;
    }
    // 通过探测 /api/workflows 是否存在来确认服务端模式
    fetch("/api/workflows?owner=test&repo=test", { method: "GET" })
      .then(r => {
        // 400（缺参数）或 500（未配 token）都说明服务端存在
        if (r.status === 400 || r.status === 500 || r.status === 200) {
          state.apiMode = "server";
          $("modeTag").textContent = "服务端模式";
        } else {
          state.apiMode = "direct";
          $("modeTag").textContent = "本地直连";
        }
      })
      .catch(() => {
        state.apiMode = "direct";
        $("modeTag").textContent = "本地直连";
      });
  }

  function showMsg(text, ok) {
    const m = $("msg");
    m.textContent = text;
    m.className = "msg " + (ok ? "ok" : "err");
    setTimeout(() => { m.className = "msg"; }, 6000);
  }

  // 统一 API 调用：根据 apiMode 走浏览器直连或服务端代理
  function apiCall(path, method) {
    if (state.apiMode === "server") {
      return fetch(path, { method: method || "GET" })
        .then(async r => {
          if (r.status === 204) return null;
          const body = await r.text();
          if (!r.ok) {
            let msg = r.status + ": " + r.statusText;
            try { msg = JSON.parse(body).error || JSON.parse(body).message || msg; } catch (e) {}
            throw new Error(msg);
          }
          return body ? JSON.parse(body) : null;
        });
    }
    // 本地直连：直接调 GitHub API
    const token = $("token").value.trim();
    if (!token) return Promise.reject(new Error("请先填写 Token"));
    return fetch(path, {
      method: method || "GET",
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.github+json", "Content-Length": "0" }
    }).then(async r => {
      if (r.status === 204) return null;
      const body = await r.text();
      if (!r.ok) {
        let msg = r.status + ": " + r.statusText;
        try { msg = JSON.parse(body).message || msg; } catch (e) {}
        throw new Error(msg);
      }
      return body ? JSON.parse(body) : null;
    });
  }

  function workflowUrl(action) {
    // 构造目标 URL：本地直连=GitHub API；服务端=同源 /api
    if (state.apiMode === "server") {
      if (action === "list") return `/api/workflows?owner=${encodeURIComponent(state.owner)}&repo=${encodeURIComponent(state.repo)}`;
      if (action === "enable") return `/api/workflow/enable?owner=${encodeURIComponent(state.owner)}&repo=${encodeURIComponent(state.repo)}&id=${state.wfId}`;
      if (action === "disable") return `/api/workflow/disable?owner=${encodeURIComponent(state.owner)}&repo=${encodeURIComponent(state.repo)}&id=${state.wfId}`;
    }
    const owner = state.owner, repo = state.repo;
    if (action === "list") return `https://api.github.com/repos/${owner}/${repo}/actions/workflows?per_page=100`;
    if (action === "enable") return `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${state.wfId}/enable`;
    if (action === "disable") return `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${state.wfId}/disable`;
  }

  async function loadWorkflows() {
    const repo = $("repo").value.trim();
    if (!repo) return showMsg("请填写仓库 (owner/repo)", false);
    const parts = repo.split("/");
    if (parts.length !== 2) return showMsg("仓库格式应为 owner/repo", false);
    state.owner = parts[0]; state.repo = parts[1];
    $("loadState").innerHTML = '<span class="spinner"></span> 加载中…';

    try {
      // 本地直连模式需要处理分页，服务端 /api/workflows 已合并全部分页
      let workflows;
      if (state.apiMode === "server") {
        const data = await apiCall(workflowUrl("list"), "GET");
        workflows = data.workflows;
      } else {
        workflows = [];
        let page = 1, hasNext = true;
        while (hasNext) {
          state.wfId = 0;
          const url = `https://api.github.com/repos/${state.owner}/${state.repo}/actions/workflows?per_page=100&page=${page}`;
          const token = $("token").value.trim();
          const r = await fetch(url, {
            method: "GET",
            headers: { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.github+json" }
          });
          if (!r.ok) {
            const b = await r.text();
            let m = r.status + ": " + r.statusText;
            try { m = JSON.parse(b).message || m; } catch (e) {}
            throw new Error(m);
          }
          const data = await r.json();
          workflows = workflows.concat(data.workflows);
          hasNext = !!(data.links && data.links.next) && workflows.length < data.total_count;
          page++;
        }
      }
      state.workflows = workflows;
      render();
      $("loadState").textContent = `共 ${workflows.length} 个工作流`;
    } catch (e) {
      showMsg("加载失败: " + e.message, false);
      $("loadState").textContent = "";
    }
  }

  async function setEnabled(id, enabled) {
    state.wfId = id;
    const action = enabled ? "enable" : "disable";
    try {
      await apiCall(workflowUrl(action), "PUT");
      showMsg(enabled ? "已启用" : "已禁用", true);
      await loadWorkflows();
    } catch (e) {
      showMsg("操作失败: " + e.message, false);
    }
  }
  window.setEnabled = setEnabled;

  function daysSince(iso) {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  function stateBadge(s) {
    if (s === "active") return `<span class="badge b-active">启用中</span>`;
    if (s === "disabled_manually") return `<span class="badge b-paused">已停用(手动)</span>`;
    if (s === "disabled_schedule") return `<span class="badge b-disabled">已停用(调度)</span>`;
    if (s === "disabled_inactivity") return `<span class="badge b-disabled">已停用(不活跃)</span>`;
    if (s === "disabled") return `<span class="badge b-disabled">已禁用</span>`;
    return `<span class="badge b-disabled">${s}</span>`;
  }

  function render() {
    const threshold = parseInt($("threshold").value || "60", 10);
    const list = $("list");
    if (!state.workflows.length) {
      list.innerHTML = '<div class="empty">该仓库没有工作流</div>';
      return;
    }
    const rows = state.workflows.map(wf => {
      const days = daysSince(wf.updated_at || wf.created_at);
      const paused = wf.state !== "active";
      const overThreshold = paused && days !== null && days > threshold;
      const tag = overThreshold ? `<span class="filter-tag">停用${days}天</span>` : "";
      const daysCell = days !== null ? `<span class="days">${days} 天前</span>` : "—";
      let btn;
      if (wf.state === "active") {
        btn = `<button class="mini-btn disable" onclick="setEnabled(${wf.id}, false)">禁用</button>`;
      } else {
        btn = overThreshold
          ? `<button class="mini-btn enable" onclick="setEnabled(${wf.id}, true)">一键启用</button>`
          : `<button class="mini-btn" onclick="setEnabled(${wf.id}, true)">启用</button>`;
      }
      return `<tr>
        <td><b>${wf.name}</b><br><span class="days">${wf.path}</span></td>
        <td>${stateBadge(wf.state)}</td>
        <td>${daysCell} ${tag}</td>
        <td style="text-align:right">${btn}</td>
      </tr>`;
    }).join("");
    list.innerHTML = `<table class="table">
      <thead><tr>
        <th>工作流</th><th>状态</th><th>最后变更</th><th style="text-align:right">操作</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  async function bulk(action) {
    if (!state.workflows.length) return showMsg("请先加载工作流", false);
    // 批量启用：只处理因 60 天未活动被 GitHub 自动停用的工作流
    const targets = state.workflows.filter(wf =>
      action === "enable" ? wf.state === "disabled_inactivity" : wf.state === "active");
    if (!targets.length) return showMsg("没有可操作的目标", false);
    if (!confirm(`确定对 ${targets.length} 个工作流执行「${action === "enable" ? "启用" : "禁用"}」？`)) return;
    let ok = 0, fail = 0;
    for (const wf of targets) {
      try {
        await setEnabledRaw(wf.id, action === "enable");
        ok++;
      } catch (e) { fail++; }
    }
    showMsg(`完成：成功 ${ok}，失败 ${fail}`, fail === 0);
    await loadWorkflows();
  }

  // 内部：单次启用/禁用（不刷新列表）
  async function setEnabledRaw(id, enabled) {
    state.wfId = id;
    const action = enabled ? "enable" : "disable";
    await apiCall(workflowUrl(action), "PUT");
  }

  function saveToken() {
    const t = $("token").value.trim();
    if (t) localStorage.setItem("gh_token", t);
    const r = $("repo").value.trim();
    if (r) localStorage.setItem("gh_repo", r);
  }
  function loadToken() {
    $("token").value = localStorage.getItem("gh_token") || "";
    $("repo").value = localStorage.getItem("gh_repo") || "";
  }

  $("btnLoad").onclick = () => { saveToken(); loadWorkflows(); };
  $("btnAllEnable").onclick = () => bulk("enable");
  $("btnAllPause").onclick = () => bulk("disable");
  window.addEventListener("load", () => { loadToken(); detectMode(); });
})();
