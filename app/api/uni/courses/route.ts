import { NextRequest, NextResponse } from "next/server";
import { airaGate } from "../../../../src/lib/airaAuth";
import { supabase } from "../../../../src/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const GRADE = /^(1[89]|2\d|30)L?$|^APP$/;

/** Aggiorna lo stato di un insegnamento: superato (voto + data), frequentato o da fare. */
export async function POST(req: NextRequest) {
  const denied = airaGate(req);
  if (denied) return denied;

  const b = (await req.json().catch(() => null)) as { code?: unknown; status?: unknown; grade?: unknown; passedOn?: unknown } | null;
  const code = typeof b?.code === "string" ? b.code : "";
  const status = b?.status;
  if (!code || (status !== "passed" && status !== "attending" && status !== "todo")) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  let grade: string | null = null;
  let passedOn: string | null = null;
  if (status === "passed") {
    grade = typeof b?.grade === "string" ? b.grade.trim().toUpperCase() : "";
    passedOn = typeof b?.passedOn === "string" ? b.passedOn : "";
    if (!GRADE.test(grade) || !DATE.test(passedOn) || Number.isNaN(Date.parse(passedOn))) {
      return NextResponse.json({ error: "invalid_grade_or_date" }, { status: 400 });
    }
  }

  const { error } = await supabase.from("uni_courses").update({ status, grade, passed_on: passedOn }).eq("code", code);
  if (error) {
    console.error("[uni/courses] aggiornamento fallito:", error.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
