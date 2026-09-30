---
name: kpo
description: 'Stanje KPO knjige paušalca: kumulativ prometa, limiti paušala i PDV-a, projekcija do kraja godine, udeo po klijentu, izvoz za štampu ili knjigovođu. Koristiti za „koliko sam fakturisao", „limit", „KPO", „da li prelazim 6 miliona", „izvezi KPO".'
---

# KPO i limiti

Radni prostor je `WS`, skripte su u `../../scripts/` u odnosu na ovaj fajl (`S`). KPO je `$WS/Finansije/KPO/kpo-<godina>.csv`; u njega se upisuje samo preko `/pausal:faktura` i `/pausal:naplata`, nikad ručnom izmenom.

## Stanje limita

```bash
node "$S/limiti.mjs" "$WS/Finansije/KPO/kpo-<godina>.csv" "$WS/Finansije/KPO/kpo-<prethodna>.csv"
```

Prikaži korisniku, u RSD i sa izvorom (`citat` iz izlaza):

- **Paušal** (`propis:limit.pausal`): promet ove kalendarske godine, udeo u pragu, linearna projekcija do kraja godine. Objasni posledicu tačno kako je u propisu: prag se meri nad prometom godine koja prethodi godini oporezivanja, pa prelazak ove godine utiče na pravo na paušal naredne godine. Šta se dešava tokom godine opisuje `propis:limit.pausal-tokom-godine`.
- **PDV** (`propis:limit.pdv`): promet u poslednjih 12 meseci. Ako je prag pređen, rok za evidencionu prijavu je kratak (`propis:limit.pdv-prijava`); reci to odmah i predloži razgovor sa knjigovođom.
- **Upozorenje** na 70% praga ili projekciju preko praga je praksa ovog alata, ne propis.
- **Udeo po klijentu** u poslednjih 12 meseci: ako je neki klijent blizu 70%, uputi na `/pausal:klijent` (test samostalnosti).

Ako je `status` NEPROVERENO, prikaži promet bez praga i reci zašto (`razlog`).

Promet se računa po datumu prometa, bez storniranih faktura. Ako izlaz ima `pdv.nepotpuno`, reci da je PDV promet možda veći (KPO prethodne godine nije učitan; kod agencije registrovane ove godine to je očekivano). Polje `napomena` znači da skripta ne primenjuje isključenja iz prometa navedena u propisu: pitaj da li je bilo takvih prihoda (npr. prodaja opreme za PDV prag) i objasni uticaj.

## Izvoz za štampu ili knjigovođu

KPO sme da se vodi elektronski ako može da se odštampa ili prikaže (`propis:kpo.kolone`).

```bash
node "$S/kpo.mjs" izvoz "$WS/Finansije/KPO/kpo-<godina>.csv" "$WS/Finansije/KPO/kpo-<godina>.html"
```

HTML ima pet propisanih kolona; za PDF ga korisnik odštampa iz browser-a.

## Čuvanje

KPO, fakture i izvodi se čuvaju najmanje onoliko koliko kaže `propis:kpo.cuvanje`; ne predlaži brisanje starijih godina.
