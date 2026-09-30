import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nadji, jmbgKontrola } from '../scripts/pii.mjs';
import { racunKontrola, ibanKontrola } from '../plugins/pausal/scripts/agencija.mjs';

// Ispravni primeri se prave algoritmom, da test ne sadrži stvaran JMBG, PIB ili račun.
function dopuniJmbg(prvih12) {
  const d = [...prvih12].map(Number);
  const s = 7 * (d[0] + d[6]) + 6 * (d[1] + d[7]) + 5 * (d[2] + d[8]) + 4 * (d[3] + d[9]) + 3 * (d[4] + d[10]) + 2 * (d[5] + d[11]);
  const k = 11 - (s % 11);
  return prvih12 + (k > 9 ? 0 : k);
}

test('jmbgKontrola prihvata samo ispravnu kontrolnu cifru', () => {
  const j = dopuniJmbg('010199071000');
  assert.equal(jmbgKontrola(j), true);
  assert.equal(jmbgKontrola(j.slice(0, 12) + ((Number(j[12]) + 1) % 10)), false);
});

test('nadji prijavljuje JMBG, PIB i račun sa ispravnom kontrolnom cifrom i stvarne e-mail adrese', () => {
  const jmbg = dopuniJmbg('010199071000');
  const pib = [...'0123456789'].map((c) => `10000000${c}`).find((p) => nadji(`x ${p} x`).length);
  const mejl = ['ana', 'gmail.com'].join('@'); // sastavljen u toku rada, da skener ne nađe ovaj fajl
  const tekst = `jmbg ${jmbg}, pib ${pib}, mejl ${mejl}, fiktivno kontakt@primer.invalid i 100000000`;
  const nalazi = nadji(tekst);
  assert.ok(nalazi.some((n) => n.startsWith('JMBG')));
  assert.ok(nalazi.some((n) => n.startsWith('PIB')));
  assert.ok(nalazi.some((n) => n.includes(mejl)));
  assert.ok(!nalazi.some((n) => n.includes('primer.invalid') || n.includes('100000000')));
});

test('nadji prijavlja vrednosti sa lokalne liste, bez obzira na oblik', () => {
  assert.deepEqual(nadji('ime Pera Perić', ['Pera Perić']), ['lokalna lista: Pera Perić']);
});

test('nadji prepoznaje račun sa crticama i IBAN sa razmacima ili malim slovima', () => {
  const dve = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));
  const k = dve.find((x) => racunKontrola(`1600000000012345${x}`));
  assert.ok(nadji(`račun 160-0000000012345-${k}`).some((n) => n.startsWith('račun')));
  assert.ok(nadji(`račun 160-12345-${k}`).some((n) => n.startsWith('račun')));
  const c = dve.find((x) => ibanKontrola(`RS${x}160000000001234500`));
  const razmaci = `RS${c} 1600 0000 0001 2345 00`;
  assert.ok(nadji(razmaci).some((n) => n.startsWith('IBAN')), razmaci);
  assert.ok(nadji(razmaci.toLowerCase()).some((n) => n.startsWith('IBAN')));
});

test('IBAN iza koga ide tekst se i dalje prepoznaje', () => {
  const dve = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));
  const c = dve.find((x) => ibanKontrola(`AT${x}1234500000123456`));
  assert.ok(nadji(`uplata na AT${c}1234500000123456 EUR test`).some((n) => n.startsWith('IBAN')));
});
