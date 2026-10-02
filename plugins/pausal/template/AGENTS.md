# AGENTS.md — radni prostor paušalne agencije

Ovaj folder je back office paušalne agencije. Agent (Claude Code ili Codex) ga čita na početku svake sesije i radi preko `pausal` skill-ova.

## Redosled čitanja

1. Ovaj fajl.
2. `agencija.json`: identitet agencije (poslovno ime, PIB, MB, računi, status osiguranja). Jedino mesto za te podatke.
3. `Memory/memory.md`: trajne činjenice (rešenje PU, klijenti, poslednji broj fakture).
4. `Memory/log.md`: poslednjih 30 redova.
5. `Memory/schedule.md`: šta dospeva u narednih 14 dana; to prvo javi korisniku.

## Skill-ovi

| Zadatak | Skill |
|---|---|
| Faktura, storno, ispravka | `/pausal:faktura` |
| Promet, limiti, KPO izvoz | `/pausal:kpo` |
| Novi klijent, test samostalnosti, ugovor | `/pausal:klijent` |
| Izvod banke, naplata, devizni priliv | `/pausal:naplata` |
| Rokovi, porez i doprinosi, kalendar, prenos sebi | `/pausal:obaveze` |

## Pravila

- Svaka tvrdnja o porezu, doprinosima, rokovima, limitima ili šiframa plaćanja dolazi iz `propisi.md` plugin-a, sa ID-jem i izvorom. Ako pravilo nije provereno ili je isteklo, reci NEPROVERENO i predloži proveru sa knjigovođom; nikad ne nagađaj.
- Ništa se ne šalje, ne plaća i ne podnosi bez izričite potvrde korisnika.
- Iznosi se prikazuju u RSD (i EUR gde postoji), u srpskom formatu: 1.234,56.
- Ovo nije poreski ni pravni savet.

## Memorija

- `Memory/memory.md`: činjenice koje važe dok se ne promene; uz izmenu upiši datum.
- `Memory/log.md`: append-only, `YYYY-MM-DD — događaj`; nikad ne briši.
- `Memory/odluke.md`: jedna sekcija po odluci (odluka, razlog, odbačeno).
- `Memory/schedule.md`: rokovi i podsetnici.

## Struktura

```
agencija.json
Memory/
Sabloni/            faktura.html, mail-faktura-sr.txt, mail-faktura-en.txt
Finansije/Fakture/  faktura-{GOD}-{INDEKS}-{klijent}.pdf (+ .html, .json); nacrti/ pre finalizacije
Finansije/KPO/      kpo-{GOD}.csv (KPO knjiga)
Klijenti/{slug}/    ugovor, test samostalnosti
Banka/Izvodi/       izvodi banke
Poreska/            rešenja PU, potvrde uplata
Registracija/       rešenje APR, potvrda o PIB-u, prijava
```

Imena fajlova: `{YYMMDD}-opis.ext`, mala slova, crtice, bez razmaka i dijakritika (osim faktura, koje nose broj).

Ovaj folder sadrži lične i poslovne podatke. Ako je u gitu, repo mora biti privatan.
