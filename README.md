# Familiedashboard · Alina

Et mobilvenligt, fælles dashboard for Frederik og Batoul med Supabase Auth/RLS. Tilgængeligt som GitHub Pages PWA. Appen er bevidst lille og uden særskilt familiemedlemsadministration.

## Moduler (november 2026)

| Modul | Hvad er implementeret? |
|---|---|
| Alinas log | Flasker, amning/timere, bleer, vejning, mælkeberegner, historik og backup af eksisterende log |
| Vækst | WHO vægt-for-alder (piger) med percentil og referencekurver; egne grafer for længde og hovedomfang |
| Alinas sundhedskalender | De danske standardundersøgelser og vaccinationer (5 uger til 12 år), egne sundhedsbesøg, booking, gennemført-status og frivillig tilføjelse til familiekalender |
| Familiekalender | Månedsvisning med markører for aftaler, valgfri dagagenda, private/fælles aftaler, Google OAuth og separat fælles Google-kalender |
| D-dråber og jern | Daglig registrering, tidsstempel, noter, fortryd og valgfri dosisplan |
| Rengøring | Gentagne opgaver, ansvar (Begge/Frederik/Batoul), forfald, udført-historik og opgaveforslag |
| Indkøb | Fælles liste, kategorier, mængder, afkrydsning og oprydning |
| Madplan og opskrifter | Kun aftensmad i ugeoversigten, opskrifter og ingredienser til indkøb. Evt. historiske morgenmads-/frokostposter bevares i databasen |
| Forside | Kompakt dagsoverblik: hurtig registrering, fælles aftaler, tilskud/rengøring, seneste måltid og aftensmad/indkøb |
| Indstillinger | Konto, synkronisering, opdatering, familiekode og logout bag separat tandhjul og link under Mere |

**Kode status:** Implementeret i GitHub og databaseskemaet er migreret. UI er syntax- og mock-testet, men de nye moduler mangler en fuld end-to-end-test på begge telefoner. Tidligere flaskelog og kalender→Google er allerede testet i appen.

## Filer og struktur

- `index.html` – app shell, navigation og den eksisterende flaskelog
- `family-dashboard.js` / `family-dashboard.css` – eksisterende kalender og vægtvisning
- `growth.js` – WHO LMS og længde-/hovedomfangsregistreringer
- `health.js` / `health.css` – sundhedskalender, officielle milepæle, booking, aftalelink og mobilvisning
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

## Visuelt tema: Blomster og bier (november 2026)

Appen har et samlet, mobilt tema med original vektorillustration af bier og vilde blomster. Den tidligere grønblå stil er bevaret som fallback, så funktionerne ikke er afhængige af billedfilerne.

- `floral-theme.css` skal indlæses **sidst**, efter `family-dashboard.css`, `household.css` og `health.css`. Theme tokens og målrettede modul-accenter ligger her, ikke i JavaScript.
- `art/bee-logo.svg` er app-logo/favicon og SVG-ikon i PWA-manifestet, mens gamle PNG-ikoner bevares som fallback.
- `art/meadow-header.svg` er velkomstillustrationen på forsiden.
- `art/flower-sprig.svg` er diskret baggrundsdekoration, der aldrig opfanger tryk.
- Varme pastelfarver og farveaccenter bruges til at skelne moduler: kalender blå/lavendel, sundhed salvie, madplan fersken, tilskud honninggul, rengøring lavendel, indkøb mint og Alinas log blå/rosa.
- Tekst og aktive knapper har kontrast mod lyse overflader; `prefers-reduced-motion` respekteres. Ingen nye trackers, webfont-CDN'er eller eksterne billedressourcer.
- PWA app shell er version `alina-cloud-shell-v15`, hvor alle illustrationer og stylesheet caches. Ved ældre udseende: luk installeret app, genåbn eller genindlæs i browseren. PWA-ikonet kan afhængigt af Android blive ved med at vise den tidligere PNG, indtil geninstallation.
- `tests/dashboard-smoke.test.cjs` kontrollerer bl.a. indlæsningsrækkefølgen og at theme-artwork er cached. Visuel accept på mobil er stadig nødvendig.

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

## Alinas sundhedskalender (2026)

Alina er født **6. oktober 2026**. Faste milepæle er beregnet ud fra fødselsdatoen, men er kun **vejledende tidspunkter – ingen automatisk booking**. Det er forældrenes ansvar at booke tidspunktet hos lægen.

