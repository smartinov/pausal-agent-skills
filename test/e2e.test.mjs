// Ceo mesec fiktivne agencije kroz CLI skripte, sa pravim Chrome-om; preskače se bez Chrome-a.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nadjiChrome } from '../plugins/pausal/scripts/faktura.mjs';

const S = fileURLToPath(new URL('../plugins/pausal/scripts/', import.meta.url));
const imaChrome = Boolean(nadjiChrome());

function node(skripta, ...args) {
  const r = spawnSync(process.execPath, [join(S, skripta), ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${skripta} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

// CI postavlja PAUSAL_CHROME_OBAVEZAN, pa nedostatak Chrome-a tamo ruši test umesto da ga preskoči.
const preskoci = !imaChrome && !process.env.PAUSAL_CHROME_OBAVEZAN && 'Chrome nije instaliran';

test('init → faktura → KPO → limiti → naplata → kalendar → izvoz', { skip: preskoci }, () => {
  assert.ok(imaChrome, 'Chrome nije pronađen; postavi CHROME');
  const ws = join(mkdtempSync(join(tmpdir(), 'pausal e2e ')), 'moja agencija');
  assert.equal(node('init.mjs', 'napravi', ws).ok, true);
  copyFileSync(fileURLToPath(new URL('./fixtures/agencija.json', import.meta.url)), join(ws, 'agencija.json'));
  node('agencija.mjs', join(ws, 'agencija.json'));
  writeFileSync(join(ws, 'Memory', 'odluke.md'), 'odluka:kpo.kurs-datum — kurs na dan izdavanja.\n');

  const kpo = join(ws, 'Finansije', 'KPO', 'kpo-2026.csv');
  assert.equal(node('kpo.mjs', 'sledeci', kpo, '2026').broj, '2026-1');
  const nacrt = join(ws, 'Finansije', 'Fakture', 'nacrt.json');
  writeFileSync(nacrt, JSON.stringify({
    broj: '2026-1', datum_izdavanja: '2026-10-05', datum_prometa: '2026-09-30', rok_placanja: '2026-11-04',
    mesto_izdavanja: 'Novi Sad', valuta: 'EUR', kurs: '117.5386', kursna_lista: '185', jezik: 'sr-en', klijent: 'primer-gmbh',
    kupac: { naziv: 'Primer GmbH', adresa: 'Musterstraße 1', mesto: '10115 Berlin', drzava: 'Nemačka', vat_id: 'DE000000000', tip: 'b2b' },
    stavke: [{ opis: 'Razvoj softvera, septembar 2026', kolicina: '160', jedinica: 'h', cena: '25,00', vrsta: 'usluga' }],
    napomene: ['Obveznik nije u sistemu PDV-a.'],
  }));
  const n = node('faktura.mjs', 'nacrt', ws, nacrt);
  assert.equal(n.ukupnoRsd, '470154.40');
  assert.ok(readFileSync(n.pdf).subarray(0, 4).toString() === '%PDF');
  const nacrtJson = n.pdf.replace(/\.pdf$/, '.json');
  assert.equal(node('faktura.mjs', 'finalizuj', ws, nacrtJson).status, 'upisano');
  assert.ok(existsSync(join(ws, 'Finansije', 'Fakture', 'faktura-2026-1-primer-gmbh.pdf')));
  assert.deepEqual(node('faktura.mjs', 'oporavak', ws), []);

  const stanje = node('limiti.mjs', kpo, '--danas=2026-10-06');
  assert.equal(stanje.pausal.promet, 47015440);
  assert.equal(stanje.pausal.status, 'ok');

  assert.equal(node('kpo.mjs', 'naplata', kpo, '2026-1', '2026-10-20').status, 'naplaceno');
  const kal = node('ics.mjs', join(ws, 'agencija.json'), '2027', join(ws, 'rokovi-2027.ics'));
  assert.ok(kal.lista.length >= 12);
  assert.ok(readFileSync(join(ws, 'rokovi-2027.ics'), 'utf8').startsWith('BEGIN:VCALENDAR'));
  node('kpo.mjs', 'izvoz', kpo, join(ws, 'Finansije', 'KPO', 'kpo-2026.html'));
  assert.ok(readFileSync(join(ws, 'Finansije', 'KPO', 'kpo-2026.html'), 'utf8').includes('470.154,40'));
});
