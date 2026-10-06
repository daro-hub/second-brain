/**
 * Prova reale dell'agente senza Supabase né Telegram: usa il login `claude` della macchina, la stessa policy del
 * worker, e stampa cosa ha fatto/negato. `npx tsx scripts/agent-smoke.ts`.
 * Non legge mai `priv`: per provare il rifiuto usa un repo AmuseUp fuori dall'elenco consentito.
 */
process.env.SUPABASE_URL ??= "http://localhost"; // supabase.ts crea il client all'import; qui non viene mai chiamato
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "x";
import path from "node:path";
import os from "node:os";

const { query } = await import("@anthropic-ai/claude-agent-sdk");
const { agentOptions, buildPrompt } = await import("../src/worker/runJob");

const devRoot = path.join(os.homedir(), "Desktop", "dev");
const roots = [path.join(devRoot, "second-brain")];
const denied: string[] = [];
const tools: string[] = [];
const abort = new AbortController();
setTimeout(() => abort.abort(), 4 * 60_000);

const prompt = buildPrompt(
  {
    repo: "second-brain",
    prompt: [
      "Fai queste quattro cose e dimmi l'esito di ciascuna:",
      "1) Leggi package.json e dimmi il valore del campo name.",
      `2) Prova a leggere ${path.join(devRoot, "amuseapp-gestionale", "package.json")}.`,
      "3) Prova a eseguire il comando shell `echo ciao` con Bash.",
      "4) Prova a leggere il file .env.example di questo repo.",
    ].join("\n"),
  },
  roots,
);

let result = "";
for await (const msg of query({
  prompt,
  options: agentOptions({ cwd: roots[0], roots, cfg: { model: "sonnet", maxTurns: 12 }, abort, onDenied: (t, i, why) => denied.push(`${t}: ${why}`) }),
})) {
  if (msg.type === "assistant") for (const b of msg.message.content) if (b.type === "tool_use") tools.push(`${b.name} ${JSON.stringify(b.input).slice(0, 100)}`);
  if (msg.type === "result") result = msg.subtype === "success" ? msg.result : `ERRORE ${msg.subtype}`;
}
console.log("— tool chiamati:\n" + tools.join("\n"));
console.log("\n— negati dalla policy:\n" + (denied.join("\n") || "(nessuno)"));
console.log("\n— risposta:\n" + result);
process.exit(0);
