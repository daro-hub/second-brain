import { airaGate } from "../../../../src/lib/airaAuth";
import { supabase } from "../../../../src/lib/supabase";
import { putFile, slugify } from "../../../../src/lib/university";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "uni-inbox";

/** Sposta un file caricato in Storage nella cartella raw/ della materia, con un commit su GitHub. */
export async function POST(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const year = Number(body?.year);
  const subject = typeof body?.subject === "string" ? slugify(body.subject) : "";
  const filename = typeof body?.filename === "string" ? slugify(body.filename) : "";
  const storagePath = typeof body?.storagePath === "string" ? body.storagePath : "";
  if (![1, 2, 3].includes(year) || !subject || !/\.(pdf|png|jpe?g)$/.test(filename) || !/^[\w-]+\/[\w.\-]+$/.test(storagePath)) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
    if (error || !data) throw error ?? new Error("download_failed");
    const bytes = Buffer.from(await data.arrayBuffer());

    const target = `year-${year}/${subject}/raw/${filename}`;
    await putFile(target, bytes, `Add raw material: ${subject}/${filename}`);
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return Response.json({ ok: true, path: target });
  } catch (err) {
    console.error("[uni/commit] errore:", err);
    return Response.json({ error: "commit_failed" }, { status: 502 });
  }
}
