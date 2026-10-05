import { HubContext } from "./components/hub/HubContext";

export const dynamic = "force-dynamic";

/** Pagina unica e modulare: `?p=<pilastro|aira|incroci>` sceglie i widget; senza parametro è la panoramica (Oggi). */
export default async function HubPage({ searchParams }: { searchParams: Promise<{ p?: string; date?: string; path?: string; exercise?: string }> }) {
  const { p, date, path, exercise } = await searchParams;
  return <HubContext context={p} params={{ date, path, exercise }} />;
}
