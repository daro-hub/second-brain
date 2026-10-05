import { getEventsInRange, isStudySyncEvent } from "../../src/lib/calendar";
import { addDays, dateKey, localHHMM, startOfDayUtc, todayKey, weekdayOf } from "../../src/lib/time";

const DAY_NAMES = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

/** Lunedì (chiave "YYYY-MM-DD") della settimana che contiene `key`. */
function mondayOf(key: string): string {
  return addDays(key, -((weekdayOf(key) + 6) % 7));
}

/** Lezioni e studio della settimana corrente, da lunedì a domenica, dal calendario (eventi 📚/🎓). */
export async function WeekAgenda() {
  const today = todayKey();
  const monday = mondayOf(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  let events: Awaited<ReturnType<typeof getEventsInRange>> = [];
  let failed = false;
  try {
    events = (await getEventsInRange(startOfDayUtc(monday), startOfDayUtc(addDays(monday, 7)))).filter((e) => isStudySyncEvent(e.summary));
  } catch (err) {
    console.error("[uni] calendario non disponibile:", err);
    failed = true;
  }

  const byDay = new Map<string, typeof events>();
  for (const e of events) {
    const k = dateKey(e.start);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }

  return (
    <section className="card uni-week">
      <div className="card-head">
        <h3>Questa settimana · lezioni e studio</h3>
        <span className="uni-week-range">
          {monday.slice(8)}/{monday.slice(5, 7)} → {addDays(monday, 6).slice(8)}/{addDays(monday, 6).slice(5, 7)} · lunedì–domenica
        </span>
      </div>
      {failed ? (
        <p className="uni-week-empty">Impossibile leggere il calendario.</p>
      ) : (
        <ul className="uni-week-list">
          {days.map((k) => {
            const list = byDay.get(k) ?? [];
            return (
              <li key={k} className={`${k === today ? "today" : ""}${k < today ? " past" : ""}`}>
                <div className="uni-week-day">
                  <b>{DAY_NAMES[weekdayOf(k)]}</b>
                  <span>
                    {k.slice(8)}/{k.slice(5, 7)}
                  </span>
                </div>
                <div className="uni-week-events">
                  {list.length === 0 ? (
                    <span className="uni-week-empty">—</span>
                  ) : (
                    list.map((e) => (
                      <div key={`${e.uid ?? e.summary}|${e.start}`} className="uni-week-event">
                        <span className="uni-week-time">{e.allDay ? "tutto il giorno" : `${localHHMM(e.start)}–${localHHMM(e.end)}`}</span>
                        <span>{e.summary}</span>
                      </div>
                    ))
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
