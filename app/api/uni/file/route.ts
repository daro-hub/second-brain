import { airaGate } from "../../../../src/lib/airaAuth";
import { getFileBytes, safePath } from "../../../../src/lib/university";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  md: "text/markdown; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** Serve un file del repo università (il repo è privato: il token resta lato server). */
export async function GET(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;

  const raw = new URL(req.url).searchParams.get("path") ?? "";
  let path: string;
  try {
    path = safePath(raw);
  } catch {
    return Response.json({ error: "invalid_path" }, { status: 400 });
  }
  if (!path) return Response.json({ error: "invalid_path" }, { status: 400 });

  try {
    const bytes = await getFileBytes(path);
    if (!bytes) return Response.json({ error: "not_found" }, { status: 404 });
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": TYPES[ext] ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${path.split("/").pop()}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    console.error("[uni/file] errore:", err);
    return Response.json({ error: "fetch_failed" }, { status: 502 });
  }
}
