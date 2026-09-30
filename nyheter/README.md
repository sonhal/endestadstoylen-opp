# Nyheter

`nyheter.html` og «Siste nytt» på forsiden leser alt fra `nyheter.csv` i denne mappen. En ny sak legges til ved å sette inn én linje **rett under overskriftslinja**. Øverste sak vises først, og den vises også på forsiden.

```csv
dato,type,tittel,tekst,lenke,kilde,betalingsmur,bilde,bildetekst
2027-02-01,nyhet,Påmeldingen er åpen,"Meld deg på innen 20. mars. Startkontingent 100 kr.",,,,,
2026-04-04,presse,Jakob vann første utgåve av Endestadstøylen opp,Kort omtale av saken.,https://www.firdaposten.no/...,Firdaposten,ja,2026-deltakere.webp,Deltakerne jubler i skogen
```

| Kolonne        | Påkrevd | Beskrivelse |
|----------------|---------|-------------|
| `dato`         | nei     | Publiseringsdato som `ÅÅÅÅ-MM-DD`. Står den tom, vises ingen dato |
| `type`         | nei     | `nyhet` (fra arrangøren, standard) eller `presse` (omtale i aviser o.l.) |
| `tittel`       | ja      | Overskrift. Linjer uten tittel hoppes over |
| `tekst`        | nei     | Kort tekst. Tom linje (to linjeskift) gir nytt avsnitt |
| `lenke`        | nei     | Nettadresse til saken. Må starte med `https://` eller `http://` |
| `kilde`        | nei     | Navnet på avisen eller nettstedet, f.eks. `Firdaposten` |
| `betalingsmur` | nei     | `ja` gir merket «Krever abonnement» ved lenken |
| `bilde`        | nei     | Filnavn på et bilde i `nyheter/bilder/`, f.eks. `2026-deltakere.webp`. Vises øverst i saken, beskåret til 4:3 |
| `bildetekst`   | nei     | Beskrivelse av bildet for skjermlesere (alt-tekst). Beskriv hva som vises |

Bilder legges i `nyheter/bilder/`. Hold dem under ca. 500 kB (JPG eller WebP, rundt 1600 px bredt), så siden laster raskt på mobil. Bruk bare bilder dere har rett til å publisere.

Tekst som inneholder komma eller linjeskift må stå i anførselstegn, slik Excel gjør av seg selv. Ellers gjelder de samme reglene som for resultatfilene (se `results/README.md`): komma, semikolon og tab fungerer som skilletegn, og fila må lagres som UTF-8.
