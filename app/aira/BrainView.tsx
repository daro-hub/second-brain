"use client";

import { useMemo, useState } from "react";
import type { BrainSnapshot } from "../../src/lib/brain";

const COLORS: Record<string, string> = {
  profile: "#0a84ff",
  telegram: "#30d158",
  fitness_note: "#ff9f0a",
};
const colorFor = (s: string) => COLORS[s] ?? "#ff375f";

/**
 * Mappa del cervello: ogni punto è una nota della KB, posizionata per somiglianza semantica reale
 * (PCA a 2 dimensioni sugli embedding). Le note appena consultate da Aira si accendono e vengono
 * collegate al nucleo; ogni nota è unita alle due più vicine per dare l'idea della rete.
 */
export function BrainView({ brain, lit }: { brain: BrainSnapshot; lit: Set<string> }) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 760;
  const H = 480;
  const pad = 36;

  const { pts, edges, center } = useMemo(() => {
    // Scala UNIFORME attorno al baricentro (la forma resta fedele alla PCA) in modo che l'intera
    // rete stia dentro un cerchio: così può ruotare senza uscire dai bordi.
    const n = brain.docs.length || 1;
    const mx = brain.docs.reduce((t, d) => t + d.x, 0) / n;
    const my = brain.docs.reduce((t, d) => t + d.y, 0) / n;
    const maxR = Math.max(1e-9, ...brain.docs.map((d) => Math.hypot(d.x - mx, d.y - my)));
    const k = (H / 2 - pad) / maxR;
    const pts = brain.docs.map((d) => ({ ...d, px: W / 2 + (d.x - mx) * k, py: H / 2 + (d.y - my) * k }));
    const edges: [number, number][] = [];
    pts.forEach((p, i) => {
      pts
        .map((q, j) => ({ j, d: i === j ? Infinity : (p.px - q.px) ** 2 + (p.py - q.py) ** 2 }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
        .forEach(({ j }) => {
          if (!edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) edges.push([i, j]);
        });
    });
    return { pts, edges, center: [W / 2, H / 2] as [number, number] };
  }, [brain.docs]);

  const active = pts.find((p) => p.id === hover) ?? pts.find((p) => lit.has(p.id)) ?? null;

  return (
    <div className="brain-grid">
      <div className="brain-col">
        <div className="hud-label">STATO DEL CERVELLO</div>
        <div className="brain-stats">
          <div className="bs">
            <b className={brain.webhook.active ? "ok" : "ko"}>{brain.webhook.active ? "ATTIVO" : "SPENTO"}</b>
            <span>webhook Telegram{brain.webhook.pending ? ` · ${brain.webhook.pending} in coda` : ""}</span>
          </div>
          <div className="bs">
            <b>{brain.totalDocuments}</b>
            <span>voci nella knowledge base</span>
          </div>
          <div className="bs">
            <b>{brain.totalLogs}</b>
            <span>allenamenti registrati</span>
          </div>
        </div>
        <div className="hud-label" style={{ marginTop: 16 }}>
          INTEGRAZIONI
        </div>
        <ul className="integrations">
          {brain.integrations.map((i) => (
            <li key={i.id}>
              <i className={i.ok ? "ok" : "ko"} />
              <span>
                <b>{i.label}</b>
                <em>{i.detail}</em>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="brain-map">
        <div className="hud-label">
          MAPPA DELLA KNOWLEDGE BASE
          <span className="intent-tag">{lit.size ? `${lit.size} ${lit.size === 1 ? "nota consultata" : "note consultate"}` : "somiglianza semantica"}</span>
        </div>
        {pts.length === 0 ? (
          <p className="empty">Nessuna nota ancora.</p>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="brain-svg">
            <defs>
              <radialGradient id="core-glow">
                <stop offset="0" stopColor="#ff375f" stopOpacity="0.9" />
                <stop offset="1" stopColor="#ff375f" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g className="rotor">
            {edges.map(([a, b], i) => (
              <line key={i} x1={pts[a].px} y1={pts[a].py} x2={pts[b].px} y2={pts[b].py} className="edge" />
            ))}
            {pts
              .filter((p) => lit.has(p.id))
              .map((p) => (
                <line key={`l${p.id}`} x1={center[0]} y1={center[1]} x2={p.px} y2={p.py} className="beam" />
              ))}
            {pts.map((p, i) => (
              <g key={p.id} onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)}>
                {lit.has(p.id) && <circle cx={p.px} cy={p.py} r="10" className="node-ping" style={{ stroke: colorFor(p.source) }} />}
                <circle cx={p.px} cy={p.py} r={lit.has(p.id) || hover === p.id ? 6.5 : 4.5} fill={colorFor(p.source)} className="node" style={{ animationDelay: `${(i % 9) * -0.7}s` }} opacity={lit.size && !lit.has(p.id) ? 0.4 : 0.95} />
              </g>
            ))}
            </g>
            <circle cx={center[0]} cy={center[1]} r="26" fill="url(#core-glow)" />
            <circle cx={center[0]} cy={center[1]} r="5" fill="#fff" />
            <text x={center[0]} y={center[1] + 22} className="core-lbl" textAnchor="middle">
              AIRA
            </text>

          </svg>
        )}
        <div className="legend-row" style={{ justifyContent: "flex-start" }}>
          {brain.sources.map((s) => (
            <span key={s.source} style={{ ["--c" as string]: parseColor(colorFor(s.source)) }}>
              {s.source} · {s.count}
            </span>
          ))}
        </div>
      </div>

      <div className="brain-col">
        <div className="hud-label">NOTA</div>
        {active ? (
          <article className="src-card" style={{ borderLeftColor: colorFor(active.source) }}>
            <div className="src-head">
              <div>
                <div className="src-label">{active.source}</div>
                <div className="src-sum">{lit.has(active.id) ? "consultata per l'ultima risposta" : "passa il mouse sui punti per leggerle"}</div>
              </div>
            </div>
            <p className="doc-text">{active.content}</p>
          </article>
        ) : (
          <p className="empty">Passa il mouse su un punto per leggere la nota. Quando Aira risponde dalla sua memoria, le note usate si accendono e si collegano al nucleo.</p>
        )}
      </div>
    </div>
  );
}

function parseColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
