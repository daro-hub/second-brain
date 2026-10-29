import { afterEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });
vi.mock("../src/lib/googleAuth", () => ({ getGoogleAccessToken: async () => "t", hasWorkGoogleAccount: () => false, GoogleAuthError: class extends Error {} }));

const urls: string[] = [];
function stubFetch() {
  urls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: URL | string) => {
      const url = String(u);
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({ items: [] }) };
    }),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});


describe("calendario extra di lavoro", () => {
  it("senza OWNER_NAME si legge anche il calendario di lavoro di Francesco (comportamento di sempre)", async () => {
    // la variabile vuota di vi.stubEnv vale «impostata»: qui serve proprio non impostata
    vi.resetModules();
    delete process.env.GOOGLE_EXTRA_CALENDAR_IDS;
    delete process.env.OWNER_NAME;
    vi.stubEnv("SUPABASE_URL", "http://localhost");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "x");
    stubFetch();
    const { getEventsInRange } = await import("../src/lib/calendar");
    await getEventsInRange(new Date("2026-10-30T00:00:00Z"), new Date("2026-10-31T00:00:00Z"));
    expect(urls.join("\n")).toContain(encodeURIComponent("francesco.darin@amuseapp.it"));
  });

  it("con OWNER_NAME (un altro deploy) non si prova a leggere il suo calendario di lavoro", async () => {
    vi.resetModules();
    delete process.env.GOOGLE_EXTRA_CALENDAR_IDS;
    vi.stubEnv("OWNER_NAME", "Ale");
    vi.stubEnv("SUPABASE_URL", "http://localhost");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "x");
    stubFetch();
    const { getEventsInRange } = await import("../src/lib/calendar");
    await getEventsInRange(new Date("2026-10-30T00:00:00Z"), new Date("2026-10-31T00:00:00Z"));
    const all = urls.join("\n");
    expect(all).toContain("/calendars/primary/events");
    expect(all).not.toContain("amuseapp");
  });
});