Standardprogrammet indeholder de syv undersøgelser ved 5 uger, 5 måneder, 12 måneder samt 2, 3, 4 og 5 år. Vaccinationerne: DiTeKiPol-Hib og pneumokok ved 3, 5 og 12 måneder; MFR ved 15 måneder og 4 år; difteri/stivkrampe/kighoste/polio ved 5 år; HPV-dosis 1 omkring 12 år og dosis 2 foreløbigt vist ca. 6 måneder senere (mindst 5 måneder fra den reelt givne første dosis; aftal med lægen).

- Milestones beregnes statisk af `HealthModule.standards` med lokal kalenderdato; der oprettes ingen fiktive bookinger eller fuldførte vaccinationer.
- Familien kan registrere en faktisk booket dato og klokkeslæt, forventet varighed, noter og dato for gennemført besøg. Gennemført-status registreres kun efter eksplicit handling.
- Egne besøg kan oprettes til sundhedsplejerske, neonatalopfølgning eller andre kontroller uden at gætte en kommunal besøgsplan.
- Kun ved separat godkendelse oprettes en aftale i `family_events` og muligvis Google-familiekalenderen. **Personlige sundhedsnoter sendes ikke til Google**, men titlen og tidspunktet er synligt på den fælles kalender.
- Ændrede bookinger opdaterer tilknyttede kalenderaftaler. Et tilknyttet kalender-event skal fjernes via sundhedskalenderen, før bookingen ryddes.
- Persistente data gemmes i `family_health_visits` med RLS baseret på `alina_members`. `calendar_event_id` har en familiebundet FK til `family_events`.
- Dagens forside viser næste endnu ikke afsluttede besøg. Standardbesøg med tidligere vejledende dato markeres som **kontrollér om gennemført**, aldrig som fastslået udeblevet.
- Programmet kan blive ændret, og individuelt tilpassede forløb aftales med lægen. Sundhedskalenderen er ikke en journal.

Officielle kilder:
- https://www.sst.dk/boernevaccination
- https://www.sundhed.dk/borger/patienthaandbogen/boern/illustrationer/praesentationer/boerneundersoegelser-oversigt/
- https://www.sundhed.dk/borger/patienthaandbogen/boern/undersoegelser/besoeg-af-sundhedsplejersken/

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
- Månedsvisningen viser aftaler fra dashboardets familiekalender (inkl. importerede fælles Google-aftaler) og den indloggede brugers lokale private aftaler efter filter. Personlige Google-aftaler fra egne primære Google-kalendere vises for den valgte dato under den foldbare »Google Kalender og personlige aftaler«-sektion; de indgår ikke i månedsmarkørerne.
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
2. Test forsidens knapper **Amning**, **Flaske**, **Ble** og **Aftale**, og kontrollér at de rigtige formularer åbner. Kontrollér også flaskelog og amningstimer. I kalenderen: skift måned, vælg en dag, tjek markører for aftaler, og kontrollér at filtret »Vis mine private« kun viser dine egne private aftaler.
3. Registrér en vægt/længde/hovedomfang og kontrollér kurverne.
4. Registrér D-dråber/jern med ordineret dosis, og prøv fortryd.
5. Opret, fuldfør og gentag en rengøringsopgave.
6. Tilføj og afkryds en vare på begge telefoner.
7. Opret en opskrift, planlæg den til aftensmad på en dag, og send ingredienser til indkøb.
8. Åbn **Mere → Alinas sundhedskalender**. Kontrollér de forventede datoer. Registrér en reel tid eller gennemført dato, og tilføj frivilligt besøget til den fælles kalender. Kontrollér ændringen på begge telefoner. Bekræft at morgenmad og frokost ikke vises.
9. Opret en aftale i `Familie` direkte i Google og synkronisér til dashboardet. Kontrollér på Batouls telefon.
10. Kontrollér privat deling: en aftale filtreret på `piller` må ikke vises hos den anden.

Forsiden er nu redesignet med fire prioriterede områder. Kontooplysninger ligger under **Indstillinger**, ikke på hver fane. Forsidens indhold kan justeres efter jeres erfaringer med daglig brug.

## Begrænsninger

Alle datamutationer kræver internet. Hjemmeoversigt er en første version. Ingen push-påmindelser, avanceret gentagelse af lægeaftaler, fuld offline-tilstand, ernæringsberegninger eller fuld kalender-baggrundssynkronisering endnu.
