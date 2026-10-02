// Nacrt fakture (JSON) → HTML i PDF u Finansije/Fakture/nacrti/, pa finalizacija:
// PDF pod konačnim imenom i KPO red, pod KPO lock-om. Računicu radi skripta, ne agent.
// V1 izdaje samo B2B fakture: za B2C važi propis:fiskalizacija.b2c, a za javni sektor propis:sef.b2g.
//
// CLI (radni prostor je folder sa agencija.json):
//   node faktura.mjs nacrt <radni-prostor> <nacrt.json>
//   node faktura.mjs finalizuj <radni-prostor> <nacrt.json>
//   node faktura.mjs oporavak <radni-prostor>
//   node faktura.mjs storniraj <radni-prostor> <broj> <razlog>
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { uPare, izPara, formatRsd, preracunaj } from './novac.mjs';
import { finalizuj, storniraj, ucitaj } from './kpo.mjs';
import { proveriAgenciju } from './agencija.mjs';
import { izaberi, parsiraj, danasLokalno, PUTANJA } from './propisi.mjs';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function izracunaj(n) {
  const stavke = n.stavke.map((s) => {
    const kolicina = uPare(s.kolicina); // u stotinkama
    const cena = uPare(s.cena);
    if (!Number.isSafeInteger(kolicina * cena)) throw new Error(`stavka ${s.opis}: iznos prevelik`);
    return { ...s, iznos: Math.round((kolicina * cena) / 100) };
  });
  const ukupno = stavke.reduce((z, s) => z + s.iznos, 0);
  if (!Number.isSafeInteger(ukupno)) throw new Error('ukupan iznos fakture je prevelik');
  const ukupnoRsd = n.valuta === 'RSD' ? ukupno : preracunaj(ukupno, n.kurs);
  return { stavke, ukupno, ukupnoRsd };
}

export function proveriNacrt(n) {
  const g = [];
  if (!/^\d{4}-[1-9]\d*$/.test(n.broj ?? '')) g.push('broj mora biti GODINA-INDEKS bez vodećih nula (npr. 2026-1)');
  for (const k of ['datum_izdavanja', 'datum_prometa', 'rok_placanja']) if (!ISO.test(n[k] ?? '')) g.push(`${k} mora biti YYYY-MM-DD`);
  if (n.broj && n.datum_izdavanja && !n.broj.startsWith(n.datum_izdavanja.slice(0, 4))) g.push('broj mora počinjati godinom izdavanja');
  if (n.rok_placanja && n.datum_izdavanja && !(n.rok_placanja > n.datum_izdavanja)) g.push('rok_placanja mora biti posle datuma izdavanja');
  if (!/^[a-z0-9-]+$/.test(n.klijent ?? '')) g.push('klijent mora biti slug (mala slova, cifre, crtice)');
  if (!['sr', 'sr-en'].includes(n.jezik)) g.push('jezik mora biti sr ili sr-en');
  if (!/^[A-Z]{3}$/.test(n.valuta ?? '')) g.push('valuta mora biti troslovna oznaka (RSD, EUR)');
  if (n.valuta && n.valuta !== 'RSD' && (!/^\d+(\.\d{1,4})?$/.test(n.kurs ?? '') || !n.kursna_lista)) g.push('devizna faktura traži kurs (npr. 117.5386) i broj kursne liste');
  if (n.placanje !== undefined && !(n.placanje === 'RSD' && n.valuta !== 'RSD')) g.push('placanje može biti samo RSD, uz cenu u stranoj valuti (valutna klauzula)');
  const k = n.kupac ?? {};
  if (k.tip === 'b2c') g.push('kupac je fizičko lice: potreban je fiskalni račun (propis:fiskalizacija.b2c); v1 ne izdaje B2C fakture');
  else if (k.tip === 'b2g') g.push('kupac je javni sektor: faktura ide preko SEF-a (propis:sef.b2g); v1 ne izdaje B2G fakture');
  else if (k.tip !== 'b2b') g.push('kupac.tip mora biti b2b');
  for (const p of ['naziv', 'adresa', 'mesto']) if (!k[p]) g.push(`kupac.${p} nedostaje`);
  if (!k.pib && !k.vat_id) g.push('kupac traži pib (domaći) ili vat_id (strani)');
  if (!Array.isArray(n.stavke) || n.stavke.length === 0) g.push('faktura mora imati bar jednu stavku');
  else n.stavke.forEach((s, i) => {
    if (!s.opis) g.push(`stavka ${i + 1}: nedostaje opis`);
    try {
      if (uPare(s.kolicina) <= 0 || uPare(s.cena) <= 0) g.push(`stavka ${i + 1}: količina i cena moraju biti pozitivne (storno ide preko storniraj)`);
    } catch (e) { g.push(`stavka ${i + 1}: ${e.message}`); }
  });
  return g;
}

