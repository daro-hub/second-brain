import { moduleGate } from "../../../src/lib/modules";
import { makeClientId, mcpPassword, redirectAllowed } from "../../../src/lib/mcpOAuth";

export const dynamic = "force-dynamic";

/** Registrazione dinamica del client (RFC 7591): il client_id è firmato e porta con sé i redirect consentiti. */
export async function POST(req: Request) {
  const off = moduleGate("mcp");
  if (off) return off;
  if (!mcpPassword() || !process.env.CRON_SECRET) return Response.json({ error: "server_error", error_description: "MCP non configurato" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { redirect_uris?: unknown; client_name?: unknown } | null;
  const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!uris.length || !uris.every(redirectAllowed)) return Response.json({ error: "invalid_redirect_uri" }, { status: 400 });
  return Response.json(
    {
      client_id: makeClientId(uris),
      client_name: typeof body?.client_name === "string" ? body.client_name : "Claude",
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201 },
  );
}
