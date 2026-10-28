import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PROFILE si legge una volta al caricamento del modulo: ogni test lo reimporta con l'ambiente che vuole.
vi.setConfig({ testTimeout: 30_000 });

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const k of ["OWNER_WEIGHT_KG", "OWNER_HEIGHT_CM", "OWNER_RESTING_KCAL"]) vi.stubEnv(k, env[k] ?? "");
  vi.stubEnv("SUPABASE_URL", "http://localhost");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "x");
  return (await import("../src/lib/energy")).PROFILE;
}

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

describe("profilo fisico configurabile", () => {
  it("senza variabili restano i valori di Francesco", async () => {
    const p = await load({});
    expect([p.restingKcal, p.weightKg, p.heightCm]).toEqual([1750, 65, 170]);
  });

  it("le variabili cambiano peso, altezza e fabbisogno a riposo (anche decimali)", async () => {
    const p = await load({ OWNER_WEIGHT_KG: "58.5", OWNER_HEIGHT_CM: "165", OWNER_RESTING_KCAL: "1500" });
    expect([p.restingKcal, p.weightKg, p.heightCm]).toEqual([1500, 58.5, 165]);
  });

  it("valori non validi (testo, zero, negativi) tornano al default invece di rompere i calcoli", async () => {
    const p = await load({ OWNER_WEIGHT_KG: "abc", OWNER_HEIGHT_CM: "0", OWNER_RESTING_KCAL: "-5" });
    expect([p.restingKcal, p.weightKg, p.heightCm]).toEqual([1750, 65, 170]);
  });
});
