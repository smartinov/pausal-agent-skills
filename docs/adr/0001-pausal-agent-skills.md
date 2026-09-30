# ADR 0001 — Pausal agent skills

Status: prihvaćeno (2026-09-30)

## Kontekst

Paušalni preduzetnik u Srbiji vodi mali, ali strog back office: fakture, KPO knjigu, limite prometa, mesečne obaveze prema Poreskoj upravi, test samostalnosti po klijentu i uparivanje naplate sa izvodima. Agent (Claude Code ili Codex) to može da radi u lokalnom folderu, ali samo ako ima pravila i ako se ta pravila ne izmišljaju.

Autor ovakav back office već vodi za sopstvenu agenciju. Nezavisna provera tih beleški na primarnim izvorima našla je više grešaka (rok za PPDG-1R, zastarelost povraćaja doprinosa, šifra plaćanja za uplatu gotovine). Pouka: najveći rizik nisu skill-ovi, već netačna ili zastarela poreska činjenica izneta kao sigurna.

## Zahtevi

- Javan, open source; radi i u Claude Code-u i u Codex-u.
- Za sve paušalce: bilo koja delatnost, oba statusa osiguranja (samo preduzetnik / iz radnog odnosa). Izdavanje faktura u v1 pokriva samo B2B (vidi Faktura).
- Podaci korisnika (PIB, JMBG, fakture) nikad ne ulaze u ovaj repo.
- Svaka poreska ili knjigovodstvena tvrdnja ima izvor i datum provere; neproverena se tako i označava.
- Radi na macOS, Linux i Windows; preduslovi su samo Node.js (LTS) i Chrome.

## Odluka

### Raspored

Sve što instalirani plugin koristi živi unutar plugin foldera, jer instalacija kopira samo njega:

```
.claude-plugin/marketplace.json
.agents/plugins/marketplace.json
plugins/pausal/
├── skills/{init,faktura,kpo,klijent,naplata,obaveze}/SKILL.md
├── reference/propisi.md
├── template/            ← radni prostor koji init kopira
└── scripts/*.mjs        ← računica, KPO, kurs, .ics, provere
.claude/skills/propisi-revizija/   ← samo za održavanje repoa
docs/index.html, docs/adr/
```

Skill-ovi nalaze fajlove relativno od svog foldera (`../../reference/propisi.md`, `../../scripts/…`), ne preko `${CLAUDE_PLUGIN_ROOT}`, koji Codex ne zamenjuje.

### Radni prostor

- `/pausal:init` postavlja minimalan upitnik i kopira `template/` u folder koji korisnik izabere (iCloud, Dropbox, privatni git).
- Init odbija folder unutar plugin izvora, instalacije ili ovog repoa, i to pre nego što pita za lične podatke. Ako je folder git repo, upozorava da mora biti privatan i dodaje `.gitignore`.
- Radni prostor ima samo `AGENTS.md`: identitet agencije, redosled čitanja `Memory/` i upućivanje na skill-ove. README navodi da Claude Code čita AGENTS.md od v2.1.277 i samo ako iznad radnog prostora nema CLAUDE.md.
- Pravila su u plugin-u, pa se radni prostor ne migrira kad se pravila menjaju.

### Propisi

Jedan `reference/propisi.md`, tabela sa kolonama:

| Kolona | Sadržaj |
|---|---|
| ID | stabilan, npr. `limit.pausal`; skill-ovi i skripte citiraju ID |
| Pravilo | jedna tvrdnja, rečima |
| Vrednost | mašinski čitljivo: ceo broj u parama ili baznim poenima, ili prazno |
| Period | obračunski prozor: `kalendarska-godina`, `klizecih-12-meseci`, `mesec`, `dogadjaj` |
| Važi za | status osiguranja, tip kupca, delatnost |
| Primena | od–do (datum primene, ne objave) |
| Izvor | propis, Sl. glasnik, član, URL |
| Status | `verified` / `unverified` / `disputed` |
| Provereno, Revizija | datum provere, `review_due` |

Istorijske i buduće verzije istog ID-ja su posebni redovi. U v1 ulaze samo redovi koje skill-ovi citiraju.

**Pravilo upotrebe:** za datum događaja i okolnosti korisnika mora postojati **tačno jedna** primenljiva verzija, sa statusom `verified`, izvorom i neisteklim `review_due`. U svakom drugom slučaju (nema reda, preklapanje, `disputed`, `unverified`, istekao) skill prikazuje NEPROVERENO i ne finalizuje fakturu, plaćanje ni prijavu. Izuzetak: `unverified` red koji opisuje praksu (primarni izvor ne postoji) prolazi kad korisnik donese odluku i upiše je u `Memory/odluke.md` sa oznakom `odluka:<id>`; skripta proverava oznaku pre nastavka. `disputed`, istekla revizija i nepostojeći red i dalje blokiraju. Skripte čitaju vrednosti isključivo iz `propisi.md` preko istog pravila, a uz svaki rezultat ispisuju ID. Poslovne prakse (npr. default rok plaćanja) su označene kao praksa, ne propis.

