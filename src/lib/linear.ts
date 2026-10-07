const LINEAR_API = "https://api.linear.app/graphql";

async function query<T>(gql: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: process.env.LINEAR_API_KEY!,
    },
    body: JSON.stringify({ query: gql, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "Linear API error");
  return json.data as T;
}

export interface LinearIssue {
  identifier: string;
  title: string;
  url: string;
  state: string;
  assignee: string | null;
}

export async function searchIssues(term: string, limit = 5): Promise<LinearIssue[]> {
  const data = await query<{
    searchIssues: { nodes: Array<{ identifier: string; title: string; url: string; state: { name: string }; assignee: { name: string } | null }> };
  }>(
    `query($term: String!, $first: Int!) {
      searchIssues(term: $term, first: $first) {
        nodes {
          identifier
          title
          url
          state { name }
          assignee { name }
        }
      }
    }`,
    { term, first: limit },
  );
  return data.searchIssues.nodes.map((n) => ({
    identifier: n.identifier,
    title: n.title,
    url: n.url,
    state: n.state.name,
    assignee: n.assignee?.name ?? null,
  }));
}

export interface WorkActivity {
  updated: number;
  completed: number;
}

/** Issue assegnate a me aggiornate / completate negli ultimi N giorni (proxy dell'attività di lavoro). */
export async function getMyRecentActivity(days = 7): Promise<WorkActivity> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const data = await query<{ viewer: { assignedIssues: { nodes: Array<{ completedAt: string | null }> } } }>(
    `query($since: DateTimeOrDuration!) {
      viewer {
        assignedIssues(first: 100, filter: { updatedAt: { gte: $since } }) {
          nodes { completedAt }
        }
      }
    }`,
    { since },
  );
  const nodes = data.viewer.assignedIssues.nodes;
  return { updated: nodes.length, completed: nodes.filter((n) => n.completedAt && n.completedAt >= since).length };
}

export interface LinearIssueDetail extends LinearIssue {
  description: string | null;
  labels: string[];
  comments: Array<{ author: string | null; body: string; createdAt: string }>;
}

/** Dettaglio di un'issue per identificatore (es. AMU-812): descrizione, label e ultimi commenti. Sola lettura. */
export async function getIssueDetail(identifier: string): Promise<LinearIssueDetail | null> {
  const data = await query<{
    issue: {
      identifier: string;
      title: string;
      url: string;
      description: string | null;
      state: { name: string };
      assignee: { name: string } | null;
      labels: { nodes: Array<{ name: string }> };
      comments: { nodes: Array<{ body: string; createdAt: string; user: { name: string } | null }> };
    } | null;
  }>(
    `query($id: String!) {
      issue(id: $id) {
        identifier
        title
        url
        description
        state { name }
        assignee { name }
        labels { nodes { name } }
        comments(first: 20) { nodes { body createdAt user { name } } }
      }
    }`,
    { id: identifier },
  ).catch((err: Error) => {
    if (/not found|entity not found/i.test(err.message)) return { issue: null };
    throw err;
  });
  const n = data.issue;
  if (!n) return null;
  return {
    identifier: n.identifier,
    title: n.title,
    url: n.url,
    state: n.state.name,
    assignee: n.assignee?.name ?? null,
    description: n.description,
    labels: n.labels.nodes.map((l) => l.name),
    comments: n.comments.nodes.map((c) => ({ author: c.user?.name ?? null, body: c.body, createdAt: c.createdAt })),
  };
}

export interface MyOpenIssue extends LinearIssue {
  /** 0 = nessuna, 1 = urgente, 2 = alta, 3 = media, 4 = bassa (convenzione Linear) */
  priority: number;
  dueDate: string | null;
  cycle: string | null;
  updatedAt: string;
}

/** Issue assegnate a me non ancora chiuse (né completate né annullate). Sola lettura. */
export async function getMyOpenIssues(limit = 50): Promise<MyOpenIssue[]> {
  const data = await query<{
    viewer: {
      assignedIssues: {
        nodes: Array<{
          identifier: string;
          title: string;
          url: string;
          priority: number;
          dueDate: string | null;
          updatedAt: string;
          state: { name: string };
          assignee: { name: string } | null;
          cycle: { name: string | null; number: number } | null;
        }>;
      };
    };
  }>(
    `query($first: Int!) {
      viewer {
        assignedIssues(first: $first, filter: { state: { type: { nin: ["completed", "canceled"] } } }) {
          nodes {
            identifier title url priority dueDate updatedAt
            state { name }
            assignee { name }
            cycle { name number }
          }
        }
      }
    }`,
    { first: limit },
  );
  return data.viewer.assignedIssues.nodes.map((n) => ({
    identifier: n.identifier,
    title: n.title,
    url: n.url,
    state: n.state.name,
    assignee: n.assignee?.name ?? null,
    priority: n.priority,
    dueDate: n.dueDate,
    cycle: n.cycle ? (n.cycle.name ?? `Ciclo ${n.cycle.number}`) : null,
    updatedAt: n.updatedAt,
  }));
}
