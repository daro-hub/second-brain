import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getPassword } from "../lib/bitwarden";
import { getUpcomingEvents } from "../lib/calendar";
import { getRepoInfo } from "../lib/github";
import { ingest } from "../lib/ingest";
import { searchIssues } from "../lib/linear";
import { searchByFilter, searchSemantic } from "../lib/search";
import { getRecentActivities } from "../lib/strava";
import { getExerciseHistory, getLastSession, getPR, getRoutinePreview, logWorkout } from "../lib/workouts";

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
    {
      name: "log_workout",
      description:
        "Registra una serie di allenamento (esercizio, peso, ripetizioni) e segnala se è un nuovo PR (1RM stimato con formula di Epley)",
      inputSchema: {
        type: "object",
        properties: {
          exercise: { type: "string" },
          weightKg: { type: "number" },
          reps: { type: "number" },
          sets: { type: "number" },
          muscleGroup: { type: "string" },
        },
        required: ["exercise", "weightKg", "reps"],
      },
    },
    {
      name: "get_last_session",
      description:
        "Elenco degli esercizi fatti l'ultima volta per un gruppo muscolare (es. petto, schiena), nell'ordine in cui sono stati eseguiti",
      inputSchema: {
        type: "object",
        properties: {
          muscleGroup: { type: "string" },
        },
        required: ["muscleGroup"],
      },
    },
    {
      name: "get_routine_preview",
      description:
        "Anteprima di una routine di allenamento predefinita (es. 'leg day', 'braccia', 'petto e schiena'): elenco esercizi in ordine con l'ultimo peso/reps registrato per ciascuno",
      inputSchema: {
        type: "object",
        properties: {
          routineName: { type: "string" },
        },
        required: ["routineName"],
      },
    },
    {
      name: "get_password",
      description:
        "Recupera una password dal vault Bitwarden personale per nome voce (azione sensibile, usare solo su richiesta esplicita)",
      inputSchema: {
        type: "object",
        properties: {
          itemName: { type: "string" },
        },
        required: ["itemName"],
      },
    },
    {
      name: "get_upcoming_events",
      description: "Prossimi eventi dal Google Calendar personale",
      inputSchema: {
        type: "object",
        properties: {
          maxResults: { type: "number" },
        },
      },
    },
    {
      name: "get_recent_activities",
      description: "Attività sportive recenti da Strava",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
        },
      },
    },
    {
      name: "get_repo_info",
      description: "Informazioni live su un repository GitHub (descrizione, link, estratto README) tra quelli dell'account collegato",
      inputSchema: {
        type: "object",
        properties: {
          repoName: { type: "string" },
        },
        required: ["repoName"],
      },
    },
    {
      name: "search_linear_issues",
      description: "Cerca issue su Linear per testo (titolo/descrizione)",
      inputSchema: {
        type: "object",
        properties: {
          term: { type: "string" },
          limit: { type: "number" },
        },
        required: ["term"],
      },
    },
    {
      name: "get_exercise_history",
      description: "Storico delle serie registrate per un esercizio",
      inputSchema: {
        type: "object",
        properties: {
          exercise: { type: "string" },
          limit: { type: "number" },
        },
        required: ["exercise"],
      },
    },
    {
      name: "get_pr",
      description: "Miglior 1RM stimato per un esercizio e quando è stato fatto",
      inputSchema: {
        type: "object",
        properties: {
          exercise: { type: "string" },
        },
        required: ["exercise"],
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

  if (name === "get_password") {
    const password = await getPassword(String(args?.itemName));
    return {
      content: [{ type: "text", text: password ?? `Nessuna voce trovata per "${args?.itemName}".` }],
    };
  }

  if (name === "get_upcoming_events") {
    const events = await getUpcomingEvents((args?.maxResults as number) ?? 10);
    return { content: [{ type: "text", text: JSON.stringify(events, null, 2) }] };
  }

  if (name === "get_recent_activities") {
    const activities = await getRecentActivities((args?.limit as number) ?? 10);
    return { content: [{ type: "text", text: JSON.stringify(activities, null, 2) }] };
  }

  if (name === "get_repo_info") {
    const repo = await getRepoInfo(String(args?.repoName));
    return { content: [{ type: "text", text: JSON.stringify(repo, null, 2) }] };
  }

  if (name === "search_linear_issues") {
    const issues = await searchIssues(String(args?.term), (args?.limit as number) ?? 5);
    return { content: [{ type: "text", text: JSON.stringify(issues, null, 2) }] };
  }

  if (name === "log_workout") {
    const result = await logWorkout({
      exercise: String(args?.exercise).toLowerCase().trim(),
      weightKg: Number(args?.weightKg),
      reps: Number(args?.reps),
      sets: Number(args?.sets ?? 1),
      muscleGroup: args?.muscleGroup ? String(args.muscleGroup).toLowerCase().trim() : undefined,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "get_last_session") {
    const session = await getLastSession(String(args?.muscleGroup).toLowerCase().trim());
    return { content: [{ type: "text", text: JSON.stringify(session, null, 2) }] };
  }

  if (name === "get_routine_preview") {
    const preview = await getRoutinePreview(String(args?.routineName).toLowerCase().trim());
    return { content: [{ type: "text", text: JSON.stringify(preview, null, 2) }] };
  }

  if (name === "get_exercise_history") {
    const history = await getExerciseHistory(
      String(args?.exercise).toLowerCase().trim(),
      (args?.limit as number) ?? 20,
    );
    return { content: [{ type: "text", text: JSON.stringify(history, null, 2) }] };
  }

  if (name === "get_pr") {
    const pr = await getPR(String(args?.exercise).toLowerCase().trim());
    return { content: [{ type: "text", text: JSON.stringify(pr, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
