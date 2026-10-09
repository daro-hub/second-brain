import type { DayBundle } from "../../../src/lib/overview";
import { localHourDecimal } from "../../../src/lib/time";

const W = 960;
const L = 78;
const R = 16;
const PLOT_W = W - L - R;

// corsie dall'alto in basso: ogni cosa ha la sua fascia, niente sovrapposizioni
const AGENDA_Y = 14; // due righe: studio/lezioni, calendario
const SPORT_Y = 92;
const MEALS_Y = 140;
const HR_TOP = 196;
const HR_BOTTOM = 316;
const HR_H = HR_BOTTOM - HR_TOP;
const STEPS_TOP = 346;
const STEPS_BOTTOM = 406;
const STEPS_H = STEPS_BOTTOM - STEPS_TOP;
const AXIS_Y = 424;
const H = 446;

const x = (hour: number) => L + (Math.min(Math.max(hour, 0), 24) / 24) * PLOT_W;

const COLORS = {
  heart: "#ff453a",
  steps: "#34d399",
  meal: "#ff9f0a",
  study: "#64d2ff",
  lesson: "#ff6482",
  event: "#9ca3b8",
  weights: "#0a84ff",
  run: "#bf5af2",
  walk: "#3cc7e0",
  other: "#8e8e93",
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

function clip(text: string, widthPx: number, charPx = 6.6): string {
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
  const yHr = (v: number) => HR_BOTTOM - ((v - hrMin) / (hrMax - hrMin)) * HR_H;

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
  const timed = events.filter((e) => !e.allDay);
  const sessions = activities.filter((a) => a.movingTimeMin > 0);

  const laneLabel = (y: number, text: string, color = "var(--muted)") => (
    <text x={L - 12} y={y} textAnchor="end" fontSize={12} fontWeight={700} fill={color}>
      {text}
    </text>
  );
  const band = (y: number, h: number) => <rect x={L} y={y} width={PLOT_W} height={h} rx={8} fill="rgb(var(--ov) / 0.025)" />;

  return (
    <div className="viz-scroll" style={{ overflowX: "auto" }}>
      <svg className="viz" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cronologia della giornata" style={{ minWidth: 760 }}>
        {/* griglia verticale oraria, tre ore per volta, attraversa tutte le corsie */}
        {Array.from({ length: 9 }, (_, i) => i * 3).map((h) => (
          <g key={h}>
            <line x1={x(h)} x2={x(h)} y1={AGENDA_Y} y2={AXIS_Y - 14} stroke="#1a2030" strokeWidth={1} />
            <text x={x(h)} y={AXIS_Y + 4} textAnchor="middle" fontSize={12} fill="var(--muted)">
              {String(h).padStart(2, "0")}:00
            </text>
          </g>
        ))}

        {/* agenda: riga alta studio/lezioni, riga bassa calendario */}
        {band(AGENDA_Y, 68)}
        {laneLabel(AGENDA_Y + 28, "Agenda")}
        {schedule.length === 0 && timed.length === 0 && (
          <text x={L + 12} y={AGENDA_Y + 38} fontSize={12.5} fill="var(--muted)">
            Nessuna lezione o evento
          </text>
        )}
        {schedule.map((s, i) => {
          const w = x(s.endH) - x(s.startH);
          const color = s.type === "studio" ? COLORS.study : COLORS.lesson;
          return (
            <g key={`s${i}`}>
              <title>{`${s.type === "studio" ? "Studio" : "Lezione"} · ${s.subject} (${fmt(s.startH)}–${fmt(s.endH)})`}</title>
              <rect x={x(s.startH)} y={AGENDA_Y + 6} width={w} height={26} rx={7} fill={color} fillOpacity={0.22} stroke={color} strokeOpacity={0.7} />
              <text x={x(s.startH) + 8} y={AGENDA_Y + 23} fontSize={12} fill={color} fontWeight={600}>
                {clip(s.subject, w - 14)}
              </text>
            </g>
          );
        })}
        {timed.map((e, i) => {
          const w = Math.max(x(e.endH) - x(e.startH), 28);
          return (
            <g key={`e${i}`}>
              <title>{`${e.summary} (${fmt(e.startH)}–${fmt(e.endH)})${e.location ? ` · ${e.location}` : ""}`}</title>
              <rect x={x(e.startH)} y={AGENDA_Y + 36} width={w} height={26} rx={7} fill={COLORS.event} fillOpacity={0.2} stroke={COLORS.event} strokeOpacity={0.7} />
              <text x={x(e.startH) + 8} y={AGENDA_Y + 53} fontSize={12} fill="#cdd3e4" fontWeight={600}>
                {clip(e.summary, w - 14)}
              </text>
            </g>
          );
        })}

        {/* allenamento: attività Strava (orari reali) + serie registrate */}
        {band(SPORT_Y, 36)}
        {laneLabel(SPORT_Y + 23, "Sport")}
        {sessions.length === 0 && gymLogs.length === 0 && (
          <text x={L + 12} y={SPORT_Y + 23} fontSize={12.5} fill="var(--muted)">
            Nessun allenamento registrato
          </text>
        )}
        {sessions.map((a) => {
          const start = a.startHour;
          const end = Math.min(24, start + a.movingTimeMin / 60);
          const w = Math.max(x(end) - x(start), 24);
          const c = typeColor(a.type);
          return (
            <g key={a.id}>
              <title>{`${typeLabel(a.type)} · ${a.name} — ${a.movingTimeMin} min${a.distanceKm ? ` · ${a.distanceKm} km` : ""}`}</title>
              <rect x={x(start)} y={SPORT_Y + 5} width={w} height={26} rx={8} fill={c} fillOpacity={0.28} stroke={c} />
              <text x={x(start) + 8} y={SPORT_Y + 22} fontSize={12} fill={c} fontWeight={700}>
                {clip(`${typeLabel(a.type)} ${a.movingTimeMin}′`, w - 14)}
              </text>
            </g>
          );
        })}
        {gymLogs.map((g, i) => {
          const h = localHourDecimal(g.performedAt);
          return (
            <g key={`g${i}`}>
              <title>{`${g.exercise} — ${g.weightKg} kg × ${g.reps} (${fmt(h)})`}</title>
              <path d={`M ${x(h)} ${SPORT_Y + 6} l 8 12 l -8 12 l -8 -12 z`} fill={COLORS.weights} stroke="var(--bg)" strokeWidth={1.5} />
            </g>
          );
        })}

        {/* pasti: una corsia sola per loro, con le kcal accanto a ogni segnaposto */}
        {band(MEALS_Y, 40)}
        {laneLabel(MEALS_Y + 25, "Pasti", COLORS.meal)}
        {meals.length === 0 && (
          <text x={L + 12} y={MEALS_Y + 25} fontSize={12.5} fill="var(--muted)">
            Nessun pasto registrato
          </text>
        )}
        {meals.map((m, i) => (
          <g key={`m${i}`}>
            <title>{`${fmt(m.hour)} · ${Math.round(m.kcal)} kcal, ${Math.round(m.protein)} g proteine\n${m.parts.join("\n")}`}</title>
            <circle cx={x(m.hour)} cy={MEALS_Y + 20} r={6} fill={COLORS.meal} />
            <text x={x(m.hour) + 12} y={MEALS_Y + 25} fontSize={12} fill={COLORS.meal} fontWeight={700}>
              {Math.round(m.kcal)} kcal
            </text>
          </g>
        ))}

        {/* battito: pannello con asse in bpm */}
        {band(HR_TOP - 12, HR_H + 24)}
        {laneLabel(HR_TOP + 6, "Battito", COLORS.heart)}
        <text x={L - 12} y={HR_TOP + 22} textAnchor="end" fontSize={11} fill="var(--muted)">
          bpm
        </text>
        {hrTicks.map((v) => (
          <g key={v}>
            <line x1={L + 4} x2={W - R - 4} y1={yHr(v)} y2={yHr(v)} stroke="rgb(var(--ov) / 0.1)" strokeWidth={1} />
            <text x={L + 8} y={yHr(v) - 4} fontSize={11} fill="var(--muted)">
              {v}
            </text>
          </g>
        ))}
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
          <text x={x(12)} y={(HR_TOP + HR_BOTTOM) / 2} textAnchor="middle" fontSize={13} fill="var(--muted)">
            Nessun dato di battito per questo giorno
          </text>
        )}

        {/* passi per ora: pannello a parte, sotto il battito */}
        {band(STEPS_TOP - 8, STEPS_H + 16)}
        {laneLabel(STEPS_TOP + 12, "Passi", COLORS.steps)}
        <text x={L - 12} y={STEPS_TOP + 28} textAnchor="end" fontSize={11} fill="var(--muted)">
          per ora
        </text>
        {hasSteps ? (
          steps.hourly.map((v, h) => {
            if (v <= 0) return null;
            const bh = Math.max((v / maxSteps) * STEPS_H, 2);
            return (
              <g key={`st${h}`}>
                <title>{`${String(h).padStart(2, "0")}:00 · ${Math.round(v)} passi`}</title>
                <rect x={x(h) + 2} y={STEPS_BOTTOM - bh} width={PLOT_W / 24 - 4} height={bh} rx={3} fill={COLORS.steps} fillOpacity={0.6} />
              </g>
            );
          })
        ) : (
          <text x={x(12)} y={(STEPS_TOP + STEPS_BOTTOM) / 2 + 4} textAnchor="middle" fontSize={13} fill="var(--muted)">
            Nessun passo registrato
          </text>
        )}

        {/* adesso: attraversa tutte le corsie */}
        {nowHour !== null && (
          <g>
            <line x1={x(nowHour)} x2={x(nowHour)} y1={AGENDA_Y} y2={AXIS_Y - 14} stroke="#0a84ff" strokeWidth={1.4} strokeDasharray="4 4" />
            <rect x={x(nowHour) - 18} y={AXIS_Y - 11} width={36} height={19} rx={9} fill="#0a84ff" />
            <text x={x(nowHour)} y={AXIS_Y + 3} textAnchor="middle" fontSize={11.5} fill="#0a0c11" fontWeight={800}>
              ora
            </text>
          </g>
        )}
      </svg>
      <div className="legend">
        <span><i style={{ background: COLORS.study }} />Studio</span>
        <span><i style={{ background: COLORS.lesson }} />Lezioni</span>
        <span><i style={{ background: COLORS.event }} />Calendario</span>
        <span><i style={{ background: COLORS.weights }} />Allenamento</span>
        <span><i style={{ background: COLORS.meal }} />Pasti</span>
        <span><i style={{ background: COLORS.heart }} />Battito (fascia min–max)</span>
        <span><i style={{ background: COLORS.steps }} />Passi</span>
      </div>
    </div>
  );
}

function fmt(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m === 60 ? 0 : m).padStart(2, "0")}`;
}
