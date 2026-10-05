import { PalestraView } from "./PalestraView";

export const dynamic = "force-dynamic";

export default async function PalestraPage({ searchParams }: { searchParams: Promise<{ exercise?: string }> }) {
  return <PalestraView exercise={(await searchParams).exercise} />;
}
