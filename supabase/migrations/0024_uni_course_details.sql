-- Dettagli ufficiali degli insegnamenti (Uniud course catalogue, coorte 2024/25, rilevati il 07/10/2026).
-- semesters: 1 = un solo semestre, 2 = annuale (due semestri). term: periodo didattico per esteso.
alter table uni_courses
  add column if not exists semesters int check (semesters in (1, 2)),
  add column if not exists term text,              -- "Primo Periodo" | "Secondo Periodo" | "Annualità"
  add column if not exists hours int,              -- ore di didattica frontale/laboratorio previste dal catalogo
  add column if not exists ssd text,
  add column if not exists exam_type text,         -- Orale / Scritto
  add column if not exists grading text,           -- Voto Finale / Giudizio Finale
  add column if not exists attendance text,        -- frequenza obbligatoria o no
  add column if not exists teachers text[],
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists course_type text,       -- Base / Caratterizzante / Affine / ...
  add column if not exists details_source text,
  add column if not exists details_updated_at timestamptz;
