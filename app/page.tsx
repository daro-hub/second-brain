import { HubContext } from "./components/hub/HubContext";

export const dynamic = "force-dynamic";

/**
 * La schermata (Aira, radar, insight) vive nel layout e non si scorre. Questa pagina rende solo il pannello
 * "dettagli", quando serve: `?p=<pilastro|aira>&detail=1`, oppure `?p=incroci`, oppure `?detail=1` (Oggi).
 */
export default async function HubPage({ searchParams }: { searchParams: Promise<{ p?: string; detail?: string; date?: string; path?: string; exercise?: string }> }) {
  const { p, detail, date, path, exercise } = await searchParams;
  if (detail !== "1" && p !== "incroci") return null;
  return (
    <div className="hub-detail">
      <HubContext context={p} params={{ date, path, exercise }} />
    </div>
  );
}
