import Link from "next/link";

export function Sidebar() {
  return (
    <nav className="sidebar">
      <h1>Second Brain</h1>
      <Link href="/palestra">Palestra</Link>
      <Link href="/bot">Bot</Link>
    </nav>
  );
}
