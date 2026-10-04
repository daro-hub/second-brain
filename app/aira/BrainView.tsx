"use client";

import { useMemo, useState } from "react";
import type { BrainSnapshot } from "../../src/lib/brain";

const COLORS: Record<string, string> = {
  profile: "#4de1ff",
  telegram: "#3ecf8e",
  fitness_note: "#f5a524",
};
const colorFor = (s: string) => COLORS[s] ?? "#ff7ad9";

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
    const xs = brain.docs.map((d) => d.x);
    const ys = brain.docs.map((d) => d.y);
    const minX = Math.min(...xs, 0);
    const maxX = Math.max(...xs, 1);
    const minY = Math.min(...ys, 0);
    const maxY = Math.max(...ys, 1);
    const sx = (x: number) => (maxX === minX ? W / 2 : pad + ((x - minX) / (maxX - minX)) * (W - 2 * pad));
    const sy = (y: number) => (maxY === minY ? H / 2 : pad + ((y - minY) / (maxY - minY)) * (H - 2 * pad));
    const pts = brain.docs.map((d) => ({ ...d, px: sx(d.x), py: sy(d.y) }));
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
    const cx = pts.length ? pts.reduce((t, p) => t + p.px, 0) / pts.length : W / 2;
    const cy = pts.length ? pts.reduce((t, p) => t + p.py, 0) / pts.length : H / 2;
    return { pts, edges, center: [cx, cy] as [number, number] };
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
                <stop offset="0" stopColor="#ff7ad9" stopOpacity="0.9" />
                <stop offset="1" stopColor="#ff7ad9" stopOpacity="0" />
              </radialGradient>
            </defs>
            {edges.map(([a, b], i) => (
              <line key={i} x1={pts[a].px} y1={pts[a].py} x2={pts[b].px} y2={pts[b].py} className="edge" />
            ))}
            {pts
              .filter((p) => lit.has(p.id))
              .map((p) => (
                <line key={`l${p.id}`} x1={center[0]} y1={center[1]} x2={p.px} y2={p.py} className="beam" />
              ))}
            <circle cx={center[0]} cy={center[1]} r="26" fill="url(#core-glow)" />
            <circle cx={center[0]} cy={center[1]} r="5" fill="#fff" />
            <text x={center[0]} y={center[1] + 22} className="core-lbl" textAnchor="middle">
              AIRA
            </text>
            {pts.map((p) => (
              <g key={p.id} onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)}>
                {lit.has(p.id) && <circle cx={p.px} cy={p.py} r="10" className="node-ping" style={{ stroke: colorFor(p.source) }} />}
                <circle cx={p.px} cy={p.py} r={lit.has(p.id) || hover === p.id ? 6.5 : 4.5} fill={colorFor(p.source)} className="node" opacity={lit.size && !lit.has(p.id) ? 0.4 : 0.95} />
              </g>
            ))}
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
