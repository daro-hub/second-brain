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

  // righe = fasce orarie distinte (inizio–fine) presenti nella settimana, in ordine di inizio;
  // colonne = giorni; cella = eventi di quel giorno con esattamente quella fascia
  const ALL_DAY = "tutto il giorno";
  const slotOf = (e: (typeof events)[number]) => (e.allDay ? ALL_DAY : `${localHHMM(e.start)}–${localHHMM(e.end)}`);
  const slots = [...new Set(events.map(slotOf))].sort((a, b) => (a === ALL_DAY ? -1 : b === ALL_DAY ? 1 : a.localeCompare(b)));
  const cell = new Map<string, typeof events>();
  for (const e of events) {
    const key = `${dateKey(e.start)}|${slotOf(e)}`;
    cell.set(key, [...(cell.get(key) ?? []), e]);
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
      ) : slots.length === 0 ? (
        <p className="uni-week-empty">Nessuna lezione o sessione di studio questa settimana.</p>
      ) : (
        <div className="uni-week-scroll">
          <table className="uni-week-table">
            <thead>
              <tr>
                <th aria-label="Fascia oraria" />
                {days.map((k) => (
                  <th key={k} className={`${k === today ? "today" : ""}${k < today ? " past" : ""}`}>
                    <b>{DAY_NAMES[weekdayOf(k)].slice(0, 3)}</b>
                    <span>
                      {k.slice(8)}/{k.slice(5, 7)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot}>
                  <th scope="row" className="uni-week-time">
                    {slot}
                  </th>
                  {days.map((k) => (
                    <td key={k} className={`${k === today ? "today" : ""}${k < today ? " past" : ""}`}>
                      {(cell.get(`${k}|${slot}`) ?? []).map((e) => (
                        <div key={`${e.uid ?? e.summary}|${e.start}`} className="uni-week-event">
                          {e.summary}
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
