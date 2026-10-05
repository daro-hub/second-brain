"use client";

import Link from "next/link";
import type { BrainSnapshot } from "../../../src/lib/brain";
import { BrainView } from "../../aira/BrainView";
import "../../aira/aira.css";

/** La rete neurale (mappa PCA della knowledge base) dentro il contesto Aira. */
export function BrainPanel({ brain }: { brain: BrainSnapshot }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>Rete neurale</h3>
        <Link href="/aira" className="muted small">chat e voce a schermo intero →</Link>
      </div>
      <div className="hub-brain" style={{ ["--a-cyan" as string]: "#4de1ff", ["--a-teal" as string]: "#5eead4", ["--a-rose" as string]: "#ff7ad9", ["--a-violet" as string]: "#b78cff", ["--a-line" as string]: "rgba(77,225,255,0.22)", ["--a-panel" as string]: "rgba(8,16,26,0.72)" }}>
        <BrainView brain={brain} lit={new Set()} />
      </div>
    </div>
  );
}
