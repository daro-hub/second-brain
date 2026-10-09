"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { HeartInsight, MuscleGroup, MuscleStat } from "../../src/lib/training";
import "./palestra.css";
import { Icon } from "../components/Icon";

type View = "front" | "back";
type NodeId = MuscleGroup | "cuore";

/** In quale vista si vede ciascun gruppo, e dove si aggancia la linea (coordinate dell'avatar, viewBox 220x480). */
const ANCHORS: Record<NodeId, { side: "L" | "R"; front?: [number, number]; back?: [number, number] }> = {
  spalle: { side: "L", front: [58, 90], back: [58, 90] },
  petto: { side: "L", front: [90, 104] },
  bicipiti: { side: "L", front: [49, 134] },
  addome: { side: "L", front: [101, 160] },
  cuore: { side: "R", front: [126, 110] },
  schiena: { side: "R", back: [128, 122] },
  tricipiti: { side: "R", back: [171, 134] },
  gambe: { side: "R", front: [130, 270], back: [130, 270] },
};

const CODE: Record<NodeId, string> = { spalle: "01", petto: "02", bicipiti: "03", addome: "04", cuore: "05", schiena: "06", tricipiti: "07", gambe: "08" };

const LEFT: NodeId[] = ["spalle", "petto", "bicipiti", "addome"];
const RIGHT: NodeId[] = ["cuore", "schiena", "tricipiti", "gambe"];

const TONE: Record<MuscleStat["trend"], string> = {
  up: "62 207 142",
  flat: "77 225 255",
  down: "255 93 115",
  unknown: "139 152 168",
};

const fmt = (n: number, d = 0) => n.toLocaleString("it-IT", { maximumFractionDigits: d, minimumFractionDigits: d });

