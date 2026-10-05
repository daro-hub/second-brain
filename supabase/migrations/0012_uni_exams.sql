-- Piano di studi (da piano_carriera, 05/10/2026) ed esami pianificati per la sessione, pagina /uni.
create table if not exists uni_courses (
  code text primary key,
  name text not null,
  year int not null check (year between 1 and 3),
  cfu int not null default 0,
  status text not null default 'todo' check (status in ('passed', 'attending', 'todo')),
  grade text,          -- "22", "30L", "APP" (idoneità)
  passed_on date,
  position int not null default 0
);

create table if not exists uni_exams (
  id bigserial primary key,
  course_code text not null references uni_courses (code) on delete cascade,
  exam_date date not null,
  topics text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists uni_exams_date on uni_exams (exam_date);

alter table uni_courses enable row level security;
alter table uni_exams enable row level security;

insert into uni_courses (code, name, year, cfu, status, grade, passed_on, position) values
  ('A_INGL_B1', 'Prova di accesso inglese livello B1 intermedio 2', 1, 0, 'passed', 'APP', '2025-07-01', 1),
  ('MA0205', 'Tecnologie Web e Laboratorio', 1, 6, 'passed', '22', '2025-02-26', 2),
  ('MA0682', 'Fondamenti di Scienza dei Dati e Laboratorio', 1, 6, 'attending', null, null, 3),
  ('MA0747', 'Elementi di Matematica e Algebra Lineare', 1, 12, 'attending', null, null, 4),
  ('MA0007', 'Analisi Matematica', 1, 12, 'attending', null, null, 5),
  ('MA0013', 'Architettura degli Elaboratori', 1, 6, 'passed', '27', '2025-06-17', 6),
  ('MA0748', 'Fisica per i Dispositivi IoT', 1, 6, 'passed', '30L', '2026-01-19', 7),
  ('MA0176', 'Programmazione e Laboratorio', 1, 12, 'passed', '18', '2026-01-27', 8),
  ('TOLC-S', 'TOLC Scienze', 1, 0, 'passed', 'APP', '2024-11-29', 9),
  ('MA0750', 'Tecnologie Web per il Cloud e Laboratorio', 2, 6, 'todo', null, null, 1),
  ('MA0196', 'Sistemi Operativi e Laboratorio', 2, 9, 'attending', null, null, 2),
  ('MA0683', 'Machine Learning for Big Data', 2, 6, 'todo', null, null, 3),
  ('MA0006', 'Algoritmi e Strutture Dati e Laboratorio', 2, 12, 'todo', null, null, 4),
  ('MA0680', 'Programmazione Orientata agli Oggetti e Laboratorio', 2, 9, 'attending', null, null, 5),
  ('MA0749', 'Statistica e Laboratorio', 2, 9, 'attending', null, null, 6),
  ('SF0002', 'Lingua Inglese', 2, 6, 'attending', null, null, 7),
  ('MA0615', 'Laboratorio di Realtà Aumentata', 2, 6, 'todo', null, null, 8),
  ('MA0822', 'Interazione Persona-Macchina', 3, 6, 'todo', null, null, 1),
  ('MA0211', 'Tirocinio', 3, 9, 'todo', null, null, 2),
  ('MA0184', 'Reti di Calcolatori', 3, 9, 'todo', null, null, 3),
  ('MA0056', 'Ingegneria del Software', 3, 6, 'todo', null, null, 4),
  ('MA0624', 'Basi di Dati e Laboratorio', 3, 12, 'todo', null, null, 5),
  ('MA0684', 'Internet of Things', 3, 6, 'todo', null, null, 6),
  ('MA0685', 'Social Computing', 3, 6, 'todo', null, null, 7),
  ('MA0308', 'Prova Finale', 3, 3, 'todo', null, null, 8)
on conflict (code) do nothing;
