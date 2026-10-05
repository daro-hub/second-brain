import { redirect } from "next/navigation";

// Tutto vive nella pagina unica: questa route resta solo per i vecchi link e i segnalibri.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const qs = new URLSearchParams({ p: "incroci" });
  for (const [k, v] of Object.entries(await searchParams)) if (v && k !== "p") qs.set(k, v);
  redirect(`/?${qs}`);
}
