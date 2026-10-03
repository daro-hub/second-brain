import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ingest } from "../lib/ingest.js";
import { searchByFilter, searchSemantic } from "../lib/search.js";

const server = new Server(
  { name: "second-brain", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "kb_ingest",
      description: "Salva un contenuto nella knowledge base personale",
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string" },
          source: { type: "string" },
        },
        required: ["content", "source"],
      },
    },
    {
      name: "kb_search_semantic",
      description: "Ricerca semantica nella knowledge base personale",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
    {
      name: "kb_search_filter",
      description:
        "Ricerca nella knowledge base per fonte, intervallo di date o testo esatto",
      inputSchema: {
        type: "object",
        properties: {
          source: { type: "string" },
          dateFrom: { type: "string" },
          dateTo: { type: "string" },
          textQuery: { type: "string" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "kb_ingest") {
    const id = await ingest(args?.content as string, args?.source as string);
    return { content: [{ type: "text", text: `Salvato con id ${id}` }] };
  }

  if (name === "kb_search_semantic") {
    const results = await searchSemantic(
      args?.query as string,
      (args?.limit as number) ?? 5,
    );
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }

  if (name === "kb_search_filter") {
    const results = await searchByFilter({
      source: args?.source as string | undefined,
      dateFrom: args?.dateFrom as string | undefined,
      dateTo: args?.dateTo as string | undefined,
      textQuery: args?.textQuery as string | undefined,
    });
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
