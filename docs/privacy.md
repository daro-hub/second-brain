# Privacy policy — Second Brain

Second Brain is a personal project used by a single person, its developer (Francesco D'Arin, darinzancof@gmail.com). It is not offered to the public.

## Data accessed through Google
- **Google Calendar** (`calendar` scope): the app reads and creates events on the developer's own calendars, to answer questions about the agenda and to add or move events on request.
- **Gmail** (`gmail.readonly` scope): the app searches the developer's own mailbox, read-only, when asked a question about an email.

## How data is used
- Data is used only to answer the developer's own requests. It is never sold, shared with third parties for advertising, or used to train models.
- To produce a reply, the relevant excerpts (event titles and times, email subjects and snippets) are sent to the OpenAI API and are not stored by the app beyond the conversation history kept in the developer's own Supabase database.
- OAuth tokens are stored as protected environment variables on Vercel.

## Retention and deletion
Conversation history and any data the developer saves live in his own Supabase project and can be deleted at any time. Google access can be revoked at https://myaccount.google.com/permissions.

## Contact
darinzancof@gmail.com

---

# Informativa sulla privacy — Second Brain (italiano)

Second Brain è un progetto personale usato da una sola persona, il suo sviluppatore (Francesco D'Arin, darinzancof@gmail.com), e non è offerto al pubblico.

- **Google Calendar:** l'app legge e crea eventi sui calendari dello sviluppatore per rispondere a domande sull'agenda e aggiungere o spostare eventi su richiesta.
- **Gmail (sola lettura):** l'app cerca nella casella dello sviluppatore solo quando gli viene chiesto di una email.
- I dati servono solo a rispondere alle richieste dello sviluppatore: non vengono venduti, condivisi per pubblicità né usati per addestrare modelli. Per generare le risposte gli estratti pertinenti (titoli e orari degli eventi, oggetto e anteprima delle email) vengono inviati all'API di OpenAI.
- La cronologia delle conversazioni sta nel suo database Supabase e si può cancellare in qualsiasi momento; l'accesso a Google si revoca da https://myaccount.google.com/permissions.
