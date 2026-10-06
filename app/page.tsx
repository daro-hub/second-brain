import { redirect } from "next/navigation";
import { HubContext } from "./components/hub/HubContext";

export const dynamic = "force-dynamic";

/**
 * Il radar, l'orb e la barra dei pilastri vivono nel layout. Questa pagina rende il contenuto del pilastro scelto
 * (`?p=<pilastro|aira|incroci|oggi>`), già completo e compatto; senza `p` (panoramica) non rende nulla.
 */
export default async function HubPage({ searchParams }: { searchParams: Promise<{ p?: string; detail?: string; date?: string; path?: string; exercise?: string }> }) {
  const { p, detail, date, path, exercise } = await searchParams;
  // il pilastro Conoscenza è confluito in Studio: i vecchi link continuano a funzionare
  if (p === "conoscenza") redirect("/?p=studio");
  // la schermata di un pilastro mostra subito tutto il suo contenuto; la panoramica non ha pannello
  if (!p && detail !== "1") return null;
  return (
    <div className="hub-detail">
      <HubContext context={p} params={{ date, path, exercise }} />
    </div>
  );
}
