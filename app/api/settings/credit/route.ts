import { NextRequest, NextResponse } from "next/server";
import { airaGate } from "../../../../src/lib/airaAuth";
import { CREDIT_SETTING_KEY } from "../../../../src/lib/openaiUsage";
import { supabase } from "../../../../src/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_USD = 100_000;

/** Salva il totale dei crediti OpenAI caricati (modificabile con doppio click su /costi). */
export async function POST(req: NextRequest) {
  const denied = airaGate(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { value?: unknown } | null;
  const value = typeof body?.value === "number" ? body.value : NaN;
  if (!Number.isFinite(value) || value < 0 || value > MAX_USD) {
    return NextResponse.json({ error: "invalid_value" }, { status: 400 });
  }
  const rounded = Math.round(value * 100) / 100;

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: CREDIT_SETTING_KEY, value: String(rounded), updated_at: new Date().toISOString() });
  if (error) {
    console.error("[costi] salvataggio totale caricato fallito:", error.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, value: rounded });
}
