import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migriraj, prevedi } from '../plugins/pausal/scripts/migracija.mjs';
import { ucitaj, sledeciBroj } from '../plugins/pausal/scripts/kpo.mjs';

const stari = new URL('./fixtures/kpo-stari-format.csv', import.meta.url);

test('prevedi mapira stari format bez gubitka: datumi, decimale, valuta, napomena', () => {
  const { redovi, upozorenja } = prevedi(readFileSync(stari, 'utf8'));
  assert.equal(redovi.length, 3);
  const [eur, rsd] = redovi;
  assert.deepEqual(
    [eur.datum_izdavanja, eur.valuta, eur.iznos_valuta, eur.kurs_nbs, eur.ukupno_rsd, eur.datum_naplate, eur.klijent],
    ['2026-03-05', 'EUR', '4000.00', '117.1234', '468493.60', '2026-04-15', 'primer-gmbh'],
  );
  assert.deepEqual([rsd.valuta, rsd.iznos_valuta, rsd.kurs_nbs, rsd.napomena, rsd.status], ['RSD', '120000.00', '', 'rok 45 dana; bez ugovora', 'izdata']);
  assert.ok(upozorenja.some((u) => u.includes('2026-3') && u.includes('storn')), upozorenja.join('\n'));
});

test('migriraj piše novi KPO, čuva zbir i sledeći broj, a postojeći fajl ne prepisuje', () => {
  const d = mkdtempSync(join(tmpdir(), 'migracija '));
  const novi = join(d, 'kpo-2026.csv');
  const r = migriraj(stari, novi);
  assert.equal(r.redova, 3);
  assert.equal(r.zbirStari, r.zbirNovi);
  assert.equal(sledeciBroj(ucitaj(novi), 2026), '2026-4');
  assert.throws(() => migriraj(stari, novi), /postoji/);
});

test('prevedi odbija nepoznato zaglavlje i neslaganje iznosa ne prećutkuje', () => {
  assert.throws(() => prevedi('a;b\n1;2\n'), /zaglavlje/);
  const los = readFileSync(stari, 'utf8').replace('468493,60;468493,60', '468493,60;468000,00');
  assert.ok(prevedi(los).upozorenja.some((u) => u.includes('2026-1') && u.includes('ukupno')));
});

test('prevedi odbija neispravan datum umesto da ga pogodi', () => {
  const los = readFileSync(stari, 'utf8').replace('05.03.2026', '2026-03-05');
  assert.throws(() => prevedi(los), /datum/);
});

test('neispravan stari CSV (navodnik u tekstu, ; u napomeni) čita se doslovno, uz upozorenje', () => {
  const zaglavlje = readFileSync(stari, 'utf8').split('\n')[0];
  const red = '1;2026-1;05.03.2026;28.02.2026;Primer DOO;Rad na „projektu" X;;;1000,00;1000,00;19.04.2026;;prvi deo; drugi deo';
  const { redovi, upozorenja } = prevedi(`${zaglavlje}\n${red}\n`);
  assert.equal(redovi[0].opis, 'Rad na „projektu" X');
  assert.equal(redovi[0].napomena, 'prvi deo; drugi deo');
  assert.ok(upozorenja.some((u) => u.includes('doslovno')));
  assert.ok(upozorenja.some((u) => u.includes('spojeno')));
});

test('nemoguć ili prazan obavezan datum se ne uvozi', () => {
  const tekst = readFileSync(stari, 'utf8');
  assert.throws(() => prevedi(tekst.replace('05.03.2026', '31.02.2026')), /nije ispravan/);
  assert.throws(() => prevedi(tekst.replace('05.03.2026;28.02.2026', '05.03.2026;')), /datum prometa nedostaje/);
});
