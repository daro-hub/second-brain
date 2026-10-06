import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase", async () => ({ supabase: (await import("./helpers/memdb")).fakeSupabase }));
vi.mock("../src/lib/dashboard", () => ({
  getDocumentPoints: async () => [],
  getWorkoutStats: async () => ({ totalLogs: 0, totalDocuments: 0 }),
  getWebhookStatus: async () => ({ active: true }),
}));
let listDirImpl: () => Promise<unknown> = async () => [];
vi.mock("../src/lib/university", () => ({ listDir: () => listDirImpl() }));

import { getBrainSnapshot } from "../src/lib/brain";

const uni = async () => (await getBrainSnapshot()).integrations.find((i) => i.id === "university")!;

beforeEach(() => void (listDirImpl = async () => []));
afterEach(() => vi.useRealTimers());

describe("Status di Aira: 'Appunti (GitHub)' prova davvero il repository", () => {
  it("repo raggiungibile → attiva", async () => {
    expect(await uni()).toMatchObject({ ok: true, label: "Appunti (GitHub)" });
  });
  it("il token non vede il repo (404) → spenta, con la causa", async () => {
    listDirImpl = async () => {
      throw new Error("not_found");
    };
    const i = await uni();
    expect(i.ok).toBe(false);
    expect(i.detail).toContain("non vede daro-hub/university");
  });
  it("token rifiutato (401/403) → stessa diagnosi", async () => {
    listDirImpl = async () => {
      throw new Error("GitHub API error: 403");
    };
    expect((await uni()).detail).toContain("non vede daro-hub/university");
  });
  it("GitHub non risponde → spenta dopo 4 secondi, senza bloccare lo Status", async () => {
    vi.useFakeTimers();
    listDirImpl = () => new Promise(() => {});
    const p = uni();
    await vi.advanceTimersByTimeAsync(4100);
    const i = await p;
    expect(i.ok).toBe(false);
    expect(i.detail).toContain("timeout");
  });
});
