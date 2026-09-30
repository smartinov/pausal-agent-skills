---
name: init
description: 'Postavlja radni prostor paušalne agencije (AGENTS.md, agencija.json, Memory/, Finansije/, Sabloni/) kroz kratak upitnik. Koristiti kad korisnik kaže „napravi radni prostor", „nova paušalna agencija", „pausal init" ili počinje da vodi paušal sa agentom.'
---

# Init radnog prostora

Skripte su u `../../scripts/` u odnosu na folder ovog fajla; pozivaj ih apsolutnom putanjom (`S` ispod). Radni prostor je folder koji korisnik izabere; u njemu će biti lični i poslovni podaci.

## Koraci

1. **Folder.** Pitaj gde da napravi radni prostor (predlog: `~/Documents/<naziv-agencije>`). Pre bilo kog drugog pitanja pokreni:
   ```bash
   node "$S/init.mjs" proveri "<folder>"
   ```
   Ako `ok` nije `true`, reci razlog i traži drugi folder. Ne pitaj ništa lično dok provera ne prođe. Upozorenja (npr. folder je u git repou) prenesi korisniku doslovno.

2. **Upitnik.** Pitaj redom, jedno po jedno, i ništa ne izmišljaj:
   - poslovno ime tačno kao u APR rešenju i kratak naziv za komunikaciju;
   - adresa sedišta i mesto sa poštanskim brojem;
   - PIB (9 cifara) i matični broj (8 cifara);
   - šifra delatnosti;
   - status osiguranja: `samostalan` (paušal je jedini osnov osiguranja) ili `zaposlen` (radi i kod drugog poslodavca);
   - datum registracije u APR-u;
   - e-mail i telefon za fakture;
   - dinarski račun (18 cifara, bez crtica) i banka; devizni račun (IBAN, SWIFT) ako postoji;
   - podrazumevani rok plaćanja u danima. Za B2B zakonski maksimum proveri sa `node "$S/propisi.mjs" propis:faktura.rok-placanja-b2b --kupac=b2b` i reci ga uz izvor.

3. **Pravljenje.**
   ```bash
   node "$S/init.mjs" napravi "<folder>"
   ```
   Upiši odgovore u `<folder>/agencija.json` (ista polja koja su već u fajlu), pa:
   ```bash
   node "$S/agencija.mjs" "<folder>/agencija.json"
   ```
   Greške ispravi sa korisnikom. Upozorenje o kontrolnoj cifri znači verovatnu grešku u kucanju: pročitaj broj korisniku i traži potvrdu.

4. **Postojeća evidencija.** Pitaj da li agencija već ima izdate fakture ili KPO (tekuće ili prethodne godine). Ako ima:
   - sačuvaj originale netaknute (kopija u `Finansije/KPO/stari/`);
   - CSV sa kolonama `rb;broj_fakture;datum_izdavanja;datum_prometa;klijent;opis;iznos_eur;kurs_nbs;prihod_usluge_rsd;ukupno_rsd;rok_placanja;datum_naplate;napomena`:
     ```bash
     node "$S/migracija.mjs" "<stari.csv>" "<folder>/Finansije/KPO/kpo-<godina>.csv"
     ```
     Pokaži broj redova, oba zbira i sva upozorenja; zbirovi moraju biti isti. Napomene koje pominju storno potvrdi sa korisnikom i storniraj preko `/pausal:faktura`.
   - drugi format (Excel, drugi servis): stani i reci korisniku da je potreban ručni prenos ili nov format migracije; ne izmišljaj mapiranje.
   - potvrdi sledeći broj fakture: `node "$S/kpo.mjs" sledeci "<folder>/Finansije/KPO/kpo-<godina>.csv" <godina>`.
   Dok istorija nije prenesena, svaki izveštaj o limitima označi kao nepotpun.

5. **Memorija.** U `Memory/log.md` dodaj `YYYY-MM-DD — Radni prostor napravljen`. Ako korisnik još nema rešenje Poreske uprave, u `Memory/memory.md` ostavi napomenu da iznosi nisu upisani.

6. **Završetak.** Reci korisniku:
   - da ovaj folder otvara kao projekat u Claude Code-u ili Codex-u; `AGENTS.md` vodi agenta;
   - da folder sadrži lične podatke i da git repo, ako ga koristi, mora biti privatan;
   - da je sledeći korak `/pausal:obaveze` (rokovi i kalendar), a zatim `/pausal:klijent` za prvog klijenta.

Ne šalji ništa nikome i ne pravi GitHub repo.
