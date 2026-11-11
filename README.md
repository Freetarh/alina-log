# Familiedashboard · Alina

Et mobilvenligt, fælles dashboard for Frederik og Batoul med Supabase Auth/RLS. Tilgængeligt som GitHub Pages PWA. Appen er bevidst lille og uden særskilt familiemedlemsadministration.

## Moduler (november 2026)

| Modul | Hvad er implementeret? |
|---|---|
| Alinas log | Flasker, amning/timere, bleer, vejning, mælkeberegner, historik og backup af eksisterende log |
| Vækst | WHO vægt-for-alder (piger) med percentil og referencekurver; egne grafer for længde og hovedomfang |
| Familiekalender | Dagvisning, private/fælles aftaler, Google OAuth og separat fælles Google-kalender |
| D-dråber og jern | Daglig registrering, tidsstempel, noter, fortryd og valgfri dosisplan |
| Rengøring | Gentagne opgaver, ansvar (Begge/Frederik/Batoul), forfald, udført-historik og opgaveforslag |
| Indkøb | Fælles liste, kategorier, mængder, afkrydsning og oprydning |
| Madplan og opskrifter | Morgenmad/frokost/aftensmad pr. dag, ugerulning, opskrifter og ingredienser til indkøb |
| Forside | Kompakt dagsoverblik: hurtig registrering, fælles aftaler, tilskud/rengøring, seneste måltid og aftensmad/indkøb |
| Indstillinger | Konto, synkronisering, opdatering, familiekode og logout bag separat tandhjul og link under Mere |

**Kode status:** Implementeret i GitHub og databaseskemaet er migreret. UI er syntax- og mock-testet, men de nye moduler mangler en fuld end-to-end-test på begge telefoner. Tidligere flaskelog og kalender→Google er allerede testet i appen.

## Filer og struktur

- `index.html` – app shell, navigation og den eksisterende flaskelog
- `family-dashboard.js` / `family-dashboard.css` – eksisterende kalender og vægtvisning
- `growth.js` – WHO LMS og længde-/hovedomfangsregistreringer
- `household.js` – supplementer og rengøring
- `food.js` – indkøb, madplan og opskrifter
- `home.js` – dags-overblik med genveje til registreringer og kalender
- `household.css` – mobilvenlige moduler
- `google-calendar.js` – Google-visning og familiedeling
- `supabase/functions/google-calendar/index.ts` – krypteret OAuth2-tokenhåndtering og synkronisering
- `google-setup.html` – engangsopsætning af Google Cloud og Edge Function Secrets
- `tests/dashboard-smoke.test.cjs` – dependency-free smoke-tests
- `.github/workflows/dashboard-smoke.yml` – automatisk statisk test ved push
- `sw.js`, `manifest.webmanifest` – PWA

Supabase-projekt: `lsqasyswqwbggkzmsyvz`. Repo: `Freetarh/alina-log`.

## WHO vægt-for-alder

Fødselsdato: **6. oktober 2026**. WHO Child Growth Standards, piger, vægt-for-alder:

- Uge 0–13: officiel ugentlig LMS-tabel
- Måned 0–24: officiel månedlig LMS-tabel
- Linjerne på grafen viser WHO −2 SD, −1 SD, median, +1 SD og +2 SD, vægt i kg. Det ene lag med målepunkter viser Alinas faktiske loggede vejninger.
- Percentil fra LMS-z-score, beregnet med normalfordelingens CDF. Interpolation mellem tabellerne gør tallet *omtrentligt*.
- Vægtpercentilen er ikke en diagnose, og ændringer i vægt, længde, hovedomfang og trivsel bør vurderes sammen med sundhedspersonale.

WHO-kilder:
- https://www.who.int/tools/child-growth-standards/standards/weight-for-age
- https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/wfa-girls-0-13-zscores.pdf
- https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/wfa-girls-0-5-zscores.pdf

## D-dråber og jern

Tilskudsplanerne oprettes med **tomt dosisfelt**. Forældrene angiver selv ordineret dosis og tidspunkt; appen må ikke selv foreslå en medicinsk dosis. Tidsplanen er kun informativ. Der udsendes endnu ikke push-notifikationer.

## Opskrifter og indkøb

