import { NextRequest, NextResponse } from "next/server";
import { getUpcomingEvents } from "../../../src/lib/calendar";
import { getHubData } from "../../../src/lib/pillars";
import { reportError } from "../../../src/lib/report";
import { constantTimeEqual } from "../../../src/lib/session";
import { localHHMM } from "../../../src/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Dati compatti per il widget della home dell'iPhone (app Scriptable, vedi docs/widget/). Non può usare il cookie del PIN
 * (il widget non apre il sito): si autentica con la chiave WIDGET_KEY in `Authorization: Bearer`. Sola lettura.
 */
export async function GET(req: NextRequest) {
  const key = process.env.WIDGET_KEY;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!key || key.length < 24 || !constantTimeEqual(given, key)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const [hub, events] = await Promise.all([getHubData(), getUpcomingEvents(4, 3).catch(() => [])]);
    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        index: hub.index,
        pillars: hub.pillars.map((p) => ({ key: p.key, label: p.label, color: p.color, score: p.score })),
        nextExam: hub.nextExam,
        events: events.map((e) => ({ title: e.summary, start: e.start, time: e.start.includes("T") ? localHHMM(e.start) : null })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    reportError("api/widget", err);
    return NextResponse.json({ error: "widget_failed" }, { status: 500 });
  }
}
