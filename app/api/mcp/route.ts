import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isAccessTokenValid } from "../../../src/lib/mcpOAuth";
import { reportError } from "../../../src/lib/report";
import { runTool, TOOLS } from "../../../src/lib/tools/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized(req: Request) {
  const origin = new URL(req.url).origin;
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"` },
  });
}

/** Server MCP remoto (Streamable HTTP, senza sessione): gli stessi strumenti del bot, per Claude da telefono e web. */
async function handle(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (!isAccessTokenValid(auth.startsWith("Bearer ") ? auth.slice(7) : null)) return unauthorized(req);

  const server = new McpServer({ name: "second-brain", version: "1.0.0" });
  for (const t of TOOLS) {
    server.registerTool(
      t.name,
      { description: t.description, inputSchema: t.schema.shape, annotations: { readOnlyHint: !t.write, destructiveHint: false, openWorldHint: true } },
      async (args: unknown) => {
        const out = await runTool(t.name, args);
        if (out.isError) reportError(`mcp/${t.name}`, new Error(out.text), { expected: true });
        return { content: [{ type: "text" as const, text: out.text }], isError: out.isError };
      },
    );
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
