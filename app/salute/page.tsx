import { SaluteView } from "./SaluteView";

export const dynamic = "force-dynamic";

export default async function SalutePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  return <SaluteView date={(await searchParams).date} />;
}