Hver ingrediens skrives på sin egen linje (for eksempel `2 stk løg`). En opskrift kan kopiere ingredienser til indkøbslisten. Ugens planlagte opskrifter kan også kopieres samlet. Eksisterende ikke-afkrydsede varer med samme navn (ignorerer forskel på store/små bogstaver) tilføjes ikke igen. Dette er ikke et lagerstyringssystem eller ernæringsberegning.

Rengøringsopgaver gentages efter 1, 7, 14, 30 eller valgfrit antal **dage**; der er ikke en separat kalendermånedsregel endnu. Engangsopgaver markeres færdige.

## Google Kalender

- Begge Google-konti er forbundet. En separat Google-kalender `Familie` er valgt.
- Dashboard → Google blev testet på telefonen 11. november 2026.
- Google → Dashboard og visning på Batouls telefon er **ikke** færdigtestet.
- Personlige kalendere forbliver private som standard, og nøgleord/individuel skjulning filtreres på serveren for delt visning.
- En separat fælles Google-kalender synkroniseres manuelt eller når kalenderen åbnes. Synkroniseringen fortsætter ikke, når begge apps er helt lukkede.
- Google Cloud OAuth-secrets opbevares kun i Supabase Edge Function Secrets; refresh tokens opbevares server-side krypteret med AES-GCM.
- I Googles testtilstand kan refresh tokens udløbe efter ca. 7 dage, hvilket kræver genforbindelse.
- Se `google-setup.html` for trin-for-trin opsætning. **Commit aldrig Client Secret, tokenkrypteringsnøgle eller brugertokens.**

## Dataadgang

Alle nye tabeller har RLS og kræver, at `auth.uid()` er registreret i `alina_members` for den konkrete `family_id`. Familietilknytning og opretter-/registreringsidentitet kan ikke ændres efter oprettelse. Opskrifter og måltider har familiebundne fremmednøgler; opgavehistorik kontrollerer også familiens ejerskab. Tilskudslog tillader fortryd/sletning i UI.

Der er fortsat tidligere Supabase-advarsler om de eksisterende `alina_family_create` og `alina_family_join` SECURITY DEFINER-funktioner samt deaktiveret leaked-password-beskyttelse. Disse advarsler er ikke indført af de nye moduler og kræver særskilt gennemgang.

## Test

Automatisk, uden ekstern afhængighed:

```bash
node --test tests/dashboard-smoke.test.cjs
```

Testene kontrollerer scripts/assets, unikke IDs, alle routes, WHO-mediantabeller og simulering af modulers rendering. De erstatter ikke en rigtig test med Google OAuth og Supabase-adgang på telefonerne.

### Næste manuelle accepttest (begge telefoner)

1. Genindlæs PWA'en, så den nye service worker henter samtlige moduler. Kontrollér forsiden og tandhjulet **Indstillinger**. Familiekode og logout må kun vises på indstillingssiden.
2. Test forsidens knapper **Amning**, **Flaske**, **Ble** og **Aftale**, og kontrollér at de rigtige formularer åbner. Kontrollér også gammel flaskelog, amningstimer og familiekalender.
3. Registrér en vægt/længde/hovedomfang og kontrollér kurverne.
4. Registrér D-dråber/jern med ordineret dosis, og prøv fortryd.
5. Opret, fuldfør og gentag en rengøringsopgave.
6. Tilføj og afkryds en vare på begge telefoner.
7. Opret en opskrift, planlæg den på en dag, og send ingredienser til indkøb.
8. Opret en aftale i `Familie` direkte i Google og synkronisér til dashboardet. Kontrollér på Batouls telefon.
9. Kontrollér privat deling: en aftale filtreret på `piller` må ikke vises hos den anden.

Forsiden er nu redesignet med fire prioriterede områder. Kontooplysninger ligger under **Indstillinger**, ikke på hver fane. Forsidens indhold kan justeres efter jeres erfaringer med daglig brug.

## Begrænsninger

Alle datamutationer kræver internet. Hjemmeoversigt er en første version. Ingen push-påmindelser, avanceret gentagelse af lægeaftaler, fuld offline-tilstand, ernæringsberegninger eller fuld kalender-baggrundssynkronisering endnu.
