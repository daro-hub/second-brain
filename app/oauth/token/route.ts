import { moduleGate } from "../../../src/lib/modules";
import { clientRedirects, makeTokens, pkceMatches, verify } from "../../../src/lib/mcpOAuth";

export const dynamic = "force-dynamic";

const err = (error: string, status = 400) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const off = moduleGate("mcp");
  if (off) return off;
  const form = new URLSearchParams(await req.text());
  const grant = form.get("grant_type");

  if (grant === "authorization_code") {
    const code = verify(form.get("code"), "code");
    const verifier = form.get("code_verifier") ?? "";
    if (!code) return err("invalid_grant");
    if (form.get("client_id") !== code.cid || form.get("redirect_uri") !== code.ru) return err("invalid_grant");
    if (!clientRedirects(String(code.cid))) return err("invalid_client", 401);
    if (!verifier || !pkceMatches(verifier, String(code.ch))) return err("invalid_grant");
    return Response.json(makeTokens(), { headers: { "Cache-Control": "no-store" } });
  }

  if (grant === "refresh_token") {
    if (!verify(form.get("refresh_token"), "refresh")) return err("invalid_grant");
    return Response.json(makeTokens(), { headers: { "Cache-Control": "no-store" } });
  }

  return err("unsupported_grant_type");
}
