import { NextRequest, NextResponse } from "next/server";
import { airaGate } from "../../../src/lib/airaAuth";
import { addTextTransfer, deleteTransfer } from "../../../src/lib/transfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Aggiunge un testo o un link a Passaggi. */
export async function POST(req: NextRequest) {
  const denied = airaGate(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { content?: unknown } | null;
  const content = typeof body?.content === "string" ? body.content : "";
  if (!content.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });
  try {
    await addTextTransfer(content, "web");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[passaggi] salvataggio testo fallito:", err);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = airaGate(req);
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  try {
    await deleteTransfer(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[passaggi] eliminazione fallita:", err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
