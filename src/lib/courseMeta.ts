/**
 * Formattazione dei dettagli di un insegnamento. Vive qui (senza import server) perché la usano anche i componenti
 * client: importarla da uniExams.ts porterebbe nel bundle del browser il client Supabase con la service key.
 */
export interface CourseMetaInput {
  cfu: number;
  semesters?: number | null;
  hours?: number | null;
}

/** "6 CFU · 1 sem. · 48 h" (semestri e ore solo se noti). */
export const courseMeta = (c: CourseMetaInput) =>
  [c.cfu ? `${c.cfu} CFU` : "idoneità", c.semesters ? `${c.semesters} sem.` : "", c.hours ? `${c.hours} h` : ""].filter(Boolean).join(" · ");
