import { NextRequest, NextResponse } from "next/server";
import { airaGate } from "../../../../src/lib/airaAuth";
import { addFileTransfer, MAX_TRANSFER_BYTES } from "../../../../src/lib/transfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Registra un file già caricato in Storage con l'URL firmato. */
export async function POST(req: NextRequest) {
  const denied = airaGate(req);
  if (denied) return denied;
  const b = (await req.json().catch(() => null)) as { path?: unknown; name?: unknown; size?: unknown; mime?: unknown } | null;
  const path = typeof b?.path === "string" ? b.path : "";
  const name = typeof b?.name === "string" ? b.name : "";
  const size = typeof b?.size === "number" ? b.size : 0;
  const mime = typeof b?.mime === "string" ? b.mime : "";
  // il percorso lo ha generato il server: <uuid>/<nome pulito>
  if (!/^[0-9a-f-]{36}\/[\w.\-]+$/i.test(path) || !name || size <= 0 || size > MAX_TRANSFER_BYTES) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  try {
    await addFileTransfer({ path, name, size, mime, source: "web" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[passaggi] registrazione file fallita:", err);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
