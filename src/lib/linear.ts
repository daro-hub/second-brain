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
