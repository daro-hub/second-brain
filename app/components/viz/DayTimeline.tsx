import type { DayBundle } from "../../../src/lib/overview";
import { localHourDecimal } from "../../../src/lib/time";

const W = 960;
const H = 392;
const L = 54;
const R = 16;
const PLOT_W = W - L - R;
const PLOT_TOP = 124;
const PLOT_BOTTOM = 318;
const PLOT_H = PLOT_BOTTOM - PLOT_TOP;

const x = (hour: number) => L + (Math.min(Math.max(hour, 0), 24) / 24) * PLOT_W;

const COLORS = {
  heart: "#ff5d73",
  steps: "#34d399",
  meal: "#f5a524",
  study: "#5eead4",
  lesson: "#f9a8d4",
  event: "#9ca3b8",
  weights: "#7aa2ff",
  run: "#b78cff",
  walk: "#3cc7e0",
  other: "#8b94a9",
};

const typeColor = (t: string) =>
  t === "WeightTraining" || t === "Workout"
    ? COLORS.weights
    : t === "Run" || t === "TrailRun"
      ? COLORS.run
      : t === "Walk" || t === "Hike"
        ? COLORS.walk
        : COLORS.other;

const typeLabel = (t: string) =>
  t === "WeightTraining" ? "Pesi" : t === "Run" ? "Corsa" : t === "Walk" ? "Camminata" : t;

