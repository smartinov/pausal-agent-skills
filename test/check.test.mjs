import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proveriCitate, istekli } from '../scripts/check.mjs';

const red = (id, revizija = '2027-01-31') => ({ id, revizija, status: 'verified' });

test('proveriCitate: citat bez reda i red bez citata su greške', () => {
  const fajlovi = { 'skills/a/SKILL.md': 'vidi propis:limit.pausal i propis:nepostoji.x.' };
  const greske = proveriCitate(fajlovi, [red('limit.pausal'), red('pio.stopa')]);
  assert.equal(greske.length, 2);
  assert.ok(greske.some((g) => g.includes('nepostoji.x') && g.includes('skills/a/SKILL.md')));
  assert.ok(greske.some((g) => g.includes('pio.stopa')));
});

test('proveriCitate: istorijske verzije istog ID-ja dele jedan citat', () => {
  const fajlovi = { 'scripts/kpo.mjs': "izaberi(r, 'propis:limit.pausal', o)" };
  assert.deepEqual(proveriCitate(fajlovi, [red('limit.pausal'), red('limit.pausal')]), []);
});

test('istekli: verified redovi sa revizijom danas ili ranije', () => {
  const redovi = [red('a.b', '2026-10-01'), red('a.c', '2026-10-02'), { id: 'a.d', revizija: '', status: 'unverified' }];
  assert.deepEqual(istekli(redovi, '2026-10-01').map((r) => r.id), ['a.b']);
});
