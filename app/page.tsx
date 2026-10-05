import { HubContext } from "./components/hub/HubContext";

export const dynamic = "force-dynamic";

/** Pagina unica e modulare: `?p=<pilastro|aira>` sceglie i widget, senza parametro è la panoramica (Oggi). */
export default async function HubPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  return <HubContext context={p} />;
}
