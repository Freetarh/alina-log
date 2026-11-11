# Familiens dashboard (Alina-log)

Mobilvenlig privat familie-webapp til to voksne, med Alinas mad-/vægtlog og kalender.

## Struktur

- `index.html` – navigation, login og eksisterende madlog (Supabase Auth)
- `family-dashboard.js` / `family-dashboard.css` – vægtkurve, kalender og pladsholdere
- `google-calendar.js` – valgfri brugerflade til Google-forbindelse
- `supabase/functions/google-calendar/index.ts` – OAuth 2.0, tokenkryptering og Google Calendar API
- `google-setup.html` – trinvis opsætning på telefon, inkl. browsergenereret krypteringsnøgle
- `sw.js` / `manifest.webmanifest` – PWA
- Supabase-projekt: `alina-log` (`lsqasyswqwbggkzmsyvz`)

## Status

- Alinas registreringer, timere og mælkeberegner: i drift.
- Vægtkurve og lokal familiekalender: i drift.
- Google Kalender-forbindelse: klientkode og Edge Function deployet; **kræver Google Cloud OAuth-opsætning**.
- Tilskud, rengøring, indkøb og madplan: placeholders, ikke implementeret.
- Forsidens indhold er bevidst ikke fastlagt.

## Google Kalender-opsætning

1. Følg `google-setup.html` (link i appens kalender).
2. Aktivér Google Calendar API, opret OAuth Web application og brug nøjagtigt:
   `https://lsqasyswqwbggkzmsyvz.supabase.co/functions/v1/google-calendar/callback`
3. Tilføj Supabase Edge Function Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY` (32 tilfældige bytes, Base64). Eventuelt `GOOGLE_APP_RETURN_URL`, hvis GitHub Pages-adressen afviger fra `https://freetarh.github.io/alina-log/`.
4. Log ind i appen med de eksisterende familiebrugere, og forbind hver jeres Google-konto.
5. For fuld fælles Google-kalender: Opret en **separat sekundær Google-kalender**, del den med partneren i Google, og vælg den i appen.

**Læg aldrig Google Client Secret, den hemmelige krypteringsnøgle eller Google tokens i GitHub.** Tokenkrypteringen sker med AES-GCM på Edge Function, og refresh tokens ligger i en tabel uden klientadgang.

I Googles eksterne testtilstand udløber refresh tokens til kalenderadgang sædvanligvis efter syv dage. Konti kan derfor skulle forbindes igen indtil produktionsopsætning er på plads.

## Fortrolighed og synkronisering

- Personlige aftaler fra en Google-konto hentes som udgangspunkt kun til kontoejerens egen visning og kopieres **ikke** til familiedatabasen.
- Hver person kan vælge **Del mine Google-kalenderaftaler**. Deling er fra som standard. Et særskilt serverkald viser så aftalerne til den anden familiebruger, med alle skjulte begivenheder og nøgleordsfiltre håndhævet på serveren.
- Markering `private` på Google-aftalen bliver også udelukket fra deling.
- Nøgleordsfiltre (fx `piller`) gælder tilbagevendende påmindelser og er bruger- og kalenderspecifikke.
- Lokale familieaftaler har valg `family` eller `private`. RLS sikrer, at kun ejeren læser private aftaler; begge familiemedlemmer må redigere familieaftaler.
- At skjule en **allerede synkroniseret** fælles Google-aftale gælder kun dashboardets visning, ikke den sekundære Google-kalender. Man kan ikke konvertere en Google-delt aftale direkte til privat uden at fjerne den delte Google-kopi.
- En sekundær fælles Google-kalender synkroniseres ved at åbne kalenderen (højst hvert femte minut pr. åben session) eller ved at trykke synkroniser. Google→Supabase importerer/opdaterer og markerer fjernede events som inaktive; lokale familieaftaler synkroniseres ved oprettelse/ændring, og mislykkede push-forsøg prøves igen ved næste sync.
- Synkronisering er **ikke en baggrundstjeneste**, når begge telefoner har appen lukket. Der er heller ikke push-notifikationer endnu.
- Kalenderens Google-sync er begrænset til omtrent 180 dage bagud og 540 dage fremad. Meget store kalendere kan overskride synkroniseringsgrænsen.

## Manuelle tests efter OAuth-opsætning

1. Log ind på hver telefon, og bekræft, at Google-forbindelserne viser korrekt konto.
2. Kontroller, at private Google-aftaler ikke vises på partnerens login.
3. Indstil et nøgleordsfilter (`piller`) og aktivér eksplicit deling. Kontroller, at en almindelig aftale vises hos partneren, men ikke en aftale med det ord.
4. Opret et Google-privat arrangement, og kontroller, at det aldrig vises på partnerens login.
5. Vælg en separat fælles Google-kalender. Opret en fælles aftale i dashboardet og kontroller, at den optræder i Google. Rediger den i Google, synkroniser igen, og kontroller opdateringen i dashboardet.
6. Bekræft, at lokale madregistreringer og amningstimer stadig virker.
7. Tjek, at en frakoblet Google-konto ikke afslører tidligere hentede aftaler i appen.

**Status for live Google-tests:** Afventer Google Cloud OAuth-klient og de nødvendige Supabase-secrets.
