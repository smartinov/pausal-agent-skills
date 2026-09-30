import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KOLONE, citajCsv, pisiCsv, sledeciBroj, finalizuj, storniraj, oznaciNaplatu, izvozHtml, ucitaj } from '../plugins/pausal/scripts/kpo.mjs';

const folder = () => mkdtempSync(join(tmpdir(), 'kpo test '));

function red(broj, nacrt, dodatno = {}) {
  return {
    broj_fakture: broj, datum_izdavanja: '2026-09-22', datum_prometa: '2026-09-22', klijent: 'primer-doo',
    opis: 'Razvoj softvera; septembar', valuta: 'EUR', iznos_valuta: '6119.00', kurs_nbs: '117.5386',
    kursna_lista: '180', prihod_proizvodi_rsd: '0.00', prihod_usluge_rsd: '719218.69', ukupno_rsd: '719218.69',
    rok_placanja: '2026-11-06', datum_naplate: '', status: 'izdata', nacrt_id: nacrt, napomena: 'sa "navodnicima"',
    ...dodatno,
  };
}

test('CSV sa ; i navodnicima prolazi kružno', () => {
  const r = { ...red('2026-1', 'a'), rb: '1' };
  const tekst = pisiCsv([r]);
  assert.ok(tekst.startsWith(KOLONE.join(';')));
  assert.deepEqual(citajCsv(tekst), [r]);
});

test('sledeciBroj kreće od 1 svake godine i ne zavisi od storna', () => {
  assert.equal(sledeciBroj([], 2026), '2026-1');
  const redovi = [red('2025-7', 'x'), red('2026-1', 'a'), red('2026-2', 'b', { status: 'stornirana' })];
  assert.equal(sledeciBroj(redovi, 2026), '2026-3');
  assert.equal(sledeciBroj(redovi, 2027), '2027-1');
});

test('finalizuj upisuje red, dodeljuje rb i ponovljen poziv sa istim nacrtom ne duplira', () => {
  const f = join(folder(), 'kpo-2026.csv');
  assert.equal(finalizuj(f, red('2026-1', 'nacrt-a')).status, 'upisano');
  assert.equal(finalizuj(f, red('2026-1', 'nacrt-a')).status, 'postoji');
  const redovi = ucitaj(f);
  assert.equal(redovi.length, 1);
  assert.equal(redovi[0].rb, '1');
  assert.ok(!existsSync(`${f}.lock`));
});

test('finalizuj odbija broj koji nije sledeći i ne menja fajl', () => {
  const f = join(folder(), 'kpo-2026.csv');
  finalizuj(f, red('2026-1', 'a'));
  const pre = readFileSync(f, 'utf8');
  assert.throws(() => finalizuj(f, red('2026-3', 'b')), /sledeći je 2026-2/);
  assert.equal(readFileSync(f, 'utf8'), pre);
});

test('finalizuj odbija rad dok postoji lock i ne dira fajl', () => {
  const f = join(folder(), 'kpo-2026.csv');
  writeFileSync(`${f}.lock`, '');
  assert.throws(() => finalizuj(f, red('2026-1', 'a')), /zaključan/);
  assert.ok(!existsSync(f));
});

test('prekinut upis (ostao .tmp) ne smeta sledećoj finalizaciji', () => {
  const f = join(folder(), 'kpo-2026.csv');
  finalizuj(f, red('2026-1', 'a'));
  writeFileSync(`${f}.tmp`, 'polovičan upis');
  assert.equal(finalizuj(f, red('2026-2', 'b')).status, 'upisano');
  assert.deepEqual(ucitaj(f).map((r) => r.broj_fakture), ['2026-1', '2026-2']);
});

