import { supabase } from "./supabase";

export type CourseStatus = "passed" | "attending" | "todo";

export interface Course {
  code: string;
  name: string;
  year: number;
  cfu: number;
  status: CourseStatus;
  grade: string | null;
  passedOn: string | null;
  semesters?: number | null;
  hours?: number | null;
}

export { courseMeta } from "./courseMeta";

export interface PlannedExam {
  id: number;
  courseCode: string;
  examDate: string; // YYYY-MM-DD
  topics: string;
}

export async function getCourses(): Promise<Course[]> {
  const { data, error } = await supabase.from("uni_courses").select("*").order("year").order("position");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    code: r.code,
    name: r.name,
    year: r.year,
    cfu: r.cfu,
    status: r.status,
    grade: r.grade,
    passedOn: r.passed_on,
    semesters: r.semesters ?? null,
    hours: r.hours ?? null,
  }));
}

export async function getPlannedExams(): Promise<PlannedExam[]> {
  const { data, error } = await supabase.from("uni_exams").select("*").order("exam_date").order("id");
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, courseCode: r.course_code, examDate: r.exam_date, topics: r.topics }));
}

/** Voto numerico per le medie: "30L" → 30; idoneità ("APP", "APP_T") e vuoti → null. */
export function numericGrade(grade: string | null): number | null {
  if (!grade) return null;
  const n = parseInt(grade, 10);
  return Number.isFinite(n) && n >= 18 && n <= 30 ? n : null;
}

export const TOTAL_CFU = 180;

export function summarize(courses: Course[]) {
  const passed = courses.filter((c) => c.status === "passed");
  const graded = passed.filter((c) => numericGrade(c.grade) !== null && c.cfu > 0);
  const cfuPassed = passed.reduce((s, c) => s + c.cfu, 0);
  const weightedSum = graded.reduce((s, c) => s + numericGrade(c.grade)! * c.cfu, 0);
  const weightedCfu = graded.reduce((s, c) => s + c.cfu, 0);
  return {
    passed,
    missing: courses.filter((c) => c.status !== "passed"),
    cfuPassed,
    cfuTotal: courses.reduce((s, c) => s + c.cfu, 0) || TOTAL_CFU,
    weightedAvg: weightedCfu ? weightedSum / weightedCfu : null,
    arithmeticAvg: graded.length ? graded.reduce((s, c) => s + numericGrade(c.grade)!, 0) / graded.length : null,
  };
}

/** Stato di un insegnamento: per "passed" servono voto (18-30, 30L, APP) e data; per gli altri stati si azzerano. */
export async function setCourseResult(code: string, status: CourseStatus, grade?: string, passedOn?: string): Promise<boolean> {
  const row = status === "passed" ? { status, grade: (grade ?? "").trim().toUpperCase(), passed_on: passedOn ?? null } : { status, grade: null, passed_on: null };
  const { data, error } = await supabase.from("uni_courses").update(row).eq("code", code).select("code");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Crea (senza id) o modifica (con id) un esame pianificato. */
export async function saveExam(e: { id?: number; courseCode: string; examDate: string; topics?: string }): Promise<void> {
  const row = { course_code: e.courseCode, exam_date: e.examDate, topics: (e.topics ?? "").trim().slice(0, 2000) };
  const { error } = e.id ? await supabase.from("uni_exams").update(row).eq("id", e.id) : await supabase.from("uni_exams").insert(row);
  if (error) throw error;
}

export async function deleteExam(id: number): Promise<boolean> {
  const { data, error } = await supabase.from("uni_exams").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}
