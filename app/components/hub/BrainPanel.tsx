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
        <Link href="/?console=1" className="muted small">apri la chat con Aira →</Link>
      </div>
      <div className="hub-brain" style={{ ["--a-cyan" as string]: "#0a84ff", ["--a-teal" as string]: "#64d2ff", ["--a-rose" as string]: "#ff375f", ["--a-violet" as string]: "#bf5af2", ["--a-line" as string]: "rgba(10, 132, 255,0.22)", ["--a-panel" as string]: "rgba(8,16,26,0.72)" }}>
        <BrainView brain={brain} lit={new Set()} />
      </div>
    </div>
  );
}
