---
name: klijent
description: 'Novi ili postojeći klijent paušalca: podaci za fakturu, test samostalnosti (9 kriterijuma) i klauzule i rizici postojećeg ugovora. Koristiti za „novi klijent", „test samostalnosti", „pregledaj ugovor", „da li sam samostalan".'
---

# Klijent

Radni prostor je `WS`, skripte su u `../../scripts/` u odnosu na ovaj fajl (`S`). Pravila čitaj sa `node "$S/propisi.mjs" propis:<id>` i navodi izvor.

## Podaci klijenta

U `Memory/memory.md`, pod podnaslovom klijenta, upiši: pravni naziv, adresu, mesto i državu, PIB i MB (domaći) ili VAT ID (strani), e-mail za fakture, valutu, dogovoreni rok plaćanja, slug (mala slova i crtice, npr. `primer-doo`) i tip kupca:

- `b2b`: pravno lice ili preduzetnik;
- `b2g`: javni sektor. Rok je ograničen (`propis:faktura.rok-placanja-b2g`), a obaveza SEF-a je sporna (`propis:sef.b2g`); v1 ne izdaje ovakve fakture;
- `b2c`: fizičko lice; važi `propis:fiskalizacija.b2c`, pa v1 ne izdaje ovakve fakture.

Dokumenti klijenta idu u `Klijenti/<slug>/` kao `{YYMMDD}-opis.ext`.

## Test samostalnosti

Kriterijumi i posledica su u `propis:samostalnost.test`. Prođi svih 9 sa korisnikom, jedan po jedan, i za svaki traži činjenicu (klauzulu ugovora ili stvarnu praksu), ne utisak:

1. Kriterijumi 1–5, 7 i 8: pitaj i zabeleži dokaz. Kod kriterijuma 8, delimična zabrana rada za ograničen broj direktnih konkurenata ne računa se.
2. Kriterijum 6, udeo prihoda (`propis:samostalnost.prag-prihoda`):
   ```bash
   node "$S/limiti.mjs" "$WS/Finansije/KPO/kpo-<godina>.csv" "$WS/Finansije/KPO/kpo-<prethodna>.csv"
   ```
   Polje `klijenti` daje udeo u poslednjih 12 meseci. Zakon meri period od 12 meseci koji počinje ili se završava u poreskoj godini, pa je ovo aproksimacija; reci to. Za novog klijenta proceni prema planu saradnje.
   Kriterijumi 6 i 9 računaju nalogodavca zajedno sa povezanim licima. Pitaj da li je neki drugi klijent povezano lice ovog (ista grupa, isti vlasnik); ako jeste, saberi njihove udele i dane i zabeleži grupu pod oba klijenta u `Memory/memory.md`. Šta je povezano lice određuje zakon o porezu na dobit; ako je nejasno, reci NEPROVERENO i predloži knjigovođu.
3. Kriterijum 9, radni dani (`propis:samostalnost.prag-dana`): pitaj procenu broja dana sa bilo kakvom aktivnošću za tog klijenta u 12 meseci.

Rezultat je broj ispunjenih kriterijuma. Na pragu iz propisa ili iznad njega prihod od tog klijenta se oporezuje kao drugi prihod: reci to jasno i predloži razgovor sa knjigovođom pre potpisa ili nastavka saradnje. Rezultat (broj, datum, ključni dokazi) upiši pod klijentom u `Memory/memory.md`, a odluku o saradnji u `Memory/odluke.md`.

Test ponovi kad se promene ugovor, obim ili udeo klijenta.

## Ugovor

Ne pravi generički ugovor. Za postojeći ili predloženi ugovor:

- označi klauzule koje ispunjavaju neki od 9 kriterijuma (radno vreme, prostorije, obuka, oprema, zabrana rada za druge, rad bez poslovnog rizika);
- predloži klauzule koje idu u prilog samostalnosti: sopstvena oprema i mesto rada, sloboda organizacije, pravo na druge klijente, naknada po isporuci ili uz jasan rezultat, odgovornost za rezultat;
- podseti da ugovor ne pomaže ako se stvarna praksa razlikuje od njega.

Pravni tekst ugovora je za advokata; ti daješ listu nalaza.
