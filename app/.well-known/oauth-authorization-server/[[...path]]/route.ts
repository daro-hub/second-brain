import { moduleGate } from "../../../../src/lib/modules";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const off = moduleGate("mcp");
  if (off) return off;
  const origin = new URL(req.url).origin;
  return Response.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
