import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsiraj, izaberi, proveri } from '../plugins/pausal/scripts/propisi.mjs';

const zaglavlje = `| ID | Pravilo | Vrednost | Period | Važi za | Primena od | Primena do | Izvor | Status | Provereno | Revizija |
|---|---|---|---|---|---|---|---|---|---|---|`;

function tabela(...redovi) {
  return `# Propisi\n\n${zaglavlje}\n${redovi.join('\n')}\n`;
}

const limit2026 = '| limit.test | Limit | 600000000 | kalendarska-godina | svi | 2026-01-01 | 2026-12-31 | Zakon čl. 1 | verified | 2026-09-30 | 2027-01-31 |';
const limit2027 = '| limit.test | Limit | 800000000 | kalendarska-godina | svi | 2027-01-01 | | Zakon čl. 1 | verified | 2026-09-30 | 2027-01-31 |';
const pioZaposlen = '| pio.test | PIO | 2400 | mesec | osiguranje=zaposlen | 2026-01-01 | | Zakon čl. 44 | verified | 2026-09-30 | 2027-01-31 |';
const pioSamostalan = '| pio.test | PIO | 2400 | mesec | osiguranje=samostalan | 2026-01-01 | | Zakon čl. 44 | unverified | | |';

const danas = '2026-10-01';

test('parsiraj čita redove iz više tabela i preskače tekst', () => {
  const md = tabela(limit2026) + '\nTekst\n\n' + zaglavlje + '\n' + limit2027 + '\n';
  const redovi = parsiraj(md);
  assert.equal(redovi.length, 2);
  assert.equal(redovi[0].id, 'limit.test');
  assert.equal(redovi[1].od, '2027-01-01');
  assert.equal(redovi[1].do, '');
});

test('izaberi vraća vrednost jedine primenljive verzije po datumu', () => {
  const redovi = parsiraj(tabela(limit2026, limit2027));
  const r = izaberi(redovi, 'propis:limit.test', { datum: '2026-12-31', danas });
  assert.equal(r.status, 'ok');
  assert.equal(r.vrednost, 600000000);
  assert.equal(izaberi(redovi, 'propis:limit.test', { datum: '2027-01-01', danas }).vrednost, 800000000);
});

test('izaberi traži prefiks propis: da bi svaka upotreba bila vidljiv citat', () => {
  const redovi = parsiraj(tabela(limit2026));
  assert.throws(() => izaberi(redovi, 'limit.test', { datum: '2026-05-01', danas }), /propis:/);
});

test('izaberi bira po okolnostima korisnika', () => {
  const redovi = parsiraj(tabela(pioZaposlen, pioSamostalan));
  const r = izaberi(redovi, 'propis:pio.test', { datum: '2026-05-01', danas, okolnosti: { osiguranje: 'zaposlen' } });
  assert.equal(r.status, 'ok');
  assert.equal(r.vrednost, 2400);
});

test('izaberi vraća NEPROVERENO za unverified, disputed, istekao, bez izvora, nedostaje, nepoznatu okolnost', () => {
  const slucajevi = [
    [[pioSamostalan], { osiguranje: 'samostalan' }, /unverified/],
    [[limit2026.replace('verified', 'disputed')], {}, /disputed/],
    [[limit2026.replace('2027-01-31', '2026-09-30')], {}, /revizija/],
    [[limit2026.replace('Zakon čl. 1', '')], {}, /izvor/],
    [[limit2027], {}, /nema primenljive/],
    [[pioZaposlen], {}, /okolnost osiguranje/],
  ];
  for (const [redovi, okolnosti, razlog] of slucajevi) {
    const id = redovi[0].includes('pio.test') ? 'propis:pio.test' : 'propis:limit.test';
    const r = izaberi(parsiraj(tabela(...redovi)), id, { datum: '2026-05-01', danas, okolnosti });
    assert.equal(r.status, 'NEPROVERENO', `${razlog}`);
    assert.match(r.razlog, razlog);
  }
});

test('izaberi vraća NEPROVERENO kad se dve verzije preklapaju', () => {
  const r = izaberi(parsiraj(tabela(limit2026, limit2026)), 'propis:limit.test', { datum: '2026-05-01', danas });
  assert.equal(r.status, 'NEPROVERENO');
  assert.match(r.razlog, /više primenljivih/);
});

test('proveri prihvata ispravnu tabelu', () => {
  assert.deepEqual(proveri(parsiraj(tabela(limit2026, limit2027, pioZaposlen, pioSamostalan))), []);
});

test('proveri prijavljuje greške sheme i preklapanja', () => {
  const lose = [
    '| Limit.Test | x | | | svi | 2026-01-01 | | Izvor | verified | 2026-09-30 | 2027-01-31 |',
    '| a.b | x | 12,5 | | svi | 2026-01-01 | | Izvor | verified | 2026-09-30 | 2027-01-31 |',
    '| a.c | x | | nedeljno | svi | 2026-01-01 | | Izvor | verified | 2026-09-30 | 2027-01-31 |',
    '| a.d | x | | | svi | 2026-13-01 | | Izvor | verified | 2026-09-30 | 2027-01-31 |',
    '| a.e | x | | | svi | 2026-01-01 | 2025-01-01 | Izvor | verified | 2026-09-30 | 2027-01-31 |',
    '| a.f | x | | | svi | 2026-01-01 | | Izvor | sigurno | 2026-09-30 | 2027-01-31 |',
    '| a.g | x | | | svi | 2026-01-01 | | | verified | | |',
    '| a.h | x | | | osiguranje | 2026-01-01 | | Izvor | verified | 2026-09-30 | 2027-01-31 |',
  ];
  const greske = proveri(parsiraj(tabela(...lose, limit2026, limit2027.replace('2027-01-01', '2026-06-01'))));
  for (const deo of ['Limit.Test', 'a.b', 'a.c', 'a.d', 'a.e', 'a.f', 'a.g', 'a.h', 'limit.test']) {
    assert.ok(greske.some((g) => g.includes(deo)), `očekivana greška za ${deo}: ${greske.join('\n')}`);
  }
});

test('izaberi odbija nepostojeći datum; proveri odbija dupli ključ; neispravan red je NEPROVERENO', () => {
  const redovi = parsiraj(tabela(limit2026));
  assert.throws(() => izaberi(redovi, 'propis:limit.test', { datum: '2026-02-30', danas }), /datum/);
  const dupli = '| a.b | x | | | osiguranje=samostalan;osiguranje=zaposlen | 2026-01-01 | | Izvor | verified | 2026-09-30 | 2027-01-31 |';
  assert.ok(proveri(parsiraj(tabela(dupli))).some((g) => g.includes('dvaput')));
  const los = limit2026.replace('2027-01-31', '2027-13-45');
  const r = izaberi(parsiraj(tabela(los)), 'propis:limit.test', { datum: '2026-05-01', danas });
  assert.equal(r.status, 'NEPROVERENO');
  assert.match(r.razlog, /nije ispravan/);
});
