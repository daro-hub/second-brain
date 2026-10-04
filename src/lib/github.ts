const GITHUB_API = "https://api.github.com";

function headers() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "User-Agent": "second-brain-bot",
    Accept: "application/vnd.github+json",
  };
}

export interface RepoSummary {
  name: string;
  description: string | null;
  url: string;
  updatedAt: string;
}

export async function listRepos(): Promise<RepoSummary[]> {
  const username = process.env.GITHUB_USERNAME;
  const res = await fetch(`${GITHUB_API}/user/repos?per_page=100&affiliation=owner`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const repos = (await res.json()) as Array<{
    name: string;
    description: string | null;
    html_url: string;
    updated_at: string;
    owner: { login: string };
  }>;
  return repos
    .filter((r) => !username || r.owner.login.toLowerCase() === username.toLowerCase())
    .map((r) => ({ name: r.name, description: r.description, url: r.html_url, updatedAt: r.updated_at }));
}

export interface RepoInfo extends RepoSummary {
  readmeExcerpt: string | null;
}

export async function getRepoInfo(repoQuery: string): Promise<RepoInfo | null> {
  const username = process.env.GITHUB_USERNAME;
  const repos = await listRepos();
  const q = repoQuery.toLowerCase().trim();
  const match =
    repos.find((r) => r.name.toLowerCase() === q) ??
    repos.find((r) => r.name.toLowerCase().includes(q)) ??
    null;
  if (!match) return null;

  let readmeExcerpt: string | null = null;
  const readmeRes = await fetch(`${GITHUB_API}/repos/${username}/${match.name}/readme`, {
    headers: headers(),
  });
  if (readmeRes.ok) {
    const data = (await readmeRes.json()) as { content: string };
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    readmeExcerpt = content.slice(0, 600);
  }

  return { ...match, readmeExcerpt };
}