### Faktura

- **Obim v1:** samo B2B (pravno lice ili preduzetnik). Ako je kupac fizičko lice ili je fiskalizacija nejasna, skill staje i upućuje na fiskalni uređaj ili knjigovođu. SEF je van v1; kad je kupac javni sektor, skill staje sa upozorenjem.
- **Izrada:** generički HTML šablon (RSD, EUR, dvojezično) → PDF preko headless Chrome-a, jedna A4 strana.
- **Kurs:** srednji kurs NBS sa `https://webappcenter.nbs.rs/ExchangeRateWebApp/ExchangeRate/IndexByDate?isSearchExecuted=true&Date=DD.MM.YYYY&ExchangeRateListTypeID=3` (HTML proveren 2026-09-30; CSV/XML varijanta preko parametra `Format` proverava se pri implementaciji). Uz kurs se čuva broj kursne liste. Za neradni dan uzima se poslednji objavljeni kurs, a koji datum važi određuje red u `propisi.md`. Ako dohvatanje ne uspe, korisnik kurs unosi ručno. Neslužbeni izvori se ne koriste.
- **Životni ciklus:**
  - *Nacrt:* nosi predloženi sledeći broj i ne upisuje ništa u KPO.
  - *Pregled:* nacrt pregleda svež sub-agent bez konteksta sesije; unakrsni Claude↔Codex pregled je opcion.
  - *Nacrt ima identitet:* `nacrt_id` je hash sadržaja nacrta i čuva se uz nacrt i u KPO redu.
  - *Finalizacija:* eksplicitna, na zahtev korisnika, pod lock fajlom radnog prostora (ekskluzivno kreiranje), pa dve sesije ne mogu da dodele isti broj. Pod lock-om ponovo proverava da je broj i dalje sledeći; ako nije, nacrt se ponovo renderuje. Redosled: PDF pod konačnim imenom (privremeni fajl + preimenovanje), pa KPO (ceo CSV kroz privremeni fajl + preimenovanje). **KPO red je tačka commit-a:** faktura postoji tek kad postoji red.
  - *Oporavak:* PDF sa brojem bez KPO reda znači prekinutu finalizaciju. Skill to otkriva na početku i nudi da je završi ili poništi. Red sa istim `nacrt_id` već postoji → ne radi ništa (idempotentno).
  - *Ispravka:* izdata faktura se ne briše. Storno ostaje u KPO sa oznakom, a ispravka dobija novi broj.
- **Slanje:** ništa se ne šalje automatski.

### KPO

- `kpo-{godina}.csv` u radnom prostoru je evidencija. Sadrži pet propisanih kolona KPO-a, plus broj fakture, klijenta, valutu, iznos u valuti, kurs, rok, datum naplate, status i napomenu. PDF/XLSX za štampu pravi se na zahtev.
- Postojeće evidencije u drugom formatu prelaze kroz testiranu jednokratnu migraciju (vidi Migracija). Stara evidencija je često ručno vođena i nije ispravan CSV; tada se čita doslovno (navodnici su obični znaci, višak `;` pripada poslednjoj koloni, napomeni), uz upozorenje. Prvi podržan izvorni format je CSV sa `;` i kolonama `rb;broj_fakture;datum_izdavanja;datum_prometa;klijent;opis;iznos_eur;kurs_nbs;prihod_usluge_rsd;ukupno_rsd;rok_placanja;datum_naplate;napomena`. Mapiranje kolona je eksplicitno u skripti, a test koristi fiktivni fixture u tom formatu.

### Ostali skill-ovi

- **kpo:** kumulativ, limiti po svom periodu (kalendarska godina ili klizećih 12 meseci), upozorenje, projekcija, udeo po klijentu.
- **klijent:** podaci, test samostalnosti (udeo i dani se sabiraju za nalogodavca i povezana lica), klauzule i provera rizika postojećeg ugovora; bez generičkog ugovora.
- **naplata:** agent čita PDF/CSV izvod bilo koje banke; svako uparivanje potvrđuje korisnik.
- **obaveze:** `Memory/schedule.md`, provera na početku sesije, `.ics` za uvoz u kalendar, prenos na lični račun i šifre plaćanja.

### Migracija postojeće evidencije

