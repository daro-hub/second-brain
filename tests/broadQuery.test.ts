import { describe, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { chat = { completions: { create } }; } }));
vi.mock("../src/lib/calendar", () => ({ getUpcomingEvents: vi.fn(async () => { throw new Error("google giù"); }) }));
vi.mock("../src/lib/health", () => ({ getMetricSummary: vi.fn() }));
vi.mock("../src/lib/siteData", () => ({
  SITE_TOPICS: ["studio", "umore"],
  SITE_TOPIC_LABELS: { studio: "Studio", umore: "Umore" },
  gatherSiteData: vi.fn(async () => "## Studio\nesame lunedì"),
}));
vi.mock("../src/lib/steps", () => ({ getStepsStats: vi.fn() }));
vi.mock("../src/lib/strava", () => ({ getAllActivities: vi.fn(async () => []) }));
vi.mock("../src/lib/todoReminders", () => ({ formatDue: vi.fn(), listOpenReminders: vi.fn(async () => [{ id: "1", text: "Mandare candidature Erasmus", due_at: null }]) }));
vi.mock("../src/lib/report", () => ({ reportError: vi.fn() }));

import { gatherBroad, planSources } from "../src/lib/broadQuery";

const reply = (content: string) => create.mockResolvedValueOnce({ choices: [{ message: { content } }] });

describe("planSources", () => {
  it("tiene solo fonti note, senza doppioni, massimo 5", async () => {
    reply('{"sources":["strava","strava","inventata","studio","umore","calendario","passi","salute"]}');
    expect(await planSources("piano per la gara")).toEqual(["strava", "studio", "umore", "calendario", "passi"]);
  });
  it("vuoto se nessuna integrazione c'entra", async () => {
    reply('{"sources":[]}');
    expect(await planSources("quanto ho in banca")).toEqual([]);
  });
});

describe("gatherBroad", () => {
  it("una fonte che fallisce non blocca le altre", async () => {
    const out = await gatherBroad(["studio", "calendario", "promemoria"]);
    expect(out).toContain("esame lunedì");
    expect(out).toContain("Dato non disponibile");
    expect(out).toContain("Mandare candidature Erasmus");
  });
});
