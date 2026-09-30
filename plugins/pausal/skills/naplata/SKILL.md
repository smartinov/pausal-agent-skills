---
name: naplata
description: 'Čita izvod banke (PDF ili CSV), uparuje prilive sa otvorenim fakturama uz potvrdu korisnika, upisuje datum naplate i vodi kroz raspored deviznog priliva. Koristiti za „stigao izvod", „da li je plaćeno", „upari uplate", „devizni priliv".'
---

# Naplata

Radni prostor je `WS`, skripte su u `../../scripts/` u odnosu na ovaj fajl (`S`).

## Izvod

1. Pročitaj izvod: PDF kroz `pdftotext -layout` ako postoji, inače pročitaj PDF direktno; CSV iz e-bankinga pročitaj kao tabelu. Proveri da je račun sa izvoda račun agencije iz `agencija.json`; ako nije, stani.
2. Izdvoji prilive: datum, iznos, valuta, uplatilac, poziv na broj, svrha.
3. Otvorene fakture su KPO redovi sa statusom `izdata` i praznim `datum_naplate`, u `$WS/Finansije/KPO/kpo-<godina>.csv` (i prethodnoj godini).
4. Za svaki priliv predloži uparivanje po redu: poziv na broj = broj fakture, zatim iznos i uplatilac. Prikaži tabelu predloga i razlike (manje plaćeno, više plaćeno, naknada banke). **Ništa ne upisuj dok korisnik ne potvrdi svako uparivanje.**
5. Posle potvrde:
   ```bash
   node "$S/kpo.mjs" naplata "$WS/Finansije/KPO/kpo-<godina>.csv" <broj> <YYYY-MM-DD>
   ```
   Nepoznat priliv ili razliku u iznosu ne upisuj; pitaj korisnika i zabeleži u `Memory/log.md`.
6. Izvod sačuvaj kao `Banka/Izvodi/{YYMMDD}-izvod-<banka>.pdf` (datum izvoda). U `Memory/log.md` dodaj red po naplaćenoj fakturi.

Naplata ne menja promet ni limite, jer se oni vode po fakturama (vidi `/pausal:kpo`).

## Devizni priliv

Banka po prilivu iz inostranstva traži raspored priliva: iznos, broj fakture i šifru osnova. Šifra prati stvarnu vrstu usluge (`propis:devizni.sifre-usluga`); ne biraj konsalting za programiranje ni obrnuto. Kakvu dokumentaciju banka traži je pravilo te banke, ne propis: pitaj korisnika šta je banka tražila i to upiši u `Memory/memory.md`.

Konverzija EUR u RSD nije deo ovog koraka; to je odluka korisnika.
