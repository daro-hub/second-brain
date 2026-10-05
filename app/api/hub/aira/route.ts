import { airaGate } from "../../../../src/lib/airaAuth";
import { getBrainSnapshot } from "../../../../src/lib/brain";
import { getOpenAiUsageSummary } from "../../../../src/lib/openaiUsage";
import { reportError } from "../../../../src/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Stato di Aira per il contesto "status": integrazioni, base di conoscenza, bot e costi/utilizzo OpenAI. */
export async function GET(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;
  try {
    const [brain, usage] = await Promise.all([
      getBrainSnapshot(),
      getOpenAiUsageSummary(30).catch((err) => {
        reportError("api/hub/aira/usage", err, { expected: true });
        return null;
      }),
    ]);
    return Response.json(
      {
        integrations: brain.integrations.map(({ id, label, ok, detail }) => ({ id, label, ok, detail })),
        docs: brain.totalDocuments,
        logs: brain.totalLogs,
        webhook: brain.webhook,
        cost: usage && usage.configured
          ? {
              today: usage.totalCostUsdToday,
              d7: usage.totalCostUsd7d,
              d30: usage.totalCostUsd30d,
              tokens30: usage.totalTokens30d,
              total: usage.creditTotalUsd,
              remaining: usage.creditRemainingUsd,
            }
          : null,
      },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (err) {
    reportError("api/hub/aira", err);
    return Response.json({ error: "aira_status_failed" }, { status: 500 });
  }
}
