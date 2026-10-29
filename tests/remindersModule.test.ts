import { afterEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });
const getEventsInRange = vi.fn(async () => {
  throw new Error("Google non dovrebbe essere chiamato");
});
vi.mock("../src/lib/calendar", () => ({ getEventsInRange, isStudySyncEvent: () => false }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  getEventsInRange.mockClear();
});

async function load(disabled: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DISABLED_MODULES", disabled);
  vi.stubEnv("SUPABASE_URL", "http://localhost");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "x");
  return import("../src/lib/reminders");
}

describe("promemoria degli eventi senza il modulo calendario", () => {
  it("con calendar spento non interroga Google e non ritorna nulla (il cron non va in errore)", async () => {
    const { collectReminders } = await load("calendar");
    await expect(collectReminders(new Date())).resolves.toEqual([]);
    expect(getEventsInRange).not.toHaveBeenCalled();
  });

  it("con calendar acceso interroga il calendario come prima", async () => {
    const { collectReminders } = await load("");
    await expect(collectReminders(new Date())).rejects.toThrow("Google non dovrebbe");
    expect(getEventsInRange).toHaveBeenCalledOnce();
  });
});
