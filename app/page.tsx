import { redirect } from "next/navigation";
import { HubContext } from "./components/hub/HubContext";

export const dynamic = "force-dynamic";

/**
 * Il radar, l'orb e la barra dei pilastri vivono nel layout. Questa pagina rende il contenuto del pilastro scelto
 * (`?p=<pilastro|aira|incroci|oggi>`), già completo e compatto; senza `p` (panoramica) non rende nulla.
 */
export default async function HubPage({ searchParams }: { searchParams: Promise<{ p?: string; console?: string; detail?: string; date?: string; path?: string; exercise?: string }> }) {
  const { p, console: chat, detail, date, path, exercise } = await searchParams;
  // il pilastro Conoscenza è confluito in Studio: i vecchi link continuano a funzionare
  if (p === "conoscenza") redirect("/?p=studio");
  // la home è la schermata Progressi; la chat (?console=1) vive nel layout e qui non rende nulla
  if (!p && !chat && detail !== "1") redirect("/?p=progressi");
  if (!p && detail !== "1") return null;
  return (
    <div className="hub-detail">
      <HubContext context={p} params={{ date, path, exercise }} />
    </div>
  );
}
