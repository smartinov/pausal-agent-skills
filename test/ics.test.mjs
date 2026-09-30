import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsiraj } from '../plugins/pausal/scripts/propisi.mjs';
import { dogadjaji, uIcs } from '../plugins/pausal/scripts/ics.mjs';

const H = `| ID | Pravilo | Vrednost | Period | Važi za | Primena od | Primena do | Izvor | Status | Provereno | Revizija |
|---|---|---|---|---|---|---|---|---|---|---|`;
const red = (id, v, status = 'verified', vaziZa = 'svi') =>
  `| ${id} | x | ${v} | | ${vaziZa} | 2026-01-01 | | Zakon | ${status} | 2026-09-30 | ${status === 'verified' ? '2027-12-31' : ''} |`;
const propisi = parsiraj([H,
  red('obaveze.rok-mesecni', 15), red('obaveze.neradni-dan', '', 'unverified'),
  red('eko-taksa.prijava', 430), red('eko-taksa.placanje', 15), red('doprinos.povracaj', '', 'verified', 'osiguranje=zaposlen'),
].join('\n'));

const agencija = { naziv: 'Primer', osiguranje: 'zaposlen', datum_registracije: '2026-09-18' };

test('mesečni rok od prvog meseca posle registracije, eko-taksa i povraćaj PIO za zaposlene', () => {
  const { lista, preskoceno } = dogadjaji(agencija, propisi, { godina: 2027, danas: '2026-10-01' });
  const datumi = lista.map((d) => `${d.datum} ${d.citat}`);
  assert.ok(datumi.includes('2027-01-15 propis:obaveze.rok-mesecni'));
  assert.ok(datumi.includes('2027-12-15 propis:obaveze.rok-mesecni'));
  assert.ok(datumi.includes('2027-04-30 propis:eko-taksa.prijava'));
  assert.deepEqual(lista.filter((d) => d.citat === 'propis:eko-taksa.placanje').map((d) => d.datum), ['2027-01-15', '2027-04-15', '2027-07-15', '2027-10-15']);
  assert.ok(datumi.includes('2027-03-01 propis:doprinos.povracaj'));
  assert.deepEqual(preskoceno, []);
  assert.deepEqual(lista.map((d) => d.datum), [...lista.map((d) => d.datum)].sort());
});

test('pre registracije nema mesečnih rokova; samostalan nema povraćaj PIO', () => {
  const { lista } = dogadjaji({ ...agencija, osiguranje: 'samostalan' }, propisi, { godina: 2026, danas: '2026-10-01' });
  const mesecni = lista.filter((d) => d.citat === 'propis:obaveze.rok-mesecni').map((d) => d.datum);
  assert.deepEqual(mesecni, ['2026-10-15', '2026-11-15', '2026-12-15']);
  assert.ok(!lista.some((d) => d.citat === 'propis:doprinos.povracaj'));
});

test('neproveren propis preskače događaj i kaže zašto', () => {
  const bez = parsiraj([H, red('obaveze.rok-mesecni', 15, 'unverified'), red('eko-taksa.prijava', 430), red('eko-taksa.placanje', 15), red('doprinos.povracaj', '', 'verified', 'osiguranje=zaposlen')].join('\n'));
  const { lista, preskoceno } = dogadjaji(agencija, bez, { godina: 2027, danas: '2026-10-01' });
  assert.ok(!lista.some((d) => d.citat === 'propis:obaveze.rok-mesecni'));
  assert.ok(preskoceno.some((p) => p.includes('obaveze.rok-mesecni') && p.includes('unverified')));
});

test('uIcs: CRLF, celodnevni događaj, podsetnik, escapovanje i savijanje linija', () => {
  const ics = uIcs([{ datum: '2027-01-15', naslov: 'Porez; doprinosi, decembar', opis: 'x'.repeat(200), citat: 'propis:a.b' }], '2026-10-01');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20270115\r\n'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20270116\r\n'));
  assert.ok(ics.includes('SUMMARY:Porez\\; doprinosi\\, decembar'));
  assert.ok(ics.includes('TRIGGER:-P3D'));
  assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75));
});

test('eko-taksa pre registracije se ne generiše; promena propisa usred godine se ne maskira', () => {
  const { lista } = dogadjaji(agencija, propisi, { godina: 2026, danas: '2026-10-01' });
  const eko = lista.filter((d) => d.citat.startsWith('propis:eko-taksa')).map((d) => d.datum);
  assert.deepEqual(eko, ['2026-10-15']);
  const promena = parsiraj([H,
    red('obaveze.rok-mesecni', 15), red('eko-taksa.placanje', 15), red('doprinos.povracaj', '', 'verified', 'osiguranje=zaposlen'),
    '| eko-taksa.prijava | x | 430 | | svi | 2026-01-01 | 2027-03-31 | Zakon | verified | 2026-09-30 | 2027-12-31 |',
    '| eko-taksa.prijava | x | 531 | | svi | 2027-04-01 | | Zakon | verified | 2026-09-30 | 2027-12-31 |',
  ].join('\n'));
  const r = dogadjaji(agencija, promena, { godina: 2027, danas: '2026-10-01' });
  assert.ok(!r.lista.some((d) => d.citat === 'propis:eko-taksa.prijava'));
  assert.ok(r.preskoceno.some((p) => p.includes('eko-taksa.prijava') && p.includes('razlikuje')));
});
