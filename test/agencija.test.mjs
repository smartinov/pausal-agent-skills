import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { proveriAgenciju, pibKontrola, racunKontrola, ibanKontrola } from '../plugins/pausal/scripts/agencija.mjs';

// Fiktivna agencija: kontrolne cifre su namerno neispravne da ne bi pripadale stvarnom licu.
const primer = JSON.parse(readFileSync(new URL('./fixtures/agencija.json', import.meta.url), 'utf8'));

test('kontrolne cifre: PIB MOD 11,10, račun 97, IBAN 97', () => {
  // Tačno jedna kontrolna cifra je ispravna; test ne sadrži stvaran ispravan PIB ili račun.
  const pibovi = [...'0123456789'].filter((c) => pibKontrola(`10000000${c}`));
  assert.equal(pibovi.length, 1);
  const racuni = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0')).filter((k) => racunKontrola(`1600000000000000${k}`));
  assert.equal(racuni.length, 1);
  assert.equal(pibKontrola('100000000'), false);
  assert.equal(racunKontrola('000000000000000000'), false);
  const ibani = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0')).filter((k) => ibanKontrola(`RS${k}160000000000000000`));
  assert.equal(ibani.length, 1);
  assert.equal(ibanKontrola('RS00000000000000000000'), false);
});

test('primer prolazi sa upozorenjima za kontrolne cifre', () => {
  const r = proveriAgenciju(primer);
  assert.deepEqual(r.greske, []);
  assert.ok(r.upozorenja.some((u) => u.includes('PIB')));
  assert.ok(r.upozorenja.some((u) => u.includes('račun')));
  assert.ok(r.upozorenja.some((u) => u.includes('IBAN')));
});

test('nedostajuća i pogrešno oblikovana polja su greške', () => {
  const r = proveriAgenciju({ ...primer, pib: '12345', osiguranje: 'nešto', poslovno_ime: '', racuni: [] });
  for (const deo of ['pib', 'osiguranje', 'poslovno_ime', 'RSD račun']) {
    assert.ok(r.greske.some((g) => g.includes(deo)), `${deo}: ${r.greske}`);
  }
});
