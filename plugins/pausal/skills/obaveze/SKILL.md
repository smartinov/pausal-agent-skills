---
name: obaveze
description: 'Rokovi i obaveze paušalca: mesečni porez i doprinosi, godišnje obaveze, PPDG-1R, podsetnici i .ics kalendar, prenos sredstava na lični račun i šifre plaćanja. Koristiti za „šta treba da platim", „rokovi", „kalendar obaveza", „koliko smem da prebacim sebi", „šifra plaćanja".'
---

# Obaveze

Radni prostor je `WS`, skripte su u `../../scripts/` u odnosu na ovaj fajl (`S`). Status osiguranja je u `agencija.json` (`osiguranje`); prosledi ga svakoj proveri: `node "$S/propisi.mjs" propis:<id> --osiguranje=<samostalan|zaposlen>`.

## Šta se plaća mesečno

Iznose određuje rešenje Poreske uprave; oni su u `Memory/memory.md`. Ako rešenja nema, reci da iznosi nisu poznati i ne računaj ih sam.

Objasni sastav uz izvor za status korisnika:

- porez: `propis:porez.pausal-stopa`;
- doprinosi: `propis:doprinos.pio`, `propis:doprinos.zdravstvo`, `propis:doprinos.nezaposlenost`. Za status `zaposlen` redovi o zdravstvu i nezaposlenosti mogu biti NEPROVERENO; tako i reci.

Rok je u `propis:obaveze.rok-mesecni`. Da li se rok pomera kad pada na neradni dan: `propis:obaveze.neradni-dan`.

## Kalendar i podsetnici

```bash
node "$S/ics.mjs" "$WS/agencija.json" <godina> "$WS/rokovi-<godina>.ics"
```

- `lista` upiši u `Memory/schedule.md` (rok, obaveza, propis, status).
- `.ics` korisnik uvozi u svoj kalendar (Apple Calendar, Google Calendar, Outlook); podsetnik je 3 dana ranije.
- Sve iz `preskoceno` reci korisniku: te obaveze nisu u kalendaru jer propis nije proveren.

Na početku sesije, ako `Memory/schedule.md` ima rok u narednih 14 dana, javi ga.

## Događaji tokom godine

- **Promena osnova osiguranja** (zaposlenje ili prestanak zaposlenja): PPDG-1R u roku iz `propis:obaveze.ppdg1r`. Posle promene ažuriraj `osiguranje` u `agencija.json` i ponovo napravi kalendar.
- **Eko-taksa:** prijava `propis:eko-taksa.prijava`, plaćanje `propis:eko-taksa.placanje`, gornja granica `propis:eko-taksa.max`.
- **Povraćaj PIO** (status `zaposlen`): PIO se plaća po svim osnovima samo do najviše godišnje osnovice (`propis:doprinos.pio-max-osnovica`; proveri je za godinu na koju se povraćaj odnosi, npr. `--datum=2026-12-31` za 2026, a ako za tu godinu nema reda, reci NEPROVERENO); postupak za povraćaj viška je `propis:doprinos.povracaj`. Izračunaj da li je zbir osnovica (zarada iz obračuna poslodavca + paušalna osnovica iz rešenja) prešao granicu; zaradu traži od korisnika, ne pretpostavljaj.

## Prenos na lični račun

- Koliko sme da se prebaci: stanje računa minus obaveze do sledećeg roka (porez, doprinosi, eko-taksa) minus naknade banke. Pokaži računicu.
- Poreski tretman prenosa nije u `propisi.md`: ne tvrdi da je oporeziv ni da nije; uputi na knjigovođu.
- Šifra plaćanja za prenos na lični račun: `propis:placanje.sifra-241` objašnjava šta Prilog 3 kaže, a šta je praksa. Uplata vlasnika na poslovni račun: `propis:placanje.sifra-uplata-vlasnika`. Odluku korisnika upiši u `Memory/odluke.md`.
- Podizanje gotovine: `propis:gotovina.podizanje`.

Ne izvršavaj plaćanja i ne podnosi prijave; pripremi podatke i pokaži ih korisniku.
