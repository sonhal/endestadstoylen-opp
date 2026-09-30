# Nyheter

`nyheter.html` og «Siste nytt» på forsiden leser alt fra `nyheter.csv` i denne mappen. En ny sak legges til ved å sette inn én linje **rett under overskriftslinja**. Øverste sak vises først, og den vises også på forsiden.

```csv
dato,type,tittel,tekst,lenke,kilde,betalingsmur
2027-02-01,nyhet,Påmeldingen er åpen,"Meld deg på innen 20. mars. Startkontingent 100 kr.",,,
2026-04-05,presse,Jakob vann første utgave av Endestadstøylen opp,Kort omtale av saken.,https://www.firdaposten.no/...,Firdaposten,ja
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

Tekst som inneholder komma eller linjeskift må stå i anførselstegn, slik Excel gjør av seg selv. Ellers gjelder de samme reglene som for resultatfilene (se `results/README.md`): komma, semikolon og tab fungerer som skilletegn, og fila må lagres som UTF-8.
