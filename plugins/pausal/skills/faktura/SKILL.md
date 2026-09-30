---
name: faktura
description: 'Pravi, proverava i finalizuje B2B fakturu paušalca (RSD ili EUR, srednji kurs NBS, KPO red, nezavisan pregled pre slanja), uključujući storno i ispravku. Koristiti za „nova faktura", „izdaj fakturu", „storniraj fakturu", „ispravi fakturu". Ne za prodaju fizičkim licima (fiskalizacija).'
---

# Faktura

Radi u radnom prostoru agencije (folder sa `agencija.json`, u daljem tekstu `WS`). Skripte su u `../../scripts/` u odnosu na ovaj fajl (`S`). Računicu, kurs, broj i upis u KPO radi skripta; ti pripremaš nacrt i proveravaš.

Svaku poresku tvrdnju proveri sa `node "$S/propisi.mjs" propis:<id> --datum=<datum> [--kupac=b2b]` i navedi izvor. NEPROVERENO izgovori kao NEPROVERENO.

## Pre svega

```bash
node "$S/faktura.mjs" oporavak "$WS"
```
Ako vrati fakturu bez KPO reda, finalizacija je bila prekinuta posle premeštanja PDF-a. Završi je ponovnim `finalizuj` sa istim JSON-om nacrta (on je sada u `Finansije/Fakture/`); skripta prepoznaje premeštene fajlove i samo upisuje KPO red. Ne izdaj novu fakturu dok ovo nije rešeno.

Ako KPO za tekuću godinu ne postoji, pitaj da li je ovo prva faktura agencije ove godine. Ako nije, prvo prenesi postojeću evidenciju (`/pausal:init`, korak Postojeća evidencija); inače bi broj krenuo od 1, a limiti bili pogrešni.

## Nova faktura

1. **Kupac.** Podaci su u `Memory/memory.md`; ako klijenta nema, prvo `/pausal:klijent`. Tip kupca:
   - `b2b` (pravno lice ili preduzetnik): nastavi;
   - `b2c` (fizičko lice): stani, jer važi `propis:fiskalizacija.b2c`; v1 ne izdaje takve fakture;
   - `b2g` (javni sektor): stani i objasni `propis:sef.b2g` i `propis:faktura.rok-placanja-b2g`; v1 ne izdaje B2G fakture.
2. **Broj.** `node "$S/kpo.mjs" sledeci "$WS/Finansije/KPO/kpo-<godina>.csv" <godina>`.
3. **Datumi i rok.** Izdavanje, promet, rok = izdavanje + dogovoreni rok klijenta ili `rok_placanja_dana` iz `agencija.json`. Rok ne sme preći `propis:faktura.rok-placanja-b2b`.
4. **Kurs (devizna faktura).** Koji datum kursa važi određuje `propis:kpo.kurs-datum`. Ako je NEPROVERENO (`unverified`), skripta neće napraviti deviznu fakturu dok u `Memory/odluke.md` ne postoji odluka korisnika označena sa `odluka:kpo.kurs-datum`. Iznesi opcije iz reda propisa (datum izdavanja ili datum prometa), bez preporuke, predloži proveru sa knjigovođom i upiši odluku sa razlogom. Zatim:
   ```bash
   node "$S/kurs.mjs" <YYYY-MM-DD> EUR
   ```
   Ako se `datumListe` razlikuje od traženog datuma (vikend, praznik), reci to. Ako dohvatanje ne uspe, traži kurs i broj liste od korisnika sa sajta NBS.
5. **Napomene.** Napomena o PDV-u je praksa, ne propis (`propis:faktura.pdv-napomena`); predloži „Obveznik nije u sistemu PDV-a." i pitaj. Za strane kupce ne dodaji tvrdnje o mestu prometa ni o obrnutom obračunu bez provere. Propis o obaveznim elementima računa za preduzetnika van PDV-a nije pronađen (`propis:faktura.elementi`, NEPROVERENO); šablon ima uobičajene elemente.
6. **Nacrt.** Napiši JSON u `$WS/Finansije/Fakture/nacrti/nacrt.json`:
   ```json
   {"broj":"2026-1","datum_izdavanja":"2026-10-05","datum_prometa":"2026-09-30","rok_placanja":"2026-11-04",
    "mesto_izdavanja":"Novi Sad","valuta":"EUR","kurs":"117.5386","kursna_lista":"185","jezik":"sr-en","klijent":"slug",
    "kupac":{"naziv":"","adresa":"","mesto":"","drzava":"","pib":"","vat_id":"","tip":"b2b"},
    "stavke":[{"opis":"","kolicina":"160","jedinica":"h","cena":"25,00","vrsta":"usluga"}],
    "napomene":["Obveznik nije u sistemu PDV-a."]}
   ```
   Za RSD fakturu izostavi `kurs` i `kursna_lista`; `jezik` je `sr` ili `sr-en`; `vrsta` je `usluga` ili `proizvod`. Zatim:
   ```bash
   node "$S/faktura.mjs" nacrt "$WS" "$WS/Finansije/Fakture/nacrti/nacrt.json"
   ```
   Skripta odbija neispravan nacrt, deviznu fakturu bez deviznog računa u `agencija.json` i PDF duži od jedne strane. Ako renderovanje ne uspe, stari nacrt se briše i ne može se finalizovati. Pokaži korisniku PDF, ukupno, protivvrednost u RSD i `napomene`.
7. **Nezavisan pregled.** Pokreni svežeg sub-agenta bez konteksta ove sesije (u Codex-u novi Codex, u Claude-u novi Claude; unakrsno ako su oba dostupna). Daj mu PDF, HTML, JSON nacrta, KPO CSV, podatke kupca iz `Memory/memory.md` i ovu listu:
   - aritmetika: količina × cena, zbir, iznos × kurs = RSD;
   - kurs i broj liste prema `kurs.mjs` za isti datum; broj je sledeći u KPO;
   - datumi: rok = izdavanje + dogovoreni rok;
   - podaci izdavaoca prema `agencija.json`, podaci kupca prema memoriji;
   - stil: jedna strana, dijakritici, format 1.234,56 i DD.MM.YYYY, ime fajla.
   Nalaze pokaži korisniku. Posle ispravke napravi novi nacrt; proverava se samo izmenjeni deo.
8. **Finalizacija** (tek kad korisnik kaže da je faktura ispravna):
   ```bash
   node "$S/faktura.mjs" finalizuj "$WS" "$WS/Finansije/Fakture/nacrti/<ime>.json"
   ```
   Skripta ponovo proverava propise, pa pod lock-om proverava da je broj i dalje sledeći, premešta PDF u `Finansije/Fakture/` i upisuje KPO red. Nacrt izmenjen posle renderovanja odbija. Posle toga:
   - `Memory/memory.md`: poslednji broj fakture;
   - `Memory/log.md`: `YYYY-MM-DD — Faktura <broj>, <klijent>, <iznos>`;
   - `/pausal:kpo` za stanje limita posle ove fakture.
9. **Mejl.** Popuni `Sabloni/mail-faktura-sr.txt` ili `-en.txt` i pokaži tekst. Korisnik šalje sam; ti nikad ne šalješ.

## Storno i ispravka

```bash
node "$S/faktura.mjs" storniraj "$WS" <broj> "<razlog>"
```
Red ostaje u KPO sa statusom `stornirana`; broj se ne ponavlja. Ispravka je nova faktura sa novim brojem i napomenom koja pominje storniranu.

## SEF

Ne predlaži dobrovoljnu registraciju na SEF bez potrebe: obavezuje za tekuću i narednu godinu (`propis:sef.dobrovoljno`).
