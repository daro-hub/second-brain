import { NextRequest, NextResponse } from "next/server";
import { airaGate } from "../../../../src/lib/airaAuth";
import { supabase } from "../../../../src/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Crea (senza id) o modifica (con id) un esame pianificato per la sessione. */
export async function POST(req: NextRequest) {
  const denied = airaGate(req);
  if (denied) return denied;

  const b = (await req.json().catch(() => null)) as { id?: unknown; courseCode?: unknown; examDate?: unknown; topics?: unknown } | null;
  const courseCode = typeof b?.courseCode === "string" ? b.courseCode : "";
  const examDate = typeof b?.examDate === "string" ? b.examDate : "";
  const topics = typeof b?.topics === "string" ? b.topics.trim().slice(0, 2000) : "";
  const id = typeof b?.id === "number" ? b.id : null;
  if (!courseCode || !DATE.test(examDate) || Number.isNaN(Date.parse(examDate))) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const row = { course_code: courseCode, exam_date: examDate, topics };
  const { error } = id ? await supabase.from("uni_exams").update(row).eq("id", id) : await supabase.from("uni_exams").insert(row);
  if (error) {
    console.error("[uni/exams] salvataggio fallito:", error.message);
    return NextResponse.json({ error: error.code === "23503" ? "unknown_course" : "save_failed" }, { status: error.code === "23503" ? 400 : 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const denied = airaGate(req);
  if (denied) return denied;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const { error } = await supabase.from("uni_exams").delete().eq("id", id);
  if (error) {
    console.error("[uni/exams] eliminazione fallita:", error.message);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
