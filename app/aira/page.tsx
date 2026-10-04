import { getBrainSnapshot } from "../../src/lib/brain";
import { AiraConsole } from "./AiraConsole";

export const metadata = { title: "Aira · Second Brain" };
// stato webhook e contatori vanno letti a ogni richiesta
export const dynamic = "force-dynamic";

export default async function AiraPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const brain = await getBrainSnapshot();
  return <AiraConsole brain={brain} initialView={view === "brain" ? "brain" : "console"} />;
}