Pre prve fakture kroz plugin:
- Sačuvaju se originali.
- Uvozi se istorija potrebna za limite i izveštaje: izdate fakture tekuće godine i klizećih 12 meseci, kao i otvorene fakture.
- Utvrđuje se sledeći broj fakture.
- Zbirovi se usaglašavaju sa starom evidencijom.

Dok istorija nije potpuna, izveštaji se označavaju kao nepotpuni. Prva faktura posle migracije radi se paralelno u starom i novom toku, a rezultati se porede.

### Privatnost u repou

- CI traži lične podatke po obrascu: JMBG i PIB sa kontrolnom cifrom, oblik računa i IBAN-a, e-mail adrese.
- Fiktivni podaci primer-agencije su na allowlisti i namerno imaju neispravnu kontrolnu cifru.
- Lista konkretnih ličnih vrednosti (denylist) nikad se ne commit-uje; postoji samo lokalno (pre-push hook, gitignored).
- Pre prve javne objave skenira se cela istorija.

### Kvalitet i objava

| Tema | Odluka |
|---|---|
| Kod | Node.js bez zavisnosti (`node:test`), novac u celim parama. |
| Testovi | Skripte za računicu sa testovima nad fixture `propisi.md` (granice limita, oba tipa perioda, izbor verzije po datumu, idempotentna finalizacija, ponovljen prekinut run). Test integriteta citata: svaki ID iz skill-a ili skripte postoji u `propisi.md`, i svaki red neko citira. |
| CI | Matrica ubuntu/macos/windows: testovi, provera sheme i `review_due`, citati, PII obrasci, podizanje verzije, init + PDF u folderu sa razmakom u putanji. Učitavanje plugin-a u oba klijenta (smoke test u Node-u, iz instalirane kopije, iz drugog radnog prostora) radi se lokalno pre release-a, jer CI nema prijavljene klijente. |
| Jezik | Srpska latinica za skill-ove, šablone i sajt; identifikatori bez dijakritika; README sa kratkim engleskim uvodom. |
| Održavanje propisa | Autor je CODEOWNER za `plugins/pausal/reference/`. PR-ovi zajednice samo uz primarni izvor. `propisi-revizija` ponovo proverava istekle redove. |
| Jednostavnost | `/ponytail:ponytail-audit` posle v1 i pre svakog release-a. |
| Objava | MIT + disclaimer (nije poreski ni pravni savet). GitHub Pages: jedan `docs/index.html`. CalVer `YYYY.M.N` (bez vodeće nule, da ostane validan semver) + CHANGELOG sa ID-jevima izmenjenih propisa. |

## Odbačene alternative

- **Plugin u postojećem privatnom `agent-skills` repou:** druga publika i životni ciklus; objava bi povukla i nepovezane plugin-e.
- **GitHub template repo (sam ili uz plugin):** korisnikove kopije pravila se zamrznu kad se propisi promene; template i plugin se razilaze.
- **Brojevi u svakom skill-u / bez brojeva u repou:** prvo se razilazi, drugo zavisi od web pristupa u svakom koraku.
- **YAML propisi + generisan markdown:** build korak bez potrebe u v1; kolone Vrednost i Period daju mašinsku čitljivost u markdown-u.
- **Adapteri po banci, Apple Mail, Google Sheets, time tracking u v1:** vezuju repo za jednog korisnika; ostaju TODO.
- **B2C fakture i fiskalizacija u v1:** fiskalni uređaj je poseban proces sa spoljnim servisima.
- **CLAUDE.md sa `@AGENTS.md` u radnom prostoru:** odbačeno; oslanjamo se na čitanje AGENTS.md u Claude Code-u i to navodimo u README-u.
- **Osam uskih skill-ova:** test samostalnosti ide uz klijenta, prenos uz obaveze, KPO red uz fakturu.
- **Python ili shell za skripte:** Python često nije na Windows-u; novac u awk-u je rizičan.
- **Commit-ovana lista ličnih vrednosti za PII proveru:** objavila bi upravo podatke koje štiti.
- **SOAP servis NBS-a:** traži članstvo i licencu, pa ne odgovara javnom plugin-u bez podešavanja.

## Posledice

- Tačnost zavisi od redovne revizije `propisi.md`; bez nje skill-ovi sve češće prikazuju NEPROVERENO umesto da greše tiho.
- Korisnik mora da ima Node.js i Chrome za fakture i skripte.
- Paušalci koji prodaju fizičkim licima u v1 dobijaju KPO, limite i obaveze, ali ne i fakture.
- Adapteri, SEF i fiskalizacija traže nove odluke kad dođu na red.
- Radni prostor ne zavisi od gita, pa backup i privatnost ostaju na korisniku; init to kaže izričito.
