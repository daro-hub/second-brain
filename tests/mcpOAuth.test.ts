import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase", async () => {
  const { fakeSupabase } = await import("./helpers/memdb");
  return { supabase: fakeSupabase };
});

import { createHash } from "node:crypto";
import { clearFailures, isAccessTokenValid, isLockedOut, makeClientId, makeCode, makeTokens, pkceMatches, recordFailure, redirectAllowed, sign, verify } from "../src/lib/mcpOAuth";
import { resetDb } from "./helpers/memdb";

beforeEach(() => {
  resetDb();
  process.env.CRON_SECRET = "segreto-di-test";
  process.env.MCP_PASSWORD = "123456";
});

describe("token firmati", () => {
  it("accetta un token valido e rifiuta tipo sbagliato, manomissione e scadenza", () => {
    const t = makeTokens();
    expect(isAccessTokenValid(t.access_token)).toBe(true);
    expect(isAccessTokenValid(t.refresh_token)).toBe(false);
    expect(isAccessTokenValid(`${t.access_token}x`)).toBe(false);
    expect(isAccessTokenValid(undefined)).toBe(false);
    expect(verify(t.access_token, "access", Date.now() + 2 * 3600_000)).toBeNull();
  });

  it("cambiare la password invalida i token già emessi", () => {
    const t = makeTokens();
    process.env.MCP_PASSWORD = "654321";
    expect(isAccessTokenValid(t.access_token)).toBe(false);
  });

  it("senza CRON_SECRET non firma e non verifica (fail closed)", () => {
    const t = makeTokens();
    delete process.env.CRON_SECRET;
    expect(isAccessTokenValid(t.access_token)).toBe(false);
    expect(() => sign({ t: "access", exp: 1 })).toThrow();
  });
});

describe("registrazione e PKCE", () => {
  it("redirect solo verso Claude o localhost", () => {
    expect(redirectAllowed("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectAllowed("http://localhost:3000/cb")).toBe(true);
    expect(redirectAllowed("https://evil.example/cb")).toBe(false);
    expect(redirectAllowed("https://claude.ai.evil.example/cb")).toBe(false);
  });

  it("il codice vale 5 minuti e PKCE S256 deve combaciare", () => {
    const verifier = "v".repeat(50);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const cid = makeClientId(["https://claude.ai/cb"]);
    const code = makeCode(cid, "https://claude.ai/cb", challenge);
    const p = verify(code, "code");
    expect(p?.cid).toBe(cid);
    expect(verify(code, "code", Date.now() + 6 * 60_000)).toBeNull();
    expect(pkceMatches(verifier, challenge)).toBe(true);
    expect(pkceMatches("altro", challenge)).toBe(false);
  });
});

describe("blocco dei tentativi", () => {
  it("dopo 5 password errate blocca, e si sblocca dopo 15 minuti o con un accesso riuscito", async () => {
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) await recordFailure(t0);
    expect(await isLockedOut(t0 + 1000)).toBe(true);
    expect(await isLockedOut(t0 + 16 * 60_000)).toBe(false);
    await clearFailures();
    expect(await isLockedOut(t0 + 1000)).toBe(false);
  });
});
