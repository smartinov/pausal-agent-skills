# Pausal Agent Skills

<img src="plugins/pausal/assets/icon.png" alt="Paušal project icon" width="128" height="128">

> **English:** Agent skills for Claude Code and Codex that run the back office of a Serbian flat-tax sole proprietorship (*paušalni preduzetnik*): invoices, the KPO ledger, turnover limits, tax deadlines, client independence tests, and payment matching. Every tax fact comes from one sourced, dated reference file. Content is in Serbian. Not tax or legal advice.

Skill-ovi za Claude Code i Codex koji vode back office paušalne agencije u Srbiji. Agent radi u tvom lokalnom folderu, a pravila dolaze iz plugin-a.

**Status: u izradi, još nije spremno za upotrebu.**

## Skill-ovi

| Skill | Šta radi |
|---|---|
| `/pausal:init` | Pravi radni prostor agencije kroz kratak upitnik. |
| `/pausal:faktura` | B2B faktura (RSD, EUR ili valutna klauzula), kurs NBS, KPO red, nezavisan pregled, storno i ispravka. |
| `/pausal:kpo` | Kumulativ, limiti paušala i PDV-a, projekcija, udeo po klijentu. |
| `/pausal:klijent` | Podaci klijenta, test samostalnosti, klauzule ugovora. |
| `/pausal:naplata` | Izvod banke → uparivanje sa fakturama, devizni priliv. |
| `/pausal:obaveze` | Rokovi, podsetnici, `.ics` kalendar, prenos na lični račun. |

## Propisi

Sve poreske i knjigovodstvene činjenice (limiti, stope, rokovi, šifre plaćanja) žive u jednom fajlu, [`plugins/pausal/reference/propisi.md`](plugins/pausal/reference/propisi.md). Svaki red ima izvor, period primene, status i datum provere. Kad red nije proveren ili je istekao, skill kaže NEPROVERENO umesto da nagađa.

## Preduslovi

- Node.js (LTS) i Google Chrome (za PDF fakture).
- Claude Code čita `AGENTS.md` radnog prostora od verzije 2.1.277, i to samo ako ni u radnom prostoru ni u folderima iznad njega nema `CLAUDE.md`.

## Instalacija

Claude Code:

```bash
claude plugin marketplace add smartinov/pausal-agent-skills
claude plugin install pausal@pausal-agent-skills
```

Codex:

```bash
codex plugin marketplace add smartinov/pausal-agent-skills
codex plugin add pausal@pausal-agent-skills
```

Zatim u praznom folderu (van ovog repoa) pokreni `/pausal:init`. Radni prostor sadrži lične i poslovne podatke: ako ga držiš u gitu, repo mora biti privatan.

## Doprinos

Izmene u `propisi.md` prihvataju se samo uz link na primarni izvor (propis, Službeni glasnik, purs.gov.rs, apr.gov.rs, nbs.rs). Nikad ne commit-uj stvarne PIB, JMBG ni brojeve računa; primeri koriste izmišljenu agenciju.

Svaka izmena skill-a, skripte ili šablona proverava da li sajt (`docs/index.html`) i tabela skill-ova u ovom README-u i dalje tačno opisuju plugin; ako ne, ažuriraju se u istom PR-u.

## Odricanje odgovornosti

Ovo nije poreski ni pravni savet. Propisi se menjaju; proveri sa knjigovođom pre odluke koja nosi novac ili rok. Softver se isporučuje bez garancije (MIT licenca).
