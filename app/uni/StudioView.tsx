import { getCourses, getPlannedExams, summarize, type Course } from "../../src/lib/uniExams";
import { todayKey } from "../../src/lib/time";
import { ExamPlanner } from "./ExamPlanner";

const avg = (n: number | null) => (n === null ? "—" : n.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

function Bar({ passed, attending, total, color }: { passed: number; attending: number; total: number; color: string }) {
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <div className="hub-bar" style={{ height: 10, margin: 0 }} title={`${passed} CFU superati, ${attending} in frequenza, su ${total}`}>
      <i style={{ display: "inline-block", width: pct(passed), background: color }} />
      <i style={{ display: "inline-block", width: pct(attending), background: color, opacity: 0.35 }} />
    </div>
  );
}

/** Avanzamento della laurea: CFU in totale e per anno (pieno = superati, chiaro = in frequenza). */
function CfuCard({ courses }: { courses: Course[] }) {
  const s = summarize(courses);
  const cfu = (list: Course[], status: Course["status"]) => list.filter((c) => c.status === status).reduce((a, c) => a + c.cfu, 0);
  const attending = cfu(courses, "attending");
  const pct = Math.round((s.cfuPassed / s.cfuTotal) * 100);

  return (
    <div className="card kpi" style={{ ["--kpi" as string]: "#64d2ff" }}>
      <div className="kpi-top">
        <span>Laurea</span>
        <span className="pill">{pct}%</span>
      </div>
      <div className="kpi-value">
        {s.cfuPassed}
        <small>/ {s.cfuTotal} CFU</small>
      </div>
      <Bar passed={s.cfuPassed} attending={attending} total={s.cfuTotal} color="#64d2ff" />
      <div className="kpi-sub">
        {s.passed.filter((c) => c.cfu > 0).length} esami superati · {s.missing.length} mancanti · media ponderata {avg(s.weightedAvg)}
      </div>
      <div style={{ marginTop: 12 }}>
        {[1, 2, 3].map((y) => {
          const list = courses.filter((c) => c.year === y);
          if (!list.length) return null;
          const total = list.reduce((a, c) => a + c.cfu, 0);
          const passed = cfu(list, "passed");
          return (
            <div className="agenda-row" key={y}>
              <span className="time">{y}° anno</span>
              <div style={{ flex: 1 }}>
                <Bar passed={passed} attending={cfu(list, "attending")} total={total} color="#64d2ff" />
              </div>
              <span className="muted small">{passed}/{total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Studio: a che punto sono con i CFU e quali esami devo dare nella prossima sessione. */
export async function StudioView() {
  const today = todayKey();
  try {
    const [courses, exams] = await Promise.all([getCourses(), getPlannedExams()]);
    return (
      <>
        <CfuCard courses={courses} />
        <ExamPlanner
          courses={courses.map(({ code, name, year, status, cfu, semesters, hours }) => ({ code, name, year, status, cfu, semesters, hours }))}
          exams={exams.filter((e) => e.examDate >= today)}
          today={today}
        />
      </>
    );
  } catch (err) {
    console.error("[uni] piano di studi non disponibile:", err);
    return (
      <div className="card">
        <p>Impossibile leggere il piano di studi.</p>
      </div>
    );
  }
}
