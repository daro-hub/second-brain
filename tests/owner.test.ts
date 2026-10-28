import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// OWNER si legge una volta al caricamento del modulo: ogni test lo reimporta con l'ambiente che vuole.
async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const k of ["OWNER_NAME", "OWNER_PROFILE", "OWNER_GENDER"]) vi.stubEnv(k, env[k] ?? "");
  vi.stubEnv("SUPABASE_URL", "http://localhost");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "x");
  vi.stubEnv("OPENAI_API_KEY", "x");
  return { owner: await import("../src/lib/owner"), pills: await import("../src/lib/pills"), history: await import("../src/lib/chatHistory") };
}

// il primo import a freddo (registro strumenti, OpenAI, Supabase) con la suite in parallelo supera i 5 s di default
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

describe("nome del proprietario nei prompt", () => {
  it("senza OWNER_NAME resta Daro (deploy di Francesco invariato)", async () => {
    const { owner, pills } = await load({});
    expect(owner.OWNER).toBe("Daro");
    expect(owner.OWNER_LABEL).toBe('Francesco ("Daro")');
    expect(owner.OWNER_GENDER_NOTE).toBe("");
    expect(pills.pillPrompt("storia", [], null)).toContain("per Daro, studente e sviluppatore di 21 anni.");
  });

  it("con OWNER_NAME il nome cambia ovunque e non resta Daro, né il profilo di Francesco", async () => {
    const { owner, pills, history } = await load({ OWNER_NAME: "Giulia", OWNER_GENDER: "F" });
    expect(owner.OWNER_LABEL).toBe("Giulia");
    expect(owner.OWNER_GENDER_NOTE).toContain("Giulia è una ragazza");
    const prompt = pills.pillPrompt("storia", [], null);
    expect(prompt).toContain("per Giulia.");
    expect(prompt).not.toMatch(/Daro|sviluppatore/);
    expect(history.formatHistory([{ role: "user", content: "ciao" }])).toContain("Giulia:");
  });

  it("OWNER_PROFILE descrive la persona nelle pillole", async () => {
    const { pills } = await load({ OWNER_NAME: "Giulia", OWNER_PROFILE: "di 24 anni" });
    expect(pills.pillPrompt("storia", [], null)).toContain("per Giulia, di 24 anni.");
  });
});
