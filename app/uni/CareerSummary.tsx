import { courseMeta, summarize, type Course } from "../../src/lib/uniExams";
import { CourseStatus } from "./CourseStatus";

const fmtDate = (k: string | null) => (k ? `${k.slice(8)}/${k.slice(5, 7)}/${k.slice(0, 4)}` : "");
const avg = (n: number | null) => (n === null ? "—" : n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Resoconto del piano di studi: esami passati e mancanti, CFU e medie. */
export function CareerSummary({ courses, today }: { courses: Course[]; today: string }) {
  const s = summarize(courses);
  const pct = Math.round((s.cfuPassed / s.cfuTotal) * 100);

  return (
    <section className="card uni-career">
      <div className="card-head">
        <h3>Piano di studi · resoconto</h3>
        <span className="uni-week-range">LT-819 IoT, Big Data, Machine Learning</span>
      </div>

      <div className="career-stats">
        <div>
          <b>{s.cfuPassed}</b>
          <span>/ {s.cfuTotal} CFU</span>
        </div>
        <div>
          <b>{s.passed.filter((c) => c.cfu > 0).length}</b>
          <span>esami superati</span>
        </div>
        <div>
          <b>{s.missing.length}</b>
          <span>mancanti</span>
        </div>
        <div>
          <b>{avg(s.weightedAvg)}</b>
          <span>media ponderata</span>
        </div>
        <div>
          <b>{avg(s.arithmeticAvg)}</b>
          <span>media aritmetica</span>
        </div>
      </div>
      <div className="career-bar" title={`${pct}% dei CFU`}>
        <i style={{ width: `${pct}%` }} />
      </div>

      <h4 className="career-h">Superati</h4>
      <ul className="career-list">
        {s.passed.map((c) => (
          <li key={c.code}>
            <span className="career-name">{c.name}</span>
            <span className="career-meta">{courseMeta(c)}</span>
            <span className="career-grade">{c.grade === "30L" ? "30 e lode" : c.grade}</span>
            <span className="career-meta">{fmtDate(c.passedOn)}</span>
            <CourseStatus code={c.code} passed grade={c.grade} passedOn={c.passedOn} today={today} />
          </li>
        ))}
      </ul>

      <h4 className="career-h">Mancanti</h4>
      {[1, 2, 3].map((y) => {
        const list = s.missing.filter((c) => c.year === y);
        if (!list.length) return null;
        return (
          <div key={y}>
            <div className="career-year">{y}° anno</div>
            <ul className="career-list">
              {list.map((c) => (
                <li key={c.code}>
                  <span className="career-name">{c.name}</span>
                  <span className="career-meta">{courseMeta(c)}</span>
                  <span className={`career-tag ${c.status}`}>{c.status === "attending" ? "frequentato" : "da fare"}</span>
                  <span />
                  <CourseStatus code={c.code} passed={false} grade={null} passedOn={null} today={today} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
