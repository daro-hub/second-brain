/**
 * Chi usa questa installazione. Con più deploy dello stesso codice (uno per persona) il nome non può stare nei prompt:
 * `OWNER_NAME` lo sostituisce. Non impostata = Francesco ("Daro"), quindi il suo deploy non cambia.
 * `OWNER_PROFILE` (facoltativa) è la riga di presentazione per le pillole di cultura; `OWNER_GENDER=f` fa parlare di lei al femminile.
 */
const NAME = process.env.OWNER_NAME?.trim();

export const OWNER = NAME || "Daro";
export const OWNER_LABEL = NAME || 'Francesco ("Daro")';
export const OWNER_PROFILE = process.env.OWNER_PROFILE?.trim() || (NAME ? "" : "studente e sviluppatore di 21 anni");
export const OWNER_GENDER_NOTE = process.env.OWNER_GENDER?.trim().toLowerCase() === "f" ? ` ${OWNER} è una ragazza: parla di lei al femminile.` : "";
