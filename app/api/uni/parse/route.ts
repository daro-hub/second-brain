import { airaGate } from "../../../../src/lib/airaAuth";
import { getFileBytes, putFile, safePath, slugify } from "../../../../src/lib/university";
import { parsingEnabled, pdfsToMarkdown } from "../../../../src/lib/uniParse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Converte uno o più PDF raw della stessa lezione in un unico Markdown in lectures/.
 * Senza ANTHROPIC_API_KEY risponde 501: il parsing resta manuale (Claude Code).
 */
export async function POST(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;
  if (!parsingEnabled()) {
    return Response.json({ error: "parsing_disabled", message: "Imposta ANTHROPIC_API_KEY per abilitare il parsing automatico." }, { status: 501 });
  }

  const body = await req.json().catch(() => null);
  const paths: unknown = body?.paths;
  const name = typeof body?.name === "string" ? slugify(body.name).replace(/\.md$/, "") : "";
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 4 || !name) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const clean = paths.map((p) => safePath(String(p)));
    // tutti PDF dentro <anno>/<materia>/raw/
    const m = clean[0].match(/^(year-[123]\/[^/]+)\/raw\/[^/]+\.pdf$/i);
    if (!m || !clean.every((p) => p.startsWith(`${m[1]}/raw/`) && /\.pdf$/i.test(p))) {
      return Response.json({ error: "invalid_paths" }, { status: 400 });
    }

    const files = await Promise.all(clean.map((p) => getFileBytes(p)));
    if (files.some((f) => !f)) return Response.json({ error: "not_found" }, { status: 404 });

    const markdown = await pdfsToMarkdown(files as Buffer[]);
    const target = `${m[1]}/lectures/${name}.md`;
    await putFile(target, markdown, `Add parsed lecture: ${name}`);
    return Response.json({ ok: true, path: target });
  } catch (err) {
    console.error("[uni/parse] errore:", err);
    return Response.json({ error: "parse_failed" }, { status: 502 });
  }
}
