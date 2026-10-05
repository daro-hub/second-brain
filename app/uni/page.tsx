import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { getFileBytes, listDir, safePath } from "../../src/lib/university";
import { parsingEnabled } from "../../src/lib/uniParse";
import { UploadForm } from "./UploadForm";
import { RawActions } from "./RawActions";
import { WeekAgenda } from "./WeekAgenda";

export const dynamic = "force-dynamic";

const fmtSize = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Breadcrumbs({ path }: { path: string }) {
  const parts = path ? path.split("/") : [];
  return (
    <nav className="uni-crumbs">
      <Link href="/uni">university</Link>
      {parts.map((p, i) => (
        <span key={i}>
          {" / "}
          <Link href={`/uni?path=${encodeURIComponent(parts.slice(0, i + 1).join("/"))}`}>{p}</Link>
        </span>
      ))}
    </nav>
  );
}

export default async function UniPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const sp = await searchParams;
  let path = "";
  try {
    path = safePath(sp.path ?? "");
  } catch {
    return <p>Percorso non valido.</p>;
  }

  const isFile = /\.[a-z0-9]+$/i.test(path);
  const fileUrl = `/api/uni/file?path=${encodeURIComponent(path)}`;

  try {
    if (isFile) {
      const ext = path.split(".").pop()!.toLowerCase();
      return (
        <>
          <h2>🎓 Università</h2>
          <Breadcrumbs path={path} />
          <div className="card">
            {ext === "pdf" ? (
              <iframe src={fileUrl} className="uni-pdf" title={path} />
            ) : ext === "md" ? (
              <article className="uni-md">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {(await getFileBytes(path))?.toString("utf8") ?? "File non trovato."}
                </ReactMarkdown>
              </article>
            ) : (
              <a href={fileUrl}>Scarica {path.split("/").pop()}</a>
            )}
          </div>
        </>
      );
    }

    const entries = await listDir(path);
    const inRaw = path.split("/").at(-1) === "raw";
    const pdfs = entries.filter((e) => e.type === "file" && /\.pdf$/i.test(e.name));
    return (
      <>
        <h2>🎓 Università</h2>
        <Breadcrumbs path={path} />
        {path === "" && <WeekAgenda />}
        <div className="card">
          {entries.length === 0 ? (
            <p style={{ color: "#9aa0a6" }}>Cartella vuota.</p>
          ) : (
            <ul className="uni-list">
              {entries.map((e) => (
                <li key={e.path}>
                  <Link href={`/uni?path=${encodeURIComponent(e.path)}`}>
                    {e.type === "dir" ? "📁" : e.name.endsWith(".md") ? "📝" : "📄"} {e.name}
                  </Link>
                  {e.type === "file" && <span className="uni-size">{fmtSize(e.size)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        {inRaw && pdfs.length > 0 && <RawActions files={pdfs.map((p) => p.path)} enabled={parsingEnabled()} />}
        <UploadForm />
      </>
    );
  } catch (err) {
    console.error("[uni] errore:", err);
    const notFound = err instanceof Error && err.message === "not_found";
    return (
      <>
        <h2>🎓 Università</h2>
        <Breadcrumbs path={path} />
        <div className="card">
          <p>{notFound ? "Percorso non trovato." : "Impossibile leggere il repo (controlla UNI_GITHUB_TOKEN)."}</p>
        </div>
      </>
    );
  }
}
