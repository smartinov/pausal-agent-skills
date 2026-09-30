import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uPare, izPara, formatRsd, preracunaj } from '../plugins/pausal/scripts/novac.mjs';

test('uPare prihvata srpski i tačka format, odbija više od dve decimale', () => {
  assert.equal(uPare('1.234,56'), 123456);
  assert.equal(uPare('1234.56'), 123456);
  assert.equal(uPare('1234,5'), 123450);
  assert.equal(uPare('6.000.000'), 600000000);
  assert.equal(uPare('-10,01'), -1001);
  assert.throws(() => uPare('1,234'), /neispravan iznos/);
  assert.throws(() => uPare('abc'), /iznos/);
});

test('izPara i formatRsd', () => {
  assert.equal(izPara(71918341), '719183.41');
  assert.equal(izPara(-5), '-0.05');
  assert.equal(formatRsd(71918341), '719.183,41');
  assert.equal(formatRsd(-100), '-1,00');
});

test('preracunaj zaokružuje pola na gore, simetrično za negativne', () => {
  // 6.119,00 EUR × 117,5386 = 719.218,6934 → 719.218,69
  assert.equal(preracunaj(611900, '117.5386'), 71921869);
  // 0,01 × 0,5000 = 0,005 → 0,01
  assert.equal(preracunaj(1, '0.5000'), 1);
  assert.equal(preracunaj(-1, '0.5000'), -1);
  assert.throws(() => preracunaj(100, '117,5386'), /kurs/);
});

test('uPare odbija dvosmislene oblike umesto da tiho množi', () => {
  for (const los of ['1.2345', '7.125.5', '12.34.5', '0.125', '1.23,4,5', '1,234']) {
    assert.throws(() => uPare(los), /neispravan iznos/, los);
  }
  assert.equal(uPare('7.125'), 712500);
  assert.equal(uPare('1.234.567,89'), 123456789);
  assert.equal(uPare('0,5'), 50);
});

test('preracunaj odbija nulti kurs', () => {
  assert.throws(() => preracunaj(100, '0'), /kurs/);
  assert.throws(() => preracunaj(100, '0.0000'), /kurs/);
});
