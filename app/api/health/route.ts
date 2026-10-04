import { NextRequest, NextResponse } from "next/server";
import { ingestHealthExport, type HealthExportPayload } from "../../../src/lib/health";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.HEALTH_INGEST_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as HealthExportPayload | null;
  if (!body?.data?.metrics) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const result = await ingestHealthExport(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[health] errore nel salvataggio:", err);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
