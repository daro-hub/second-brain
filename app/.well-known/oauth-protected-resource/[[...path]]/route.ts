import { moduleGate } from "../../../../src/lib/modules";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const off = moduleGate("mcp");
  if (off) return off;
  const origin = new URL(req.url).origin;
  return Response.json({ resource: `${origin}/api/mcp`, authorization_servers: [origin], bearer_methods_supported: ["header"] });
}