function clip(text: string, widthPx: number, charPx = 6.1): string {
  const max = Math.floor(widthPx / charPx);
  if (max < 3) return "";
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

/** Unisce pasti vicini (< 45 min) in un unico segnaposto, altrimenti le etichette si sovrappongono. */
function groupMeals(meals: DayBundle["nutrition"]["meals"]) {
  const out: { hour: number; kcal: number; protein: number; parts: string[] }[] = [];
  for (const m of meals) {
    const h = localHourDecimal(m.at);
    const last = out[out.length - 1];
    const label = `${Math.round(m.kcal)} kcal · P${Math.round(m.proteinG)} C${Math.round(m.carbsG)} G${Math.round(m.fatG)}`;
    if (last && h - last.hour < 0.75) {
      last.kcal += m.kcal;
      last.protein += m.proteinG;
      last.parts.push(label);
    } else {
      out.push({ hour: h, kcal: m.kcal, protein: m.proteinG, parts: [label] });
    }
  }
  return out;
}

export function DayTimeline({ bundle }: { bundle: DayBundle }) {
  const { hr, steps, nutrition, schedule, events, activities, gymLogs, nowHour } = bundle;

  const hrMax = Math.max(120, Math.ceil(((hr.max ?? 100) + 5) / 20) * 20);
  const hrMin = 40;
  const yHr = (v: number) => PLOT_BOTTOM - ((v - hrMin) / (hrMax - hrMin)) * PLOT_H;

  const maxSteps = Math.max(...steps.hourly, 1);
  const hrTicks: number[] = [];
  for (let v = hrMin; v <= hrMax; v += 20) hrTicks.push(v);

  // Linea del battito: si interrompe dove mancano dati per più di 45 minuti
  const segments: { hour: number; avg: number; min: number; max: number }[][] = [];
  for (const p of hr.points) {
    const cur = segments[segments.length - 1];
    if (cur && p.hour - cur[cur.length - 1].hour <= 0.75) cur.push(p);
    else segments.push([p]);
  }

  const meals = groupMeals(nutrition.meals);
  const hasHr = hr.points.length > 0;
  const hasSteps = steps.total > 0;

  return (
    <div className="viz-scroll" style={{ overflowX: "auto" }}>
      <svg className="viz" viewBox={`0 0 ${W} ${H}`} role="img" style={{ minWidth: 760 }}>
        {/* fasce notte */}
        <rect x={x(0)} y={PLOT_TOP} width={x(6) - x(0)} height={PLOT_H} fill="rgba(255,255,255,0.025)" />
        <rect x={x(22)} y={PLOT_TOP} width={x(24) - x(22)} height={PLOT_H} fill="rgba(255,255,255,0.025)" />

        {/* griglia orizzontale + asse battito */}
        {hrTicks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={yHr(v)} y2={yHr(v)} stroke="#1f2536" strokeWidth={1} />
            <text x={L - 8} y={yHr(v) + 3.5} textAnchor="end" fontSize={10} fill="#5b6478">
              {v}
            </text>
          </g>
        ))}
        <text x={L - 8} y={PLOT_TOP - 8} textAnchor="end" fontSize={9.5} fill="#ff8da0">
          bpm
        </text>

        {/* asse orario */}
        {Array.from({ length: 9 }, (_, i) => i * 3).map((h) => (
          <g key={h}>
            <line x1={x(h)} x2={x(h)} y1={PLOT_TOP} y2={PLOT_BOTTOM} stroke="#181d2b" strokeWidth={1} />
            <text x={x(h)} y={PLOT_BOTTOM + 17} textAnchor="middle" fontSize={10.5} fill="#7a8398">
              {String(h).padStart(2, "0")}:00
            </text>
          </g>
        ))}

        {/* corsia agenda: studio/lezioni (riga alta) + eventi calendario (riga bassa) */}
        <text x={4} y={30} fontSize={9.5} fill="#5b6478" fontWeight={700}>
          AGENDA
        </text>
        {schedule.length === 0 && events.filter((e) => !e.allDay).length === 0 && (
          <text x={x(0) + 8} y={42} fontSize={11} fill="#4a5266">
            Nessuna lezione o evento
          </text>
        )}
        {schedule.map((s, i) => {
          const w = x(s.endH) - x(s.startH);
          const color = s.type === "studio" ? COLORS.study : COLORS.lesson;
          return (
            <g key={`s${i}`}>
              <title>{`${s.type === "studio" ? "Studio" : "Lezione"} · ${s.subject} (${fmt(s.startH)}–${fmt(s.endH)})`}</title>
              <rect x={x(s.startH)} y={16} width={w} height={20} rx={6} fill={color} fillOpacity={0.22} stroke={color} strokeOpacity={0.7} />
              <text x={x(s.startH) + 7} y={30} fontSize={10.5} fill={color} fontWeight={600}>
                {clip(s.subject, w - 12)}
              </text>
            </g>
          );
        })}
        {events
          .filter((e) => !e.allDay)
          .map((e, i) => {
            const w = Math.max(x(e.endH) - x(e.startH), 26);
            return (
              <g key={`e${i}`}>
                <title>{`${e.summary} (${fmt(e.startH)}–${fmt(e.endH)})${e.location ? ` · ${e.location}` : ""}`}</title>
                <rect x={x(e.startH)} y={40} width={w} height={20} rx={6} fill={COLORS.event} fillOpacity={0.2} stroke={COLORS.event} strokeOpacity={0.7} />
                <text x={x(e.startH) + 7} y={54} fontSize={10.5} fill="#cdd3e4" fontWeight={600}>
                  {clip(e.summary, w - 12)}
                </text>
              </g>
            );
          })}

        {/* corsia sport: attività Strava (orari reali) + serie registrate */}
        <text x={4} y={96} fontSize={9.5} fill="#5b6478" fontWeight={700}>
          SPORT
        </text>
        {activities.filter((a) => a.movingTimeMin > 0).length === 0 && gymLogs.length === 0 && (
          <text x={x(0) + 8} y={96} fontSize={11} fill="#4a5266">
            Nessun allenamento registrato
          </text>
        )}
        {activities
          .filter((a) => a.movingTimeMin > 0)
          .map((a) => {
            const start = a.startHour;
            const end = Math.min(24, start + a.movingTimeMin / 60);
            const w = Math.max(x(end) - x(start), 22);
            const c = typeColor(a.type);
            return (
              <g key={a.id}>
                <title>{`${typeLabel(a.type)} · ${a.name} — ${a.movingTimeMin} min${a.distanceKm ? ` · ${a.distanceKm} km` : ""}`}</title>
                <rect x={x(start)} y={80} width={w} height={24} rx={7} fill={c} fillOpacity={0.28} stroke={c} />
                <text x={x(start) + 7} y={96} fontSize={10.5} fill={c} fontWeight={700}>
                  {clip(`${typeLabel(a.type)} ${a.movingTimeMin}′`, w - 12)}
                </text>
              </g>
            );
          })}
        {gymLogs.map((g, i) => {
          const h = localHourDecimal(g.performedAt);
          return (
            <g key={`g${i}`}>
              <title>{`${g.exercise} — ${g.weightKg} kg × ${g.reps} (${fmt(h)})`}</title>
              <path d={`M ${x(h)} 82 l 7 11 l -7 11 l -7 -11 z`} fill={COLORS.weights} stroke="#0a0c11" strokeWidth={1.5} />
            </g>
          );
        })}

        {/* passi per ora (barre) */}
        {hasSteps &&
          steps.hourly.map((v, h) => {
            if (v <= 0) return null;
            const bh = (v / maxSteps) * PLOT_H * 0.4;
            return (
              <g key={`st${h}`}>
                <title>{`${String(h).padStart(2, "0")}:00 · ${Math.round(v)} passi`}</title>
                <rect x={x(h) + 2} y={PLOT_BOTTOM - bh} width={PLOT_W / 24 - 4} height={bh} rx={3} fill={COLORS.steps} fillOpacity={0.5} />
              </g>
            );
          })}

        {/* battito: fascia min–max + linea della media */}
        {segments.map((seg, i) => {
          if (seg.length < 2) {
            const p = seg[0];
            return <circle key={`hp${i}`} cx={x(p.hour)} cy={yHr(p.avg)} r={2.5} fill={COLORS.heart} />;
          }
          const top = seg.map((p) => `${x(p.hour)},${yHr(p.max)}`);
          const bottom = [...seg].reverse().map((p) => `${x(p.hour)},${yHr(p.min)}`);
          const line = seg.map((p) => `${x(p.hour)},${yHr(p.avg)}`).join(" ");
          return (
            <g key={`hs${i}`}>
              <polygon points={[...top, ...bottom].join(" ")} fill={COLORS.heart} fillOpacity={0.14} />
              <polyline points={line} fill="none" stroke={COLORS.heart} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
        {!hasHr && (
          <text x={x(12)} y={(PLOT_TOP + PLOT_BOTTOM) / 2} textAnchor="middle" fontSize={12} fill="#5b6478">
            Nessun dato di battito per questo giorno
          </text>
        )}

        {/* pasti */}
        {meals.map((m, i) => (
          <g key={`m${i}`}>
            <title>{`🍽 ${fmt(m.hour)} · ${Math.round(m.kcal)} kcal, ${Math.round(m.protein)} g proteine\n${m.parts.join("\n")}`}</title>
            <line x1={x(m.hour)} x2={x(m.hour)} y1={PLOT_TOP + 8} y2={PLOT_BOTTOM} stroke={COLORS.meal} strokeOpacity={0.55} strokeDasharray="3 4" />
            <circle cx={x(m.hour)} cy={PLOT_TOP + 8} r={5} fill={COLORS.meal} />
            <text x={x(m.hour)} y={PLOT_TOP - 2} textAnchor="middle" fontSize={10.5} fill={COLORS.meal} fontWeight={700}>
              {Math.round(m.kcal)} kcal
            </text>
          </g>
        ))}

        {/* adesso */}
        {nowHour !== null && (
          <g>
            <line x1={x(nowHour)} x2={x(nowHour)} y1={14} y2={PLOT_BOTTOM} stroke="#7aa2ff" strokeWidth={1.4} strokeDasharray="4 4" />
            <rect x={x(nowHour) - 17} y={PLOT_BOTTOM + 24} width={34} height={17} rx={8} fill="#7aa2ff" />
            <text x={x(nowHour)} y={PLOT_BOTTOM + 36} textAnchor="middle" fontSize={10.5} fill="#0a0c11" fontWeight={800}>
              ora
            </text>
          </g>
        )}
      </svg>
      <div className="legend">
        <span><i style={{ background: COLORS.heart }} />Battito (fascia min–max)</span>
        <span><i style={{ background: COLORS.steps }} />Passi per ora</span>
        <span><i style={{ background: COLORS.meal }} />Pasti</span>
        <span><i style={{ background: COLORS.study }} />Studio</span>
        <span><i style={{ background: COLORS.lesson }} />Lezioni</span>
        <span><i style={{ background: COLORS.event }} />Calendario</span>
        <span><i style={{ background: COLORS.weights }} />Allenamento</span>
      </div>
    </div>
  );
}

function fmt(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m === 60 ? 0 : m).padStart(2, "0")}`;
}
