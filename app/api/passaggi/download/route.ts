import { NextRequest, NextResponse } from "next/server";
import { airaGate } from "../../../../src/lib/airaAuth";
import { getDownloadUrl } from "../../../../src/lib/transfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reindirizza a un link di download che vale 60 secondi. */
export async function GET(req: NextRequest) {
  const denied = airaGate(req);
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  try {
    const url = await getDownloadUrl(id);
    return url ? NextResponse.redirect(url) : NextResponse.json({ error: "not_found_or_expired" }, { status: 404 });
  } catch (err) {
    console.error("[passaggi] download fallito:", err);
    return NextResponse.json({ error: "download_failed" }, { status: 500 });
  }
}
