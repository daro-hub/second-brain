import { NextRequest, NextResponse } from "next/server";
import { airaGate } from "../../../../src/lib/airaAuth";
import { createUploadSlot, MAX_TRANSFER_BYTES } from "../../../../src/lib/transfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = airaGate(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { filename?: unknown; size?: unknown } | null;
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const size = typeof body?.size === "number" ? body.size : 0;
  if (!filename) return NextResponse.json({ error: "invalid_filename" }, { status: 400 });
  if (size > MAX_TRANSFER_BYTES) return NextResponse.json({ error: "too_large", maxMb: MAX_TRANSFER_BYTES / 1024 / 1024 }, { status: 413 });
  try {
    return NextResponse.json(await createUploadSlot(filename));
  } catch (err) {
    console.error("[passaggi] url di upload fallito:", err);
    return NextResponse.json({ error: "storage_failed" }, { status: 502 });
  }
}
