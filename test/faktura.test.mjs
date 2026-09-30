import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { izracunaj, proveriNacrt, nacrtId, renderuj, napraviNacrt, finalizujNacrt, oporavak, proveriPravila } from '../plugins/pausal/scripts/faktura.mjs';
import { parsiraj } from '../plugins/pausal/scripts/propisi.mjs';
import { ucitaj } from '../plugins/pausal/scripts/kpo.mjs';
const agencija = JSON.parse(readFileSync(new URL('./fixtures/agencija.json', import.meta.url), 'utf8'));

const sablon = new URL('../plugins/pausal/template/Sabloni/faktura.html', import.meta.url);

const nacrt = () => ({
  broj: '2026-1',
  datum_izdavanja: '2026-10-05',
  datum_prometa: '2026-09-30',
  rok_placanja: '2026-11-04',
  mesto_izdavanja: 'Novi Sad',
  valuta: 'EUR',
  kurs: '117.5386',
  kursna_lista: '185',
  jezik: 'sr-en',
  klijent: 'primer-gmbh',
  kupac: { naziv: 'Primer GmbH', adresa: 'Musterstraße 1', mesto: '10115 Berlin', drzava: 'Nemačka', vat_id: 'DE000000000', tip: 'b2b' },
  stavke: [
    { opis: 'Razvoj softvera <septembar>', kolicina: '160', jedinica: 'h', cena: '25,00' },
    { opis: 'Konsultacije', kolicina: '2,5', jedinica: 'h', cena: '40,00' },
  ],
  napomene: ['Obveznik nije u sistemu PDV-a.'],
});

test('izracunaj: količina × cena u parama, EUR → RSD po kursu', () => {
  const r = izracunaj(nacrt());
  assert.deepEqual(r.stavke.map((s) => s.iznos), [400000, 10000]);
  assert.equal(r.ukupno, 410000);
  // 4.100,00 × 117,5386 = 481.908,26
  assert.equal(r.ukupnoRsd, 48190826);
});

test('proveriNacrt: samo B2B, datumi, kurs za devize, broj', () => {
  assert.deepEqual(proveriNacrt(nacrt()), []);
  const lose = (izmena) => proveriNacrt({ ...nacrt(), ...izmena }).join(' ');
  assert.match(lose({ kupac: { ...nacrt().kupac, tip: 'b2c' } }), /fiskaliz/);
  assert.match(lose({ kupac: { ...nacrt().kupac, tip: 'b2g' } }), /SEF/);
  assert.match(lose({ rok_placanja: '2026-10-01' }), /rok_placanja/);
  assert.match(lose({ kurs: '' }), /kurs/);
  assert.match(lose({ broj: '2026-01' }), /broj/);
  assert.match(lose({ stavke: [] }), /stavk/);
});

test('nacrtId je stabilan i menja se sa sadržajem', () => {
  assert.equal(nacrtId(nacrt()), nacrtId(nacrt()));
  assert.notEqual(nacrtId(nacrt()), nacrtId({ ...nacrt(), broj: '2026-2' }));
});

test('renderuj escapuje HTML, prikazuje iznose u srpskom formatu i nacrt_id', () => {
  const html = renderuj(readFileSync(sablon, 'utf8'), nacrt(), agencija);
  assert.ok(html.includes('Razvoj softvera &lt;septembar&gt;'));
  assert.ok(html.includes('4.100,00'));
  assert.ok(html.includes('481.908,26'));
  assert.ok(html.includes('Faktura / Invoice'));
  assert.ok(html.includes(agencija.poslovno_ime));
  assert.ok(html.includes(`name="nacrt-id" content="${nacrtId(nacrt())}"`));
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(html), 'ostao nepopunjen placeholder');
});

