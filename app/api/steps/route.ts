import { NextRequest, NextResponse } from "next/server";
import { upsertDailySteps } from "../../../src/lib/steps";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.STEPS_INGEST_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const date = body?.date;
  const steps = Number(body?.steps);
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(steps)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    await upsertDailySteps(date, steps);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[steps] errore nel salvataggio:", err);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
