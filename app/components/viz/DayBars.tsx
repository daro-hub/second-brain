import { formatDayShort, weekdayShort } from "../../../src/lib/time";

/** Una barra per giorno (minuti → ore), con le settimane separate da una riga più chiara. */
export function DayBars({ days, color = "#ff9f0a", height = 130 }: { days: { dayKey: string; minutes: number }[]; color?: string; height?: number }) {
  const max = Math.max(60, ...days.map((d) => d.minutes));
  const hours = (m: number) => `${(m / 60).toLocaleString("it-IT", { maximumFractionDigits: 1 })} h`;
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height, minWidth: days.length * 14 }}>
        {days.map((d) => {
          const monday = weekdayShort(d.dayKey).toLowerCase().startsWith("lun");
          return (
            <div
              key={d.dayKey}
              title={`${formatDayShort(d.dayKey)}: ${d.minutes ? hours(d.minutes) : "niente registrato"}`}
              style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", borderLeft: monday ? "1px solid var(--faint)" : undefined, paddingLeft: monday ? 2 : 0 }}
            >
              <div style={{ width: "100%", height: d.minutes ? `${Math.max(3, (d.minutes / max) * 100)}%` : 2, background: d.minutes ? color : "var(--faint)", opacity: d.minutes ? 0.85 : 0.5, borderRadius: 2 }} />
            </div>
          );
        })}
      </div>
      <div className="muted small" style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span>{formatDayShort(days[0]?.dayKey ?? "")}</span>
        <span>{days.length ? formatDayShort(days[days.length - 1].dayKey) : ""}</span>
      </div>
    </div>
  );
}
