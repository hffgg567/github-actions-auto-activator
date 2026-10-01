// PUT /api/workflow/enable?owner=X&repo=Y&id=N  —— 启用工作流
export default async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: "未配置 GITHUB_TOKEN" });
  const { owner, repo, id } = req.query;
  if (!owner || !repo || !id) return res.status(400).json({ error: "缺少参数" });

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${id}/enable`;
  const r = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Accept": "application/vnd.github+json", "Content-Length": "0" },
  });
  const body = r.status === 204 ? "" : await r.text();
  res.status(r.status);
  res.setHeader("Content-Type", "application/json");
  return res.end(body || "{}");
}
