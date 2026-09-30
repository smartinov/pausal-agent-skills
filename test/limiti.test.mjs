import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsiraj } from '../plugins/pausal/scripts/propisi.mjs';
import { stanje } from '../plugins/pausal/scripts/limiti.mjs';

const propisi = parsiraj(`| ID | Pravilo | Vrednost | Period | Važi za | Primena od | Primena do | Izvor | Status | Provereno | Revizija |
|---|---|---|---|---|---|---|---|---|---|---|
| limit.pausal | x | 600000000 | kalendarska-godina | svi | 2026-01-01 | | Zakon | verified | 2026-09-30 | 2027-01-31 |
| limit.pdv | x | 800000000 | klizecih-12-meseci | svi | 2026-01-01 | | Zakon | unverified | | |
`);

const r = (datum, rsd, klijent = 'a', status = 'izdata') =>
  ({ datum_prometa: datum, ukupno_rsd: rsd, klijent, status });

test('paušal: kalendarska godina, bez storna, udeo, projekcija i upozorenje na 70%', () => {
  const redovi = [
    r('2025-12-31', '5000000.00'),
    r('2026-01-15', '2000000.00', 'a'),
    r('2026-03-01', '2200000.00', 'b'),
    r('2026-04-01', '999999.00', 'b', 'stornirana'),
  ];
  const s = stanje(redovi, propisi, { danas: '2026-07-02' });
  assert.equal(s.pausal.status, 'ok');
  assert.equal(s.pausal.promet, 420000000);
  assert.equal(s.pausal.udeoBp, 7000);
  assert.equal(s.pausal.upozorenje, true);
  // 2026-07-02 je 183. dan od 365: 4.200.000 × 365 / 183 = 8.377.049,18
  assert.equal(s.pausal.projekcija, 837704918);
});

test('paušal: daleko ispod praga, na kraju godine, nema upozorenja', () => {
  const s = stanje([r('2026-01-10', '100000.00')], propisi, { danas: '2026-12-31' });
  assert.equal(s.pausal.upozorenje, false);
});

test('PDV: klizećih 12 meseci i NEPROVERENO propagira bez praga', () => {
  const redovi = [r('2025-10-01', '1000.00'), r('2025-10-02', '2000.00'), r('2026-10-01', '3000.00')];
  const s = stanje(redovi, propisi, { danas: '2026-10-01' });
  assert.equal(s.pdv.promet, 500000);
  assert.equal(s.pdv.status, 'NEPROVERENO');
  assert.equal(s.pdv.prag, null);
});

test('udeo po klijentu u poslednjih 12 meseci, u baznim poenima, opadajuće', () => {
  const redovi = [r('2026-01-01', '750.00', 'a'), r('2026-02-01', '250.00', 'b'), r('2024-01-01', '9999.00', 'b')];
  assert.deepEqual(stanje(redovi, propisi, { danas: '2026-06-01' }).klijenti, [
    { klijent: 'a', promet: 75000, udeoBp: 7500 },
    { klijent: 'b', promet: 25000, udeoBp: 2500 },
  ]);
});

test('istorijski izveštaj ne zaobilazi isteklu reviziju; nepotpun PDV prozor je označen', () => {
  const istekao = parsiraj(`| ID | Pravilo | Vrednost | Period | Važi za | Primena od | Primena do | Izvor | Status | Provereno | Revizija |
|---|---|---|---|---|---|---|---|---|---|---|
| limit.pausal | x | 600000000 | kalendarska-godina | svi | 2026-01-01 | | Zakon | verified | 2026-06-30 | 2026-09-01 |
`);
  const s = stanje([r('2026-08-01', '100.00')], istekao, { danas: '2026-08-15', sada: '2026-09-30', godine: [2026] });
  assert.equal(s.pausal.status, 'NEPROVERENO');
  assert.match(s.pdv.nepotpuno, /2025/);
  assert.equal(stanje([], istekao, { danas: '2026-08-15', godine: [2025, 2026] }).pdv.nepotpuno, undefined);
});

test('stanje bez sada koristi stvarni današnji datum; nedostajuća tekuća godina je označena', () => {
  const istekao = parsiraj(`| ID | Pravilo | Vrednost | Period | Važi za | Primena od | Primena do | Izvor | Status | Provereno | Revizija |
|---|---|---|---|---|---|---|---|---|---|---|
| limit.pausal | x | 600000000 | kalendarska-godina | svi | 2026-01-01 | | Zakon | verified | 2026-06-30 | 2026-09-01 |
`);
  assert.equal(stanje([], istekao, { danas: '2026-08-15' }).pausal.status, 'NEPROVERENO');
  const s = stanje([], istekao, { danas: '2026-08-15', godine: [2025] });
  assert.match(s.pdv.nepotpuno, /2026/);
  assert.match(s.pausal.nepotpuno, /2026/);
});
