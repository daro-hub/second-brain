import { matchRepo } from "./projects";

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
  /** campo "Website" del repository (di solito l'indirizzo online su Vercel) */
  homepage: string | null;
  private: boolean;
  fork: boolean;
  archived: boolean;
  owner: string;
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
    homepage: string | null;
    private: boolean;
    fork: boolean;
    archived: boolean;
    owner: { login: string };
  }>;
  return repos
    .filter((r) => !username || r.owner.login.toLowerCase() === username.toLowerCase())
    .map((r) => ({
      name: r.name,
      description: r.description,
      url: r.html_url,
      updatedAt: r.updated_at,
      homepage: r.homepage?.trim() ? r.homepage.trim() : null,
      private: r.private,
      fork: r.fork,
      archived: r.archived,
      owner: r.owner.login,
    }));
}

export interface RepoInfo extends RepoSummary {
  readmeExcerpt: string | null;
  /** indirizzo online: il campo Website del repo, altrimenti l'ultimo deploy di produzione registrato da Vercel */
  liveUrl: string | null;
}

/** Indirizzo online di un repository. Non lancia mai: senza deploy né sito risponde null. */
export async function resolveLiveUrl(repo: Pick<RepoSummary, "name" | "owner" | "homepage">): Promise<string | null> {
  if (repo.homepage && /^https?:\/\//i.test(repo.homepage)) return repo.homepage;
  try {
    const dep = await fetch(`${GITHUB_API}/repos/${repo.owner}/${repo.name}/deployments?environment=Production&per_page=1`, { headers: headers() });
    if (!dep.ok) return null;
    const [first] = (await dep.json()) as Array<{ statuses_url: string }>;
    if (!first) return null;
    const st = await fetch(`${first.statuses_url}?per_page=1`, { headers: headers() });
    if (!st.ok) return null;
    const [status] = (await st.json()) as Array<{ state: string; environment_url?: string }>;
    return status?.state === "success" && status.environment_url ? status.environment_url : null;
  } catch {
    return null;
  }
}

/** Repository pubblici (niente privati, fork o archiviati) con il loro indirizzo online, dal più recente. */
export async function listPublicProjects(limit = 12): Promise<(RepoSummary & { liveUrl: string | null })[]> {
  const repos = (await listRepos())
    .filter((r) => !r.private && !r.fork && !r.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
  return Promise.all(repos.map(async (r) => ({ ...r, liveUrl: await resolveLiveUrl(r) })));
}

export async function getRepoInfo(repoQuery: string): Promise<RepoInfo | null> {
  const repos = await listRepos();
  const match = matchRepo(repos, repoQuery);
  if (!match) return null;
  const username = match.owner;

  let readmeExcerpt: string | null = null;
  const readmeRes = await fetch(`${GITHUB_API}/repos/${username}/${match.name}/readme`, {
    headers: headers(),
  });
  if (readmeRes.ok) {
    const data = (await readmeRes.json()) as { content: string };
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    readmeExcerpt = content.slice(0, 600);
  }

  return { ...match, readmeExcerpt, liveUrl: await resolveLiveUrl(match) };
}
