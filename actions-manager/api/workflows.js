// GET /api/workflows?owner=X&repo=Y  —— 列出工作流（走服务端 Token）
export default async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: "未配置 GITHUB_TOKEN" });
  const { owner, repo } = req.query;
  if (!owner || !repo) return res.status(400).json({ error: "缺少 owner/repo" });

  // 处理分页，合并所有页
  const all = [];
  let page = 1, next = true;
  while (next) {
    const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows?per_page=100&page=${page}`;
    const r = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, "Accept": "application/vnd.github+json" },
    });
    if (!r.ok) {
      const b = await r.text();
      return res.status(r.status).json({ error: b.slice(0, 300) });
    }
    const data = await r.json();
    all.push(...data.workflows);
    next = !!(data.links && data.links.next) && all.length < data.total_count;
    page++;
  }
  return res.status(200).json({ workflows: all });
}
