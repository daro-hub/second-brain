import { describe, expect, it } from "vitest";
import type { OpenAiUsageSummary } from "../src/lib/openaiUsage";
import { formatUsageReport } from "../src/lib/usageReport";

const base: OpenAiUsageSummary = {
  configured: true,
  days: [],
  byModel: [{ model: "gpt-6-luna", requests: 1200, inputTokens: 900_000, outputTokens: 100_000 }],
  totalTokens30d: 1_840_000,
  totalCostUsd30d: 5.2,
  totalCostUsdToday: 0.12,
  totalCostUsd7d: 1.4,
  creditTotalUsd: 20,
  creditRemainingUsd: 14.8,
};

describe("formatUsageReport — 'Quanti crediti ho consumato?' per il second brain", () => {
  it("risponde con i numeri invece di chiedere di quale servizio si parla", () => {
    const r = formatUsageReport(base);
    expect(r).toContain("Consumati negli ultimi 30 giorni: $5.20");
    expect(r).toContain("Oggi: $0.12");
    expect(r).toContain("residui (stima): $14.80");
    expect(r).toContain("gpt-6-luna");
    expect(r).not.toContain("quale servizio");
  });
  it("dichiara che il residuo è una stima", () => expect(formatUsageReport(base)).toContain("è una stima"));
  it("senza il totale caricato non inventa un residuo", () => {
    const r = formatUsageReport({ ...base, creditTotalUsd: null, creditRemainingUsd: null });
    expect(r).toContain("non mi hai detto quanto hai caricato");
    expect(r).not.toContain("residui (stima)");
  });
  it("chiave admin assente: lo dice chiaramente", () => {
    expect(formatUsageReport({ ...base, configured: false })).toContain("OPENAI_ADMIN_API_KEY");
  });
  it("un altro servizio (Vercel): dice che non ne legge i consumi e offre OpenAI", () => {
    const r = formatUsageReport(base, "Vercel");
    expect(r).toContain("Vercel non ho accesso");
    expect(r).not.toContain("$5.20");
  });
});
