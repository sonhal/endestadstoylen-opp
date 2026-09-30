# Resultater

Resultatsidene (`resultater.html` og `lop.html?ar=ÅÅÅÅ`) leser alt innhold fra CSV-filene i denne mappen. Et nytt løp legges til slik:

1. Legg resultatfila i denne mappen, f.eks. `2027.csv`.
2. Legg til én linje i `lop.csv`.

Det er alt. Plassering, tid etter vinner og all statistikk blir regnet ut automatisk.

## `lop.csv`: oversikt over løp

```csv
ar,dato,fil,distanse_km,stigning_m,merknad
2027,2027-03-26,2027.csv,4.2,650,
```

| Kolonne       | Påkrevd | Beskrivelse |
|---------------|---------|-------------|
| `ar`          | ja      | Årstall, brukes i adressen `lop.html?ar=2027` |
| `dato`        | nei     | Løpsdato som `ÅÅÅÅ-MM-DD` |
| `fil`         | ja      | Filnavn i denne mappen |
| `distanse_km` | nei     | Løypelengde. Gir kolonnen «Tempo» (min/km) |
| `stigning_m`  | nei     | Høydemeter, vises i toppen av løpssiden |
| `merknad`     | nei     | Vises som en gul merknad på løpssiden |

## Resultatfil per løp

```csv
startnr,navn,klubb,tid
12,Kari Nordmann,IL Eksempel,34:57
7,Ola Nordmann,,41:03
23,Per Hansen,IL Eksempel,DNF
```

- **Rekkefølgen spiller ingen rolle.** Lista sorteres på tid, og lik tid gir delt plass.
- **Tid:** `mm:ss` (f.eks. `34:57`) eller `t:mm:ss` (f.eks. `1:02:10`). Punktum kan brukes i stedet for kolon (`19.35`). Tideler og hundredeler skrives etter komma (`19.35,34` = 19 min 35,34 s), eller etter punktum når tiden bruker kolon (`19:35.34`). Siden viser like mange desimaler som den mest presise tiden i fila. En tid med to ledd leses alltid som minutter og sekunder. Tider som inneholder komma må stå i anførselstegn i en kommaseparert fil, f.eks. `"19.35,34"`. I en semikolonseparert fil trengs det ikke.
- **Ikke fullført:** skriv `DNF`, `DNS` eller `DSQ` i tid-feltet, eller la feltet stå tomt. Disse vises nederst i lista uten plassering.
- **Klubb** kan stå tom.
- **Skilletegn:** komma, semikolon (standard når norsk Excel lagrer CSV) og tab fungerer.
- **Kolonnenavn:** i tillegg til de over godtas `startnummer`/`bib`, `name`, `club`/`lag` og `time`/`sluttid`/`nettotid`.
- Lagre som UTF-8, slik at æ, ø og å blir riktige. I Excel heter valget «CSV UTF-8».

## Teste lokalt

Sidene henter CSV-filene med `fetch`, og det virker ikke når HTML-fila åpnes direkte fra disk (`file://`). Start en enkel webserver i rotmappen:

```sh
python3 -m http.server 8000
```

Åpne så <http://localhost:8000/resultater.html>.

## Løypa (`course/endestadstoylen-opp.gpx`)

`loypa.html` tegner kart, høydeprofil og fakta direkte fra GPX-fila. Hvis løypa endres, eksporter en ny GPX fra Strava (ruten → «Export GPX») og erstatt fila med samme navn. Kartet, profilen og tallene oppdateres av seg selv.

Distanse og høydemeter som vises på resultatsidene (vertikalfart og tempo) kommer fra `distanse_km` og `stigning_m` i `lop.csv`. De settes per løp, slik at et år med en annen løype kan ha egne tall. For 2026 er de hentet fra GPX-fila: 1,25 km og 258 høydemeter.