function radniProstor() {
  const ws = mkdtempSync(join(tmpdir(), 'radni prostor '));
  mkdirSync(join(ws, 'Sabloni'));
  copyFileSync(sablon, join(ws, 'Sabloni', 'faktura.html'));
  writeFileSync(join(ws, 'agencija.json'), JSON.stringify(agencija));
  mkdirSync(join(ws, 'Memory'));
  writeFileSync(join(ws, 'Memory', 'odluke.md'), '## Kurs\n\nodluka:kpo.kurs-datum — kurs na dan izdavanja, po savetu knjigovođe.\n');
  return ws;
}

const lazniPdf = (html, pdf) => writeFileSync(pdf, `%PDF ${html.length}`);

test('nacrt → finalizacija: PDF pod konačnim imenom, jedan KPO red, ponavljanje ne duplira', () => {
  const ws = radniProstor();
  const n = napraviNacrt(ws, nacrt(), { pdf: lazniPdf });
  assert.ok(existsSync(n.pdf) && n.pdf.includes(join('Fakture', 'nacrti')));
  assert.equal(finalizujNacrt(ws, nacrt()).status, 'upisano');
  assert.equal(finalizujNacrt(ws, nacrt()).status, 'postoji');
  const konacni = join(ws, 'Finansije', 'Fakture', 'faktura-2026-1-primer-gmbh.pdf');
  assert.ok(existsSync(konacni));
  assert.ok(!existsSync(n.pdf));
  const kpo = ucitaj(join(ws, 'Finansije', 'KPO', 'kpo-2026.csv'));
  assert.equal(kpo.length, 1);
  assert.equal(kpo[0].ukupno_rsd, '481908.26');
  assert.equal(kpo[0].prihod_usluge_rsd, '481908.26');
  assert.equal(kpo[0].nacrt_id, nacrtId(nacrt()));
});

test('finalizacija odbija nacrt koji je promenjen posle renderovanja', () => {
  const ws = radniProstor();
  napraviNacrt(ws, nacrt(), { pdf: lazniPdf });
  const izmenjen = { ...nacrt(), rok_placanja: '2026-11-05' };
  assert.throws(() => finalizujNacrt(ws, izmenjen), /nacrt/);
  assert.ok(!existsSync(join(ws, 'Finansije', 'KPO', 'kpo-2026.csv')));
});

test('oporavak nalazi PDF bez KPO reda (prekinuta finalizacija)', () => {
  const ws = radniProstor();
  mkdirSync(join(ws, 'Finansije', 'Fakture'), { recursive: true });
  writeFileSync(join(ws, 'Finansije', 'Fakture', 'faktura-2026-7-neko.pdf'), '%PDF');
  assert.deepEqual(oporavak(ws).map((o) => o.broj), ['2026-7']);
});

test('devizna faktura bez odluke za neproveren propis se ne pravi', () => {
  const ws = radniProstor();
  writeFileSync(join(ws, 'Memory', 'odluke.md'), '');
  assert.throws(() => napraviNacrt(ws, nacrt(), { pdf: lazniPdf }), /odluka:kpo.kurs-datum/);
});

test('neuspelo ponovno renderovanje ne ostavlja stari PDF koji može da se finalizuje', () => {
  const ws = radniProstor();
  napraviNacrt(ws, nacrt(), { pdf: lazniPdf });
  const skuplji = { ...nacrt(), stavke: [{ ...nacrt().stavke[0], cena: '900,00' }] };
  assert.throws(() => napraviNacrt(ws, skuplji, { pdf: () => { throw new Error('Chrome pao'); } }), /Chrome/);
  assert.throws(() => finalizujNacrt(ws, skuplji), /nacrt ne postoji/);
  assert.throws(() => finalizujNacrt(ws, nacrt()), /nacrt ne postoji/);
});