test('preUpisa radi pod lock-om; ako padne, KPO red se ne upisuje', () => {
  const f = join(folder(), 'kpo-2026.csv');
  let videoLock = false;
  finalizuj(f, red('2026-1', 'a'), () => { videoLock = existsSync(`${f}.lock`); });
  assert.ok(videoLock);
  assert.throws(() => finalizuj(f, red('2026-2', 'b'), () => { throw new Error('pdf nije premešten'); }), /pdf/);
  assert.deepEqual(ucitaj(f).map((r) => r.broj_fakture), ['2026-1']);
  assert.ok(!existsSync(`${f}.lock`));
});

test('storniraj zadržava red, menja status i beleži razlog; broj se ne vraća u niz', () => {
  const f = join(folder(), 'kpo-2026.csv');
  finalizuj(f, red('2026-1', 'a', { napomena: '' }));
  assert.throws(() => storniraj(f, '2026-1', ''), /razlog/);
  assert.equal(storniraj(f, '2026-1', 'pogrešan kupac').status, 'stornirana');
  assert.equal(storniraj(f, '2026-1', 'opet').status, 'vec-stornirana');
  const [r] = ucitaj(f);
  assert.equal(r.status, 'stornirana');
  assert.equal(r.napomena, 'storno: pogrešan kupac');
  assert.equal(sledeciBroj(ucitaj(f), 2026), '2026-2');
});

test('finalizuj odbija nepoznat status i red bez nacrt_id', () => {
  const f = join(folder(), 'kpo-2026.csv');
  assert.throws(() => finalizuj(f, red('2026-1', '')), /nacrt_id/);
  assert.throws(() => finalizuj(f, red('2026-1', 'a', { status: 'nacrt' })), /status/);
});

test('oznaciNaplatu upisuje datum jednom, odbija storniranu i nepoznatu', () => {
  const f = join(folder(), 'kpo-2026.csv');
  finalizuj(f, red('2026-1', 'a'));
  finalizuj(f, red('2026-2', 'b'));
  storniraj(f, '2026-2', 'greška');
  assert.equal(oznaciNaplatu(f, '2026-1', '2026-10-08').status, 'naplaceno');
  assert.equal(oznaciNaplatu(f, '2026-1', '2026-10-09').datum_naplate, '2026-10-08');
  assert.throws(() => oznaciNaplatu(f, '2026-2', '2026-10-08'), /stornirana/);
  assert.throws(() => oznaciNaplatu(f, '2026-9', '2026-10-08'), /nije u KPO/);
});

test('izvozHtml ima pet propisanih kolona i zbir bez storniranih', () => {
  const redovi = [{ ...red('2026-1', 'a'), rb: '1' }, { ...red('2026-2', 'b', { status: 'stornirana' }), rb: '2' }];
  const html = izvozHtml(redovi, 'KPO 2026');
  for (const k of ['Redni broj', 'Datum i opis knjiženja', 'Prihod od proizvoda', 'Prihod od usluga', 'Ukupno']) assert.ok(html.includes(k), k);
  assert.ok(html.includes('(STORNIRANA)'));
  assert.ok(!html.includes('1.438.437,38'), 'stornirana ne sme ući u zbir');
});

test('citajCsv odbija nezatvoren navodnik i pogrešan broj polja, a prihvata BOM', () => {
  const dobar = pisiCsv([{ ...red('2026-1', 'a'), rb: '1' }, { ...red('2026-2', 'b'), rb: '2' }]);
  assert.equal(citajCsv(`﻿${dobar}`).length, 2);
  const nezatvoren = dobar.replace('"sa ""navodnicima"""', '"sa navodnicima');
  assert.throws(() => citajCsv(nezatvoren), /navodnik/);
  const kratak = dobar.split('\n').map((l, i) => (i === 1 ? l.split(';').slice(0, 5).join(';') : l)).join('\n');
  assert.throws(() => citajCsv(kratak), /polja umesto/);
  assert.throws(() => citajCsv(dobar.replace('Razvoj softvera', 'Razvoj "softvera"')), /navodnik usred polja|posle zatvorenog/);
});
