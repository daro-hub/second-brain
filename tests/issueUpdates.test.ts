import { afterEach, describe, expect, it, vi } from "vitest";
import { updateIssue } from "../src/lib/linear";
import { updateRepoIssue } from "../src/lib/github";

afterEach(() => vi.unstubAllGlobals());

const json = (data: unknown, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => data, text: async () => JSON.stringify(data) });

describe("Linear: updateIssue", () => {
  it("risolve il nome dello stato (anche parziale) sul team dell'issue e manda issueUpdate", async () => {
    const calls: { query: string; variables: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      if (body.query.includes("issueUpdate")) return json({ data: { issueUpdate: { success: true, issue: { identifier: "AMU-1", title: "T", url: "u", state: { name: "In Progress" }, assignee: null } } } });
      return json({ data: { issue: { id: "iid", team: { states: { nodes: [{ id: "s1", name: "Todo" }, { id: "s2", name: "In Progress" }] } } } } });
    });
    const out = await updateIssue("AMU-1", { stateName: "progress" });
    expect(out.state).toBe("In Progress");
    expect(calls[1].variables).toEqual({ id: "iid", input: { stateId: "s2" } });
  });

  it("stato inesistente → errore che elenca quelli disponibili, senza chiamare issueUpdate", async () => {
    const fetchMock = vi.fn(async () => json({ data: { issue: { id: "iid", team: { states: { nodes: [{ id: "s1", name: "Todo" }] } } } } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(updateIssue("AMU-1", { stateName: "Boh" })).rejects.toThrow(/disponibili: Todo/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("GitHub: updateRepoIssue", () => {
  it("chiude un'issue con PATCH state=closed sul repo giusto", async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : null });
      if (init?.method === "PATCH") return json({ html_url: "https://github.com/o/r/issues/3", state: "closed" });
      return json([{ name: "r", description: null, html_url: "https://github.com/o/r", updated_at: "2026-10-01T00:00:00Z", homepage: null, private: false, fork: false, archived: false, owner: { login: "o" } }]);
    });
    const out = await updateRepoIssue("r", 3, { state: "closed" });
    expect(out).toEqual({ url: "https://github.com/o/r/issues/3", state: "closed" });
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toMatch(/\/repos\/o\/r\/issues\/3$/);
    expect(patch.body).toEqual({ state: "closed" });
  });
});