test('posle prekinutog upisa KPO-a ponovljena finalizacija završava posao', () => {
  const ws = radniProstor();
  napraviNacrt(ws, nacrt(), { pdf: lazniPdf });
  mkdirSync(join(ws, 'Finansije', 'KPO'), { recursive: true });
  const blokada = join(ws, 'Finansije', 'KPO', 'kpo-2026.csv.tmp');
  mkdirSync(blokada);
  assert.throws(() => finalizujNacrt(ws, nacrt()));
  assert.deepEqual(oporavak(ws).map((o) => o.broj), ['2026-1']);
  rmSync(blokada, { recursive: true });
  assert.equal(finalizujNacrt(ws, nacrt()).status, 'upisano');
  assert.deepEqual(oporavak(ws), []);
});

test('devizna faktura traži devizni račun; negativna cena ide preko storna', () => {
  const ws = radniProstor();
  writeFileSync(join(ws, 'agencija.json'), JSON.stringify({ ...agencija, racuni: agencija.racuni.filter((r) => r.valuta === 'RSD') }));
  assert.throws(() => napraviNacrt(ws, nacrt(), { pdf: lazniPdf }), /EUR račun/);
  assert.match(proveriNacrt({ ...nacrt(), stavke: [{ opis: 'x', kolicina: '1', cena: '-5,00' }] }).join(' '), /pozitivne/);
});

test('nov radni prostor iz template-a nema unapred donetu odluku o kursu', async () => {
  const { napravi } = await import('../plugins/pausal/scripts/init.mjs');
  const ws = join(mkdtempSync(join(tmpdir(), 'nov ')), 'agencija');
  napravi(ws);
  writeFileSync(join(ws, 'agencija.json'), JSON.stringify(agencija));
  assert.throws(() => napraviNacrt(ws, nacrt(), { pdf: lazniPdf }), /odluka:kpo.kurs-datum/);
});

test('oporavak A ne premešta fajlove novog nacrta B, a B ne prepisuje nezavršenu finalizaciju A', () => {
  const ws = radniProstor();
  const A = nacrt();
  const B = { ...nacrt(), stavke: [{ ...nacrt().stavke[0], cena: '50,00' }] };
  napraviNacrt(ws, A, { pdf: lazniPdf });
  mkdirSync(join(ws, 'Finansije', 'KPO'), { recursive: true });
  const blokada = join(ws, 'Finansije', 'KPO', 'kpo-2026.csv.tmp');
  mkdirSync(blokada);
  assert.throws(() => finalizujNacrt(ws, A));
  rmSync(blokada, { recursive: true });
  napraviNacrt(ws, B, { pdf: lazniPdf });
  assert.throws(() => finalizujNacrt(ws, B), /nezavršena finalizacija/);
  assert.equal(finalizujNacrt(ws, A).status, 'upisano');
  const konacni = readFileSync(join(ws, 'Finansije', 'Fakture', 'faktura-2026-1-primer-gmbh.html'), 'utf8');
  assert.ok(konacni.includes(nacrtId(A)));
  assert.ok(existsSync(join(ws, 'Finansije', 'Fakture', 'nacrti', 'faktura-2026-1-primer-gmbh.pdf')), 'B ostaje u nacrtima');
});

test('odluka ne važi za neproveren red čija je revizija istekla; ukupan iznos ima gornju granicu', () => {
  const ws = radniProstor();
  const propisi = parsiraj(`| ID | Pravilo | Vrednost | Period | Važi za | Primena od | Primena do | Izvor | Status | Provereno | Revizija |
|---|---|---|---|---|---|---|---|---|---|---|
| kpo.kurs-datum | x | | dogadjaj | svi | 2026-01-01 | | nije pronađen | unverified | 2026-01-01 | 2026-02-01 |
`);
  assert.throws(() => proveriPravila(ws, nacrt(), propisi), /odluka:kpo.kurs-datum/);
  const velika = { ...nacrt(), stavke: Array.from({ length: 101 }, () => ({ opis: 'x', kolicina: '99.999', cena: '999.999.999,99' })) };
  assert.throws(() => izracunaj(velika), /prevelik/);
});
