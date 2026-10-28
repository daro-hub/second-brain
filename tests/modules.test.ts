import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// DISABLED si legge una volta al caricamento del modulo: ogni test lo reimporta con l'ambiente che vuole.
async function load(disabled: string | undefined) {
  vi.resetModules();
  if (disabled === undefined) vi.stubEnv("NEXT_PUBLIC_DISABLED_MODULES", "");
  else vi.stubEnv("NEXT_PUBLIC_DISABLED_MODULES", disabled);
  vi.stubEnv("SUPABASE_URL", "http://localhost");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "x");
  vi.stubEnv("OPENAI_API_KEY", "x");
  return {
    modules: await import("../src/lib/modules"),
    intent: await import("../src/lib/intent"),
    registry: await import("../src/lib/tools/registry"),
    siteData: await import("../src/lib/siteData"),
  };
}

const HER = "calendar,email,github,linear,slack,bitwarden,work,uni,worker,mcp,widget,webchat";

// il primo import a freddo (registro strumenti, OpenAI, Supabase) con la suite in parallelo supera i 5 s di default
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

describe("moduli spegnibili: senza variabile non cambia nulla (deploy di Francesco)", () => {
  it("tutto acceso", async () => {
    const { modules, registry } = await load(undefined);
    for (const m of modules.MODULES) expect(modules.isEnabled(m)).toBe(true);
    expect(modules.moduleGate("mcp")).toBeNull();
    const names = registry.TOOLS.map((t) => t.name);
    for (const n of ["calendar_add", "email_search", "github_repos", "linear_search", "slack_search", "work_hours", "university"]) expect(names).toContain(n);
  });
});

describe("moduli spegnibili: l'installazione senza lavoro, integrazioni aziendali e chat web", () => {
  it("le route dei moduli spenti rispondono 404", async () => {
    const { modules } = await load(HER);
    expect(modules.moduleGate("mcp")?.status).toBe(404);
    expect(modules.moduleGate("webchat")?.status).toBe(404);
  });

  it("gli strumenti dei moduli spenti spariscono da bot e MCP, quelli di palestra, spesa e promemoria restano", async () => {
    const { registry } = await load(HER);
    const names = registry.TOOLS.map((t) => t.name);
    for (const n of names) expect(n, n).not.toMatch(/^(calendar_|email_|github_|linear_|slack_|work_|uni_|university$)/);
    for (const n of ["gym_last_session", "gym_pr", "shopping_add", "reminder_add", "health_metric", "steps", "strava_activities", "mood_set", "kb_search", "site_data"]) expect(names).toContain(n);
  });

  it("un intento di un modulo spento diventa «unsupported»", async () => {
    const { intent } = await load(HER);
    for (const i of [
      { type: "calendar_query", startDate: null, endDate: null },
      { type: "email_query", query: "x" },
      { type: "github_query", repoName: "x" },
      { type: "linear_query", term: "x" },
      { type: "slack_query", term: "x" },
      { type: "password_request", itemName: "x" },
      { type: "study_schedule_query", date: "2026-10-28" },
      { type: "life_log", kind: "work", area: null, minutes: 60, note: "x", date: null },
    ] as const) {
      expect(intent.gateIntent(i).type, i.type).toBe("unsupported");
    }
  });

  it("gli intenti che restano non vengono toccati, il promemoria perde solo il calendario", async () => {
    const { intent } = await load(HER);
    const shop = { type: "shopping_add" as const, items: ["latte"] };
    expect(intent.gateIntent(shop)).toBe(shop);
    const social = { type: "life_log", kind: "social", area: null, minutes: null, note: "x", date: null } as const;
    expect(intent.gateIntent(social)).toBe(social);
    const rem = { type: "reminder_add", text: "x", date: null, time: null, inMinutes: null, calendar: true } as const;
    expect(intent.gateIntent(rem)).toEqual({ ...rem, calendar: false });
  });

  it("site_query: via gli argomenti di lavoro e studio; se non resta nulla è «unsupported»", async () => {
    const { intent, siteData } = await load(HER);
    expect(siteData.activeSiteTopics(["studio", "lavoro", "universita", "umore", "oggi"])).toEqual(["umore", "oggi"]);
    expect(intent.gateIntent({ type: "site_query", topics: ["lavoro", "umore"], date: null })).toEqual({ type: "site_query", topics: ["umore"], date: null });
    expect(intent.gateIntent({ type: "site_query", topics: ["lavoro", "studio"], date: null }).type).toBe("unsupported");
  });

  it("i pilastri Studio e Lavoro non ci sono più", async () => {
    const { modules } = await load(HER);
    expect(["studio", "salute", "allenamento", "umore", "lavoro"].filter(modules.pillarEnabled)).toEqual(["salute", "allenamento", "umore"]);
  });
});
