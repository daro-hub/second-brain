import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase", async () => {
  const { fakeSupabase } = await import("./helpers/memdb");
  return { supabase: fakeSupabase };
});
vi.mock("../src/lib/tools/registry", async () => {
  const { z } = await import("zod");
  const TOOLS = [
    { name: "leggi", description: "lettura", schema: z.object({ q: z.string() }), write: false, run: async () => ({}) },
    { name: "scrivi", description: "scrittura", schema: z.object({ t: z.string() }), write: true, run: async () => ({}) },
  ];
  return { TOOLS, runTool: vi.fn(async (name: string) => ({ text: `ok ${name}`, isError: false })) };
});

import { createHash } from "node:crypto";
import { POST as mcp } from "../app/api/mcp/route";
import { POST as authorize } from "../app/oauth/authorize/route";
import { POST as register } from "../app/oauth/register/route";
import { POST as token } from "../app/oauth/token/route";
import { resetDb } from "./helpers/memdb";

const ORIGIN = "https://sb.example";
const CB = "https://claude.ai/api/mcp/auth_callback";

beforeEach(() => {
  resetDb();
  process.env.CRON_SECRET = "segreto-di-test";
  process.env.MCP_PASSWORD = "123456";
});

async function login(password: string) {
  const verifier = "x".repeat(60);
  const reg = await register(new Request(`${ORIGIN}/oauth/register`, { method: "POST", body: JSON.stringify({ redirect_uris: [CB] }) }));
  const { client_id } = await reg.json();
  const form = new FormData();
  const fields = { client_id, redirect_uri: CB, response_type: "code", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state: "s1", password };
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const res = await authorize(new Request(`${ORIGIN}/oauth/authorize`, { method: "POST", body: form }));
  return { res, client_id, verifier };
}

const rpc = (method: string, params: unknown, bearer?: string) =>
  new Request(`${ORIGIN}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

describe("flusso OAuth + MCP", () => {
  it("rifiuta redirect non consentiti nella registrazione", async () => {
    const res = await register(new Request(`${ORIGIN}/oauth/register`, { method: "POST", body: JSON.stringify({ redirect_uris: ["https://evil.example/cb"] }) }));
    expect(res.status).toBe(400);
  });

  it("password errata: nessun codice", async () => {
    const { res } = await login("000000");
    expect(res.status).toBe(401);
  });

  it("login → token → tools/list e tools/call; senza token 401 con metadata", async () => {
    const { res, client_id, verifier } = await login("123456");
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe(CB);
    expect(loc.searchParams.get("state")).toBe("s1");

    const tk = await token(new Request(`${ORIGIN}/oauth/token`, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code: loc.searchParams.get("code")!, code_verifier: verifier, client_id, redirect_uri: CB }) }));
    expect(tk.status).toBe(200);
    const tokens = await tk.json();

    const noAuth = await mcp(rpc("tools/list", {}));
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers.get("www-authenticate")).toContain("oauth-protected-resource");

    const list = await (await mcp(rpc("tools/list", {}, tokens.access_token))).json();
    const byName = Object.fromEntries(list.result.tools.map((t: { name: string; annotations: { readOnlyHint: boolean } }) => [t.name, t.annotations.readOnlyHint]));
    expect(byName).toEqual({ leggi: true, scrivi: false });

    const call = await (await mcp(rpc("tools/call", { name: "leggi", arguments: { q: "x" } }, tokens.access_token))).json();
    expect(call.result.content[0].text).toBe("ok leggi");

    const refreshed = await token(new Request(`${ORIGIN}/oauth/token`, { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }) }));
    expect(refreshed.status).toBe(200);
  });

  it("verifier PKCE sbagliato: nessun token", async () => {
    const { res, client_id } = await login("123456");
    const code = new URL(res.headers.get("location")!).searchParams.get("code")!;
    const tk = await token(new Request(`${ORIGIN}/oauth/token`, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: "sbagliato", client_id, redirect_uri: CB }) }));
    expect(tk.status).toBe(400);
  });
});
