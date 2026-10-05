import { redirect } from "next/navigation";

// La console vive nella pagina unica: l'orb centrale apre chat e fonti. La vista "cervello" è nello Status.
export default async function AiraPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  redirect(view === "brain" ? "/?p=aira&detail=1" : "/?console=1");
}
