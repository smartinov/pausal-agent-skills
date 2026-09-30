import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verzije, veca } from '../scripts/verzija.mjs';

test('veca poredi CalVer numerički', () => {
  assert.equal(veca('2026.10.0', '2026.9.3'), true);
  assert.equal(veca('2026.9.1', '2026.9.1'), false);
  assert.equal(veca('2026.9.0', '2026.9.1'), false);
});

test('sva četiri manifesta u repou imaju istu verziju', () => {
  const v = verzije((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
  assert.equal(new Set(v).size, 1, v.join(', '));
});
