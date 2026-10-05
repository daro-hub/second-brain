import { UniView } from "./UniView";

export const dynamic = "force-dynamic";

export default async function UniPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  return <UniView path={(await searchParams).path} />;
}
