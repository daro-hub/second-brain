/**
 * Valuta il router (classificatore) contro il modello VERO su tutte le frasi di evals/router.cases.ts.
 * Uso: `npm run eval` (serve OPENAI_API_KEY, anche da .env.local). Esce con codice 1 se qualcosa non torna.
 */
import "dotenv/config";

process.env.SUPABASE_URL ??= "http://127.0.0.1:9"; // il classificatore non legge dati: servono solo per l'import
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "unused";

if (!process.env.OPENAI_API_KEY) {
  console.error("Manca OPENAI_API_KEY: l'eval chiama il modello vero.");
  process.exit(2);
}

const { classifyMessage } = await import("../src/lib/intent");
const { quickRoute } = await import("../src/lib/router");
const { ROUTER_CASES, matchesExpectation } = await import("../evals/router.cases");

type Row = { id: string; ok: boolean; got: string; want: string };
const rows: Row[] = [];
const queue = [...ROUTER_CASES];

async function worker() {
  for (let c = queue.shift(); c; c = queue.shift()) {
    const want = JSON.stringify(c.expect);
    const quick = quickRoute(c.text);
    if (quick || c.quick) {
      rows.push({ id: c.id, ok: quick === (c.quick ?? null), got: `scorciatoia:${quick}`, want: `scorciatoia:${c.quick ?? "nessuna"}` });
      continue;
    }
    try {
      const topic = c.topic ? { intent: c.topic.intent, text: c.topic.text, at: Date.now() - c.topic.minutesAgo * 60_000 } : null;
      const got = await classifyMessage(c.text, c.history ?? [], topic);
      rows.push({ id: c.id, ok: matchesExpectation(got as never, c.expect), got: JSON.stringify(got).slice(0, 110), want });
    } catch (err) {
      rows.push({ id: c.id, ok: false, got: `ERRORE ${(err as Error).message}`, want });
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);

rows.sort((a, b) => ROUTER_CASES.findIndex((c) => c.id === a.id) - ROUTER_CASES.findIndex((c) => c.id === b.id));
for (const r of rows) console.log(`${r.ok ? "✓" : "✗"} ${r.id}${r.ok ? "" : `\n    atteso:  ${r.want}\n    ottenuto: ${r.got}`}`);
const failed = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} corretti`);
process.exit(failed.length ? 1 : 0);
