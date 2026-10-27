import { redirect } from "next/navigation";
import { isEnabled } from "../../src/lib/modules";

// La console vive nella pagina unica: l'orb centrale apre chat e fonti. La vista "cervello" è nello Status.
export default async function AiraPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  redirect(view === "brain" || !isEnabled("webchat") ? "/?p=aira&detail=1" : "/?console=1");
}
