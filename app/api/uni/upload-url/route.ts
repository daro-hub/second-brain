import { randomUUID } from "node:crypto";
import { airaGate } from "../../../../src/lib/airaAuth";
import { supabase } from "../../../../src/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNI_BUCKET = "uni-inbox";

/**
 * Vercel rifiuta body oltre 4,5 MB: i PDF (anche 5 MB) vanno dal browser a Supabase Storage con
 * un URL firmato, poi /api/uni/commit li porta su GitHub. Il bucket è privato e si crea da solo.
 */
export async function POST(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (typeof body?.filename !== "string" || !/\.(pdf|png|jpe?g)$/i.test(body.filename)) {
    return Response.json({ error: "invalid_filename", message: "Sono accettati solo PDF e immagini." }, { status: 400 });
  }

  try {
    const { error: bucketErr } = await supabase.storage.createBucket(UNI_BUCKET, { public: false });
    if (bucketErr && !/already exists/i.test(bucketErr.message)) throw bucketErr;

    const storagePath = `${randomUUID()}/${body.filename.replace(/[^\w.\-]+/g, "_")}`;
    const { data, error } = await supabase.storage.from(UNI_BUCKET).createSignedUploadUrl(storagePath);
    if (error) throw error;
    return Response.json({ storagePath, signedUrl: data.signedUrl });
  } catch (err) {
    console.error("[uni/upload-url] errore:", err);
    return Response.json({ error: "storage_failed" }, { status: 502 });
  }
}
