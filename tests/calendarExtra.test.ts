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

  it("segue nextPageToken: gli eventi di tutte le pagine arrivano, con pageToken nella richiesta successiva", async () => {
    vi.resetModules();
    delete process.env.GOOGLE_EXTRA_CALENDAR_IDS;
    vi.stubEnv("OWNER_NAME", "Ale");
    vi.stubEnv("SUPABASE_URL", "http://localhost");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "x");
    urls.length = 0;
    const pages = [
      { items: [{ id: "a", summary: "A", start: { dateTime: "2026-10-16T10:00:00Z" }, end: { dateTime: "2026-10-16T11:00:00Z" } }], nextPageToken: "p2" },
      { items: [{ id: "b", summary: "Palestra", start: { dateTime: "2026-10-29T10:00:00Z" }, end: { dateTime: "2026-10-29T11:00:00Z" } }] },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: URL | string) => {
        const url = String(u);
        urls.push(url);
        if (url.includes("calendarList")) return { ok: true, status: 200, json: async () => ({ items: [] }) };
        const page = pages[urls.filter((x) => x.includes("/events")).length - 1];
        return { ok: true, status: 200, json: async () => page };
      }),
    );
    const { getEventsInRange } = await import("../src/lib/calendar");
    const events = await getEventsInRange(new Date("2026-10-15T00:00:00Z"), new Date("2026-10-31T00:00:00Z"));
    expect(events.map((e) => e.summary)).toEqual(["A", "Palestra"]);
    const eventUrls = urls.filter((x) => x.includes("/events"));
    expect(eventUrls).toHaveLength(2);
    expect(eventUrls[0]).not.toContain("pageToken");
    expect(eventUrls[1]).toContain("pageToken=p2");
  });

  it("le occorrenze di un evento ricorrente (stesso iCalUID, inizi diversi) restano tutte", async () => {
    vi.resetModules();
    delete process.env.GOOGLE_EXTRA_CALENDAR_IDS;
    vi.stubEnv("OWNER_NAME", "Ale");
    vi.stubEnv("SUPABASE_URL", "http://localhost");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "x");
    const gym = (id: string, day: string) => ({ id, iCalUID: "serie-palestra@google.com", summary: "Palestra", start: { dateTime: `${day}T14:30:00+01:00` }, end: { dateTime: `${day}T16:30:00+01:00` } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: URL | string) => {
        if (String(u).includes("calendarList")) return { ok: true, status: 200, json: async () => ({ items: [] }) };
        return { ok: true, status: 200, json: async () => ({ items: [gym("g_1015", "2026-10-15"), gym("g_1029", "2026-10-29"), gym("g_1031", "2026-10-31")] }) };
      }),
    );
    const { getEventsInRange } = await import("../src/lib/calendar");
    const events = await getEventsInRange(new Date("2026-10-15T00:00:00Z"), new Date("2026-10-31T23:00:00Z"));
    expect(events.map((e) => e.start.slice(0, 10))).toEqual(["2026-10-15", "2026-10-29", "2026-10-31"]);
  });
});