function sortirano(v) {
  if (Array.isArray(v)) return v.map(sortirano);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortirano(v[k])]));
  return v;
}

export function nacrtId(n) {
  return createHash('sha256').update(JSON.stringify(sortirano(n))).digest('hex').slice(0, 16);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const datum = (iso) => iso.split('-').reverse().join('.');
const redovi = (parovi) => parovi.filter(([, v]) => v).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');

export function renderuj(sablon, n, a) {
  const L = (sr, en) => (n.jezik === 'sr-en' ? `${sr} / ${en}` : sr);
  const { stavke, ukupno, ukupnoRsd } = izracunaj(n);
  const k = n.kupac;
  const rsdRacun = a.racuni.find((r) => r.valuta === 'RSD');
  const klauzula = n.placanje === 'RSD';
  const devizni = !klauzula && a.racuni.find((r) => r.valuta === n.valuta && n.valuta !== 'RSD');
  const kurs = n.kurs?.replace('.', ',');
  const blokovi = {
    NACRT_ID: nacrtId(n),
    NASLOV: L('Faktura', 'Invoice'),
    BROJ_LABELA: L('Broj', 'No.'),
    BROJ: n.broj,
    IZDAVALAC: [
      `<div class="name">${esc(a.poslovno_ime)}</div>`,
      `<div>${esc(a.adresa)}, ${esc(a.mesto)}</div>`,
      `<div>${L('PIB', 'Tax ID')} ${esc(a.pib)} · ${L('MB', 'Reg. No.')} ${esc(a.mb)}</div>`,
      `<div class="muted">${esc([a.email, a.telefon].filter(Boolean).join(' · '))}</div>`,
    ].join(''),
    KUPAC_LABELA: L('Kupac', 'Bill to'),
    KUPAC: [
      `<div class="name">${esc(k.naziv)}</div>`,
      `<div>${esc(k.adresa)}</div>`,
      `<div>${esc([k.mesto, k.drzava].filter(Boolean).join(', '))}</div>`,
      k.pib ? `<div>PIB ${esc(k.pib)}${k.mb ? ` · MB ${esc(k.mb)}` : ''}</div>` : '',
      k.vat_id ? `<div>VAT ID ${esc(k.vat_id)}</div>` : '',
    ].join(''),
    META: redovi([
      [L('Datum izdavanja', 'Issue date'), datum(n.datum_izdavanja)],
      [L('Datum prometa', 'Date of supply'), datum(n.datum_prometa)],
      [L('Mesto izdavanja', 'Place of issue'), n.mesto_izdavanja],
      [L('Rok plaćanja', 'Due date'), datum(n.rok_placanja)],
      [L('Poziv na broj', 'Reference'), n.broj],
    ]),
    STAVKE_ZAGLAVLJE: `<tr><th>${L('Opis', 'Description')}</th><th class="num">${L('Kol.', 'Qty')}</th><th>${L('Jed.', 'Unit')}</th><th class="num">${L('Cena', 'Price')} (${n.valuta})</th><th class="num">${L('Iznos', 'Amount')} (${n.valuta})</th></tr>`,
    STAVKE: stavke.map((s) => `<tr><td>${esc(s.opis)}</td><td class="num">${formatRsd(uPare(s.kolicina)).replace(/,00$/, '')}</td><td>${esc(s.jedinica)}</td><td class="num">${formatRsd(uPare(s.cena))}</td><td class="num">${formatRsd(s.iznos)}</td></tr>`).join(''),
    UKUPNO: [
      klauzula ? `<tr><td>${L('Ukupno', 'Total')} ${n.valuta}</td><td class="num">${formatRsd(ukupno)}</td></tr>` : '',
      n.valuta !== 'RSD' ? `<tr><td>${L('Srednji kurs NBS', 'NBS middle rate')} (${L('lista', 'list')} ${esc(n.kursna_lista)})</td><td class="num">${esc(kurs)}</td></tr>` : '',
      n.valuta !== 'RSD' && !klauzula ? `<tr><td>${L('Protivvrednost', 'Equivalent')} RSD</td><td class="num">${formatRsd(ukupnoRsd)}</td></tr>` : '',
      `<tr class="grand"><td>${L('Ukupno za plaćanje', 'Total due')} ${klauzula ? 'RSD' : n.valuta}</td><td class="num">${formatRsd(klauzula ? ukupnoRsd : ukupno)}</td></tr>`,
    ].join(''),
    NAPOMENE: (n.napomene ?? []).map((t) => `<p>${esc(t)}</p>`).join(''),
    PLACANJE: [
      klauzula ? `<p><strong>${L('Valutna klauzula', 'Currency clause')}:</strong> ${esc(L(
        `cena je iskazana u ${n.valuta}; plaćanje u RSD po srednjem kursu NBS, 1 ${n.valuta} = ${kurs} RSD (kursna lista br. ${n.kursna_lista}).`,
        `prices are stated in ${n.valuta}; payment in RSD at the NBS middle rate, 1 ${n.valuta} = ${kurs} RSD (rate list no. ${n.kursna_lista}).`,
      ))}</p>` : '',
      devizni
        ? `<p><strong>${L('Plaćanje', 'Payment')}:</strong> IBAN ${esc(devizni.iban)} · SWIFT ${esc(devizni.swift)} · ${esc(devizni.banka)}</p>`
        : `<p><strong>${L('Plaćanje na račun', 'Pay to account')}:</strong> ${esc(rsdRacun?.broj)} · ${esc(rsdRacun?.banka)}</p>`,
    ].join(''),
    PODNOZJE: esc([a.naziv, a.email, a.telefon].filter(Boolean).join(' · ')),
  };
  return sablon.replace(/\{\{([A-Z_]+)\}\}/g, (m, kljuc) => {
    if (!(kljuc in blokovi)) throw new Error(`nepoznat placeholder ${m} u šablonu`);
    return blokovi[kljuc];
  });
}

export function nadjiChrome() {
  const kandidati = [
    process.env.CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  return kandidati.find((p) => p && existsSync(p));
}

function chrome() {
  const c = nadjiChrome();
  if (!c) throw new Error('Chrome nije pronađen; postavi promenljivu CHROME na putanju do Chrome-a');
  return c;
}

export function chromePdf(htmlPutanja, pdfPutanja) {
  const r = spawnSync(chrome(), ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfPutanja}`, pathToFileURL(htmlPutanja).href], { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(pdfPutanja)) throw new Error(`Chrome nije napravio PDF: ${(r.stderr ?? '').slice(-500)}`);
  // Broji objekte /Type /Page; [^s] isključuje koren stabla /Pages.
  const strane = (readFileSync(pdfPutanja, 'latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  if (strane !== 1) throw new Error(`faktura ima ${strane} strana; mora stati na jednu A4 stranu`);
}

const putanje = (ws, n) => {
  const ime = `faktura-${n.broj}-${n.klijent}`;
  const nacrti = join(ws, 'Finansije', 'Fakture', 'nacrti');
  const fakture = join(ws, 'Finansije', 'Fakture');
  return {
    nacrti, fakture,
    nacrt: { html: join(nacrti, `${ime}.html`), pdf: join(nacrti, `${ime}.pdf`), json: join(nacrti, `${ime}.json`) },
    konacno: { html: join(fakture, `${ime}.html`), pdf: join(fakture, `${ime}.pdf`), json: join(fakture, `${ime}.json`) },
    kpo: join(ws, 'Finansije', 'KPO', `kpo-${n.datum_izdavanja.slice(0, 4)}.csv`),
  };
};

function agencija(ws, n) {
  const a = JSON.parse(readFileSync(join(ws, 'agencija.json'), 'utf8'));
  const { greske, upozorenja } = proveriAgenciju(a);
  if (greske.length) throw new Error(`agencija.json: ${greske.join('; ')}`);
  if (n.valuta !== 'RSD' && n.placanje !== 'RSD' && !a.racuni.some((r) => r.valuta === n.valuta)) throw new Error(`agencija.json nema ${n.valuta} račun; kupac ne bi imao gde da plati`);
  return { a, upozorenja };
}

// Pravilo koje nije provereno, a opisuje praksu, prolazi samo uz odluku korisnika
// označenu sa odluka:<id> u Memory/odluke.md; disputed, istekla revizija i nepostojeći red blokiraju.
export function proveriPravila(ws, n, propisi = parsiraj(readFileSync(PUTANJA, 'utf8'))) {
  const potrebna = n.valuta !== 'RSD' ? ['propis:kpo.kurs-datum'] : [];
  const odlukePut = join(ws, 'Memory', 'odluke.md');
  const odluke = existsSync(odlukePut) ? readFileSync(odlukePut, 'utf8') : '';
  const napomene = [];
  for (const citat of potrebna) {
    const r = izaberi(propisi, citat, { datum: n.datum_izdavanja, danas: danasLokalno(), okolnosti: { kupac: n.kupac?.tip } });
    if (r.status === 'ok') continue;
    const istekao = r.red?.revizija && !(r.red.revizija > danasLokalno());
    if (r.red?.status === 'unverified' && !istekao && odluke.includes(`odluka:${r.id}`)) { napomene.push(`${citat}: NEPROVERENO, primenjena odluka iz odluke.md`); continue; }
    throw new Error(`${citat} je NEPROVERENO (${r.razlog}); potrebna je odluka korisnika u Memory/odluke.md sa oznakom odluka:${r.id}`);
  }
  return napomene;
}

// HTML sa nacrt-id dobija konačno ime poslednji, tek kad PDF prođe proveru; tako stari PDF
// nikad ne ostaje uz nov sadržaj.
export function napraviNacrt(ws, n, { pdf = chromePdf, propisi } = {}) {
  const greske = proveriNacrt(n);
  if (greske.length) throw new Error(`nacrt nije ispravan: ${greske.join('; ')}`);
  const { a, upozorenja } = agencija(ws, n);
  const napomene = proveriPravila(ws, n, propisi);
  const p = putanje(ws, n);
  mkdirSync(p.nacrti, { recursive: true });
  for (const f of [p.nacrt.html, p.nacrt.pdf]) rmSync(f, { force: true });
  writeFileSync(p.nacrt.json, JSON.stringify(n, null, 2) + '\n');
  const tmpHtml = p.nacrt.html.replace(/\.html$/, '.tmp.html');
  const tmpPdf = p.nacrt.pdf.replace(/\.pdf$/, '.tmp.pdf');
  try {
    writeFileSync(tmpHtml, renderuj(readFileSync(join(ws, 'Sabloni', 'faktura.html'), 'utf8'), n, a));
    pdf(tmpHtml, tmpPdf);
    renameSync(tmpPdf, p.nacrt.pdf);
    renameSync(tmpHtml, p.nacrt.html);
  } finally {
    for (const f of [tmpHtml, tmpPdf]) rmSync(f, { force: true });
  }
  const { ukupno, ukupnoRsd } = izracunaj(n);
  return { nacrt_id: nacrtId(n), html: p.nacrt.html, pdf: p.nacrt.pdf, ukupno: izPara(ukupno), ukupnoRsd: izPara(ukupnoRsd), upozorenja, napomene };
}

// Artefakti mogu biti u nacrti/ ili, posle prekinute finalizacije, već u Fakture/;
// ponovljen poziv tada samo upisuje KPO red.
export function finalizujNacrt(ws, n, { propisi } = {}) {
  const id = nacrtId(n);
  const p = putanje(ws, n);
  if (ucitaj(p.kpo).some((r) => r.nacrt_id === id)) return { status: 'postoji' };
  // Jedan dosledan skup: HTML sa ovim nacrt-id i PDF na istom mestu. Tuđi fajlovi u Fakture/
  // (prekinuta finalizacija drugog nacrta) se nikad ne prepisuju.
  const imaId = (f) => existsSync(f) && readFileSync(f, 'utf8').includes(`name="nacrt-id" content="${id}"`);
  const uFakturama = imaId(p.konacno.html) && existsSync(p.konacno.pdf);
  const uNacrtima = imaId(p.nacrt.html) && existsSync(p.nacrt.pdf);
  if (!uFakturama && !uNacrtima) throw new Error('nacrt ne postoji ili je promenjen posle renderovanja; napravi nacrt ponovo i ponovi pregled');
  if (!uFakturama && (existsSync(p.konacno.html) || existsSync(p.konacno.pdf))) {
    throw new Error(`u Finansije/Fakture/ je nezavršena finalizacija drugog nacrta za ${n.broj}; prvo pokreni oporavak`);
  }
  proveriPravila(ws, n, propisi);
  const { stavke, ukupno, ukupnoRsd } = izracunaj(n);
  const proizvodi = stavke.filter((s) => s.vrsta === 'proizvod').reduce((z, s) => z + s.iznos, 0);
  const proizvodiRsd = n.valuta === 'RSD' ? proizvodi : preracunaj(proizvodi, n.kurs);
  const red = {
    broj_fakture: n.broj, datum_izdavanja: n.datum_izdavanja, datum_prometa: n.datum_prometa,
    klijent: n.klijent, opis: stavke.map((s) => s.opis).join('; '),
    valuta: n.valuta, iznos_valuta: izPara(ukupno), kurs_nbs: n.kurs ?? '', kursna_lista: n.kursna_lista ?? '',
    prihod_proizvodi_rsd: izPara(proizvodiRsd), prihod_usluge_rsd: izPara(ukupnoRsd - proizvodiRsd), ukupno_rsd: izPara(ukupnoRsd),
    rok_placanja: n.rok_placanja, datum_naplate: '', status: 'izdata', nacrt_id: id, napomena: n.placanje === 'RSD' ? 'valutna klauzula, plaćanje u RSD' : '',
  };
  mkdirSync(join(ws, 'Finansije', 'KPO'), { recursive: true });
  return finalizuj(p.kpo, red, () => {
    if (!uFakturama) for (const k of ['pdf', 'html', 'json']) if (existsSync(p.nacrt[k])) renameSync(p.nacrt[k], p.konacno[k]);
  });
}

export function oporavak(ws) {
  const fakture = join(ws, 'Finansije', 'Fakture');
  if (!existsSync(fakture)) return [];
  return readdirSync(fakture)
    .map((f) => f.match(/^faktura-(\d{4})-(\d+)-.*\.pdf$/))
    .filter(Boolean)
    .map((m) => ({ broj: `${m[1]}-${m[2]}`, pdf: join(fakture, m[0]), kpo: join(ws, 'Finansije', 'KPO', `kpo-${m[1]}.csv`) }))
    .filter((o) => !ucitaj(o.kpo).some((r) => r.broj_fakture === o.broj));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [komanda, ws, arg, razlog] = process.argv.slice(2);
  const citaj = () => JSON.parse(readFileSync(arg, 'utf8'));
  try {
    const rezultat =
      komanda === 'nacrt' ? napraviNacrt(ws, citaj()) :
      komanda === 'finalizuj' ? finalizujNacrt(ws, citaj()) :
      komanda === 'oporavak' ? oporavak(ws) :
      komanda === 'storniraj' ? storniraj(join(ws, 'Finansije', 'KPO', `kpo-${arg.slice(0, 4)}.csv`), arg, razlog) :
      (() => { throw new Error('komanda: nacrt | finalizuj | oporavak | storniraj'); })();
    console.log(JSON.stringify(rezultat, null, 2));
  } catch (e) {
    console.error(`faktura: ${e.message}`);
    process.exitCode = 1;
  }
}
