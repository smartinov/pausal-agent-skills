import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsirajNbs, dohvati } from '../plugins/pausal/scripts/kurs.mjs';

const csv = readFileSync(new URL('./fixtures/nbs-srednji-kurs.csv', import.meta.url), 'utf8');

test('parsirajNbs čita broj liste, datum i srednji kurs', () => {
  const l = parsirajNbs(csv);
  assert.equal(l.lista, '185');
  assert.equal(l.datum, '2026-09-29');
  assert.deepEqual(l.kursevi.EUR, { vaziZa: 1, srednji: '117.5386' });
  assert.deepEqual(l.kursevi.HUF, { vaziZa: 100, srednji: '31.9668' });
});

test('dohvati prati link na CSV i vraća kurs sa datumom liste', async () => {
  const pozivi = [];
  const lazniFetch = async (url) => {
    pozivi.push(url);
    const telo = url.includes('IndexByDate')
      ? '<a href="/ExchangeRateWebApp/ExchangeRate/Download?ExchangeRateListID=abc-123&amp;Format=csv">CSV</a>'
      : csv;
    return { ok: true, status: 200, text: async () => telo };
  };
  const k = await dohvati('2026-09-29', 'EUR', lazniFetch);
  assert.deepEqual(k, { valuta: 'EUR', srednji: '117.5386', lista: '185', datumListe: '2026-09-29', trazeniDatum: '2026-09-29' });
  assert.match(pozivi[0], /Date=29\.09\.2026/);
  assert.match(pozivi[1], /ExchangeRateListID=abc-123&Format=csv/);
});

test('dohvati odbija valutu koja ne važi za 1 jedinicu i grešku servera', async () => {
  const ok = async (url) => ({ ok: true, status: 200, text: async () => (url.includes('IndexByDate') ? 'ExchangeRateListID=abc&amp;Format=csv' : csv) });
  await assert.rejects(dohvati('2026-09-29', 'HUF', ok), /100 jedinica/);
  await assert.rejects(dohvati('2026-09-29', 'EUR', async () => ({ ok: false, status: 503, text: async () => '' })), /503/);
  await assert.rejects(dohvati('2026-09-29', 'EUR', async () => ({ ok: true, status: 200, text: async () => 'nema linka' })), /kursnu listu/);
});

test('parsirajNbs odbija mešane liste i nulti kurs', () => {
  const [zaglavlje, eur] = csv.trim().split(/\r?\n/);
  assert.throws(() => parsirajNbs([zaglavlje, eur, '186,30.09.2026,840,USA,USD,1,99.1234'].join('\n')), /više kursnih lista/);
  assert.throws(() => parsirajNbs([zaglavlje, eur.replace('117.5386', '0.0000')].join('\n')), /neispravan kurs/);
});