function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="spark-empty">— dati insufficienti —</div>;
  const w = 120;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 3 - ((v - min) / span) * (h - 8)}`);
  const last = pts[pts.length - 1].split(",");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
    </svg>
  );
}

/** Coppia di forme speculari: ogni zona è disegnata una volta sola e riflessa sull'asse x=110. */
function Sym({ children }: { children: React.ReactNode }) {
  return (
    <>
      <g>{children}</g>
      <g transform="matrix(-1 0 0 1 220 0)">{children}</g>
    </>
  );
}

function Zone({
  group,
  muscles,
  selected,
  onSelect,
  children,
}: {
  group: MuscleGroup;
  muscles: Map<MuscleGroup, MuscleStat>;
  selected: NodeId | null;
  onSelect: (g: NodeId) => void;
  children: React.ReactNode;
}) {
  const m = muscles.get(group);
  const maxShare = Math.max(0.0001, ...[...muscles.values()].map((x) => x.share));
  const intensity = m && m.logs > 0 ? 0.08 + 0.26 * (m.share / maxShare) : 0.04;
  return (
    <g
      className={`zone${selected === group ? " sel" : ""}`}
      style={{ ["--tone" as string]: TONE[m?.trend ?? "unknown"], ["--fill" as string]: intensity }}
      onClick={() => onSelect(group)}
      onMouseEnter={() => onSelect(group)}
    >
      {children}
    </g>
  );
}

function Body({
  view,
  muscles,
  selected,
  onSelect,
  bpm,
}: {
  view: View;
  muscles: Map<MuscleGroup, MuscleStat>;
  selected: NodeId | null;
  onSelect: (g: NodeId) => void;
  bpm: number;
}) {
  const z = { muscles, selected, onSelect };
  return (
    <svg viewBox="0 0 220 480" className="body-svg" role="img" aria-label={`Avatar, vista ${view === "front" ? "frontale" : "posteriore"}`}>
      <defs>
        <linearGradient id="bodyfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(10, 132, 255,0.16)" />
          <stop offset="1" stopColor="rgba(10, 132, 255,0.03)" />
        </linearGradient>
      </defs>

      {/* silhouette neutra: testa, collo, avambracci, mani, bacino, ginocchia, piedi */}
      <g className="neutral">
        <ellipse cx="110" cy="34" rx="16" ry="21" />
        <rect x="102" y="54" width="16" height="16" rx="4" />
        <Sym>
          <ellipse cx="43" cy="192" rx="9" ry="29" transform="rotate(7 43 192)" />
          <ellipse cx="38" cy="236" rx="7" ry="11" />
          <ellipse cx="90" cy="333" rx="10" ry="9" />
          <path d="M86 424 L82 462 C82 470 100 470 104 462 L102 424 Z" />
        </Sym>
        <path d="M84 192 L136 192 L142 212 L110 232 L78 212 Z" />
      </g>

      {view === "front" ? (
        <>
          <Zone group="spalle" {...z}>
            <Sym>
              <ellipse cx="62" cy="94" rx="15" ry="21" transform="rotate(18 62 94)" />
            </Sym>
          </Zone>
          <Zone group="petto" {...z}>
            <Sym>
              <path d="M108 80 L108 126 C92 135 74 128 70 110 C69 94 82 83 108 80 Z" />
            </Sym>
          </Zone>
          <Zone group="bicipiti" {...z}>
            <Sym>
              <ellipse cx="51" cy="136" rx="11" ry="27" transform="rotate(7 51 136)" />
            </Sym>
          </Zone>
          <Zone group="addome" {...z}>
            <Sym>
              {[132, 148, 164, 180].map((y) => (
                <rect key={y} x="97" y={y} width="12" height="13" rx="3" />
              ))}
              <path d="M86 130 L95 133 L95 192 L88 186 C84 170 82 148 86 130 Z" />
            </Sym>
          </Zone>
          <Zone group="gambe" {...z}>
            <Sym>
              <path d="M101 212 C86 212 77 224 75 252 C73 290 79 318 86 326 L103 326 C107 300 109 250 109 212 Z" />
              <path d="M85 342 C78 362 80 394 88 420 L100 420 C104 394 106 362 103 342 Z" />
            </Sym>
          </Zone>
          <g className="heart-wrap" style={{ ["--beat" as string]: `${60 / Math.max(40, Math.min(bpm, 200))}s` }} onMouseEnter={() => onSelect("cuore")} onClick={() => onSelect("cuore")}>
            <path
              className={`heart${selected === "cuore" ? " sel" : ""}`}
              d="M126 118 C113 108 117 98 122 99 C124 99 126 101 126 103 C126 101 128 99 130 99 C135 98 139 108 126 118 Z"
            />
          </g>
        </>
      ) : (
        <>
          <Zone group="spalle" {...z}>
            <Sym>
              <ellipse cx="62" cy="94" rx="15" ry="21" transform="rotate(18 62 94)" />
            </Sym>
          </Zone>
          <Zone group="schiena" {...z}>
            <path d="M110 66 L134 76 L152 88 L110 114 L68 88 L86 76 Z" />
            <Sym>
              <path d="M77 98 C70 124 80 154 100 174 L109 174 L109 116 Z" />
            </Sym>
            <path d="M99 162 L121 162 L119 192 L101 192 Z" />
          </Zone>
          <Zone group="tricipiti" {...z}>
            <Sym>
              <ellipse cx="51" cy="136" rx="11" ry="27" transform="rotate(7 51 136)" />
            </Sym>
          </Zone>
          <Zone group="gambe" {...z}>
            <Sym>
              <ellipse cx="96" cy="218" rx="15" ry="16" />
              <path d="M101 240 C88 240 79 252 77 274 C75 300 80 318 86 326 L103 326 C107 300 109 270 109 240 Z" />
              <path d="M85 342 C78 362 80 394 88 420 L100 420 C104 394 106 362 103 342 Z" />
            </Sym>
          </Zone>
        </>
      )}

      {/* punti di aggancio per le linee verso le schede */}
      {(Object.keys(ANCHORS) as NodeId[]).map((id) => {
        const p = ANCHORS[id][view];
        return p ? <circle key={id} data-anchor={id} cx={p[0]} cy={p[1]} r="2.2" className={`anchor${selected === id ? " sel" : ""}`} /> : null;
      })}
    </svg>
  );
}

function Ruler() {
  const marks = [];
  for (let i = 0; i <= 19; i++) {
    marks.push(
      <g key={i} transform={`translate(0 ${(i / 19) * 456 + 12})`}>
        <line x1="0" x2={i % 5 === 0 ? 14 : 7} stroke="rgb(var(--ov) / 0.45)" />
        {i % 5 === 0 && <text x="18" y="3">{`${190 - i * 10}`}</text>}
      </g>,
    );
  }
  return (
    <svg className="ruler-v" viewBox="0 0 40 480" aria-hidden>
      {marks}
    </svg>
  );
}

export function BodyStage({ muscles, heart }: { muscles: MuscleStat[]; heart: HeartInsight }) {
  const map = useMemo(() => new Map(muscles.map((m) => [m.group, m])), [muscles]);
  const firstWithData = muscles.find((m) => m.logs > 0)?.group ?? "petto";
  const [view, setView] = useState<View>("front");
  const [flip, setFlip] = useState(false);
  const [selected, setSelected] = useState<NodeId>(firstWithData);
  const [lines, setLines] = useState<{ id: NodeId; d: string; ax: number; ay: number; visible: boolean }[]>([]);
  const [scan, setScan] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Partial<Record<NodeId, HTMLDivElement | null>>>({});
  const bpm = heart.restingNow ?? 62;

  // contatore di "scansione" all'avvio: tocco da hangar, finisce a 100
  useEffect(() => {
    let v = 0;
    const id = setInterval(() => {
      v += 4;
      setScan(Math.min(v, 100));
      if (v >= 100) clearInterval(id);
    }, 24);
    return () => clearInterval(id);
  }, []);

  const flipTo = useCallback(
    (next: View) => {
      if (next === view) return;
      setFlip(true);
      setTimeout(() => {
        setView(next);
        setTimeout(() => setFlip(false), 30);
      }, 260);
    },
    [view],
  );

  const select = useCallback((id: NodeId) => setSelected(id), []);

  const measure = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (window.innerWidth < 940) {
      setLines([]);
      return;
    }
    const sr = stage.getBoundingClientRect();
    const out: typeof lines = [];
    (Object.keys(ANCHORS) as NodeId[]).forEach((id) => {
      const card = cardRefs.current[id];
      const anchor = stage.querySelector<SVGCircleElement>(`[data-anchor="${id}"]`);
      const cfg = ANCHORS[id];
      if (!card) return;
      const cr = card.getBoundingClientRect();
      const sy = cr.top - sr.top + cr.height / 2;
      const sx = cfg.side === "L" ? cr.right - sr.left : cr.left - sr.left;
      if (!anchor) {
        out.push({ id, d: "", ax: 0, ay: 0, visible: false });
        return;
      }
      const ar = anchor.getBoundingClientRect();
      const ax = ar.left - sr.left + ar.width / 2;
      const ay = ar.top - sr.top + ar.height / 2;
      const gx = sx + (cfg.side === "L" ? 26 : -26);
      out.push({ id, d: `M${sx},${sy} L${gx},${sy} L${ax},${ay}`, ax, ay, visible: true });
    });
    setLines(out);
  }, []);

  useLayoutEffect(() => {
    measure();
    const t = setTimeout(measure, 350); // dopo il cambio di vista
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  }, [measure, view, flip, muscles]);

  const sel = selected === "cuore" ? null : map.get(selected);

  const card = (id: NodeId) => {
    const cfg = ANCHORS[id];
    const visibleHere = Boolean(cfg[view]);
    if (id === "cuore") {
      return (
        <div
          key={id}
          ref={(el) => {
            cardRefs.current[id] = el;
          }}
          className={`ncard heart-card${selected === id ? " sel" : ""}${visibleHere ? "" : " dim"}`}
          style={{ ["--tone" as string]: "255 93 115" }}
          onMouseEnter={() => select(id)}
          onClick={() => {
            select(id);
            flipTo("front");
          }}
        >
          <div className="n-head">
            <span className="n-code">{CODE.cuore} · CUORE</span>
            {heart.restingAvg14 !== null && heart.restingNow !== null && (
              <span className={`n-trend ${heart.restingNow - heart.restingAvg14 <= 0 ? "up" : "down"}`}>
                {heart.restingNow - heart.restingAvg14 <= 0 ? "▼" : "▲"} {fmt(Math.abs(heart.restingNow - heart.restingAvg14), 1)}
              </span>
            )}
          </div>
          <div className="n-big">
            {heart.restingNow !== null ? fmt(heart.restingNow) : "—"}
            <small>bpm a riposo</small>
          </div>
          <Spark values={heart.restingSeries} color="#ff453a" />
          <div className="n-sub">
            {heart.sessionAvg !== null ? `${fmt(heart.sessionAvg)} bpm medi in allenamento` : "nessun dato nelle sessioni"}
            {heart.sessionMax ? ` · picco ${fmt(heart.sessionMax)}` : ""}
          </div>
        </div>
      );
    }
    const m = map.get(id)!;
    const color = `rgb(${TONE[m.trend].split(" ").join(",")})`;
    return (
      <div
        key={id}
        ref={(el) => {
          cardRefs.current[id] = el;
        }}
        className={`ncard${selected === id ? " sel" : ""}${visibleHere ? "" : " dim"}`}
        style={{ ["--tone" as string]: TONE[m.trend] }}
        onMouseEnter={() => select(id)}
        onClick={() => {
          select(id);
          if (!visibleHere) flipTo(ANCHORS[id].front ? "front" : "back");
        }}
      >
        <div className="n-head">
          <span className="n-code">{CODE[id]} · {m.label.toUpperCase()}</span>
          {m.deltaPct !== null ? (
            <span className={`n-trend ${m.trend}`}>
              {m.trend === "down" ? "▼" : m.trend === "up" ? "▲" : "▬"} {m.deltaPct > 0 ? "+" : ""}
              {fmt(m.deltaPct)}%
            </span>
          ) : (
            <span className="n-trend unknown">n/d</span>
          )}
        </div>
        <div className="n-big">
          {m.bestRm ? fmt(m.bestRm, 1) : "—"}
          <small>kg · 1RM stimato</small>
        </div>
        <Spark values={m.spark} color={color} />
        <div className="n-rate" title={m.ratingExercise ? `Riferimento: ${m.ratingExercise} · ${fmt(m.ratio ?? 0, 2)}× il peso corporeo` : "servono almeno 3 serie"}>
          <span>POTENZA</span>
          <div className="n-rate-bar"><i style={{ width: `${m.rating ?? 0}%` }} /></div>
          <b>{m.rating ?? "—"}</b>
          <em>{m.level}{m.rank ? ` · #${m.rank}` : ""}</em>
        </div>
        <div className="n-sub">
          {m.bestExercise ? `${m.bestExercise} · ` : ""}
          {fmt(m.sets)} serie · {fmt(m.share * 100)}% volume
          {!visibleHere && <b className="n-flip"> <Icon name="rotate" size={12} /> {ANCHORS[id].front ? "fronte" : "retro"}</b>}
        </div>
      </div>
    );
  };

  return (
    <div className="stage-wrap">
      <div className="stage" ref={stageRef}>
        <svg className="lines" aria-hidden>
          {lines.map((l) =>
            l.visible ? (
              <g key={l.id} className={selected === l.id ? "ln sel" : "ln"}>
                <path d={l.d} className="ln-path" />
                <circle cx={l.ax} cy={l.ay} r="9" className="ln-ring" />
              </g>
            ) : null,
          )}
        </svg>

        <div className="col col-l">{LEFT.map(card)}</div>

        <div className="center">
          <div className="hud-top">
            <span>
              SCAN <b>{String(scan).padStart(3, "0")}%</b>
            </span>
            <span>
              VISTA <b>{view === "front" ? "FRONTALE" : "POSTERIORE"}</b>
            </span>
          </div>
          <div className="avatar">
            <div className="ring r1" />
            <div className="ring r2" />
            <div className="ring r3" />
            <Ruler />
            <div className={`flip${flip ? " flipping" : ""}`}>
              <Body view={view} muscles={map} selected={selected} onSelect={select} bpm={bpm} />
            </div>
            <div className="scanplane" />
          </div>
          <div className="view-toggle" role="tablist">
            <button className={view === "front" ? "on" : ""} onClick={() => flipTo("front")}>
              FRONTE
            </button>
            <button className={view === "back" ? "on" : ""} onClick={() => flipTo("back")}>
              RETRO
            </button>
          </div>
          <div className="legend-row">
            <span style={{ ["--c" as string]: "62 207 142" }}>in crescita</span>
            <span style={{ ["--c" as string]: "77 225 255" }}>stabile</span>
            <span style={{ ["--c" as string]: "255 93 115" }}>in calo</span>
            <span style={{ ["--c" as string]: "139 152 168" }}>dati insufficienti</span>
          </div>
        </div>

        <div className="col col-r">{RIGHT.map(card)}</div>
      </div>

      <div className="detail">
        {sel ? (
          <>
            <div className="detail-head">
              <span className="n-code">DETTAGLIO · {sel.label.toUpperCase()}</span>
              <span className="muted small">{sel.verdict}{sel.lastTrainedKey ? ` · ultimo allenamento ${sel.lastTrainedKey}` : ""}</span>
            </div>
            {sel.exercises.length === 0 ? (
              <p className="muted small">Nessun esercizio registrato per questo gruppo.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Esercizio</th>
                    <th>Sessioni</th>
                    <th>Miglior 1RM</th>
                    <th>Ultimo 1RM</th>
                    <th>Variazione</th>
                  </tr>
                </thead>
                <tbody>
                  {sel.exercises.map((e) => (
                    <tr key={e.name}>
                      <td style={{ textTransform: "capitalize" }}>{e.name}</td>
                      <td>{e.logs}</td>
                      <td>
                        <b>{fmt(e.bestRm, 1)}</b> kg
                      </td>
                      <td>{fmt(e.lastRm, 1)} kg</td>
                      <td className={e.logs >= 3 ? (e.deltaPct > 4 ? "pos" : e.deltaPct < -4 ? "neg" : "") : "muted"}>
                        {e.logs >= 3 ? `${e.deltaPct > 0 ? "+" : ""}${fmt(e.deltaPct)}%` : "n/d"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <>
            <div className="detail-head">
              <span className="n-code">DETTAGLIO · CUORE</span>
              <span className="muted small">battito a riposo e durante gli allenamenti (Apple Health + Strava)</span>
            </div>
            {heart.sessions.length === 0 ? (
              <p className="muted small">Nessuna sessione recente con dati di battito.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Sessione</th>
                    <th>Data</th>
                    <th>Durata</th>
                    <th>Media</th>
                    <th>Picco</th>
                  </tr>
                </thead>
                <tbody>
                  {heart.sessions.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{s.dateKey}</td>
                      <td>{s.minutes} min</td>
                      <td>{s.avgHr !== null ? <b>{fmt(s.avgHr)} bpm</b> : <span className="muted">n/d</span>}</td>
                      <td>{s.maxHr !== null ? `${fmt(s.maxHr)} bpm` : <span className="muted">n/d</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
