import { NextRequest, NextResponse } from "next/server";
import { ingestHealthExport, saveRawDebugPayload, type HealthExportPayload } from "../../../src/lib/health";

export const maxDuration = 60;

// Alcune app fanno un controllo di connettività (GET/HEAD) sull'URL prima di mandare
// i dati veri via POST — osservato nei log di Vercel con richieste GET arrivate da sole,
// mai seguite da un POST. Rispondere 200 qui evita che quel controllo blocchi l'app
// prima ancora che arrivi la richiesta reale.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.HEALTH_INGEST_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fase di scoperta del formato reale dell'automazione di Daro: salva SEMPRE il corpo
  // grezzo così com'è — anche se non è JSON valido — prima di provare a interpretarlo
  // con lo schema assunto (quello documentato di Health Auto Export, mai verificato
  // contro la sua automazione specifica, che potrebbe essere diversa).
  const rawText = await req.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // non JSON valido: salviamo comunque il testo grezzo qui sotto
  }
  await saveRawDebugPayload(parsed ?? { _raw_text: rawText }).catch((err) =>
    console.error("[health] errore nel salvataggio raw:", err),
  );

  const body = parsed as HealthExportPayload | null;
  if (!body?.data?.metrics) {
    return NextResponse.json({ ok: true, note: "ricevuto e salvato grezzo, formato non ancora riconosciuto" });
  }

  try {
    const result = await ingestHealthExport(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[health] errore nel salvataggio:", err);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
