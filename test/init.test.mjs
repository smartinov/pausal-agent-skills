import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { proveriOdrediste, napravi } from '../plugins/pausal/scripts/init.mjs';

const plugin = fileURLToPath(new URL('../plugins/pausal/', import.meta.url));
const repo = fileURLToPath(new URL('../', import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'init test '));

test('odbija folder unutar plugin-a, repoa ili instalacije, pre bilo kakvog upisa', () => {
  for (const dest of [join(plugin, 'x'), join(repo, 'agencija'), plugin]) {
    const r = proveriOdrediste(dest, plugin);
    assert.equal(r.ok, false, dest);
    assert.ok(!existsSync(join(plugin, 'x')));
  }
  const kes = join(tmp(), '.claude', 'plugins', 'cache', 'pausal-agent-skills', 'pausal', '2026.9.0');
  mkdirSync(join(kes, '.claude-plugin'), { recursive: true });
  writeFileSync(join(kes, '.claude-plugin', 'plugin.json'), '{"name":"pausal"}');
  assert.equal(proveriOdrediste(join(kes, 'radni'), kes).ok, false);
  const codex = join(tmp(), 'codex-plugin');
  mkdirSync(join(codex, '.codex-plugin'), { recursive: true });
  assert.equal(proveriOdrediste(join(codex, 'radni'), plugin).ok, false);
});

test('odbija neprazan folder, prihvata prazan ili nepostojeći, upozorava na git', () => {
  const d = tmp();
  writeFileSync(join(d, 'nesto.txt'), 'x');
  assert.equal(proveriOdrediste(d, plugin).ok, false);
  assert.equal(proveriOdrediste(join(tmp(), 'novi folder'), plugin).ok, true);
  const g = tmp();
  mkdirSync(join(g, '.git'));
  const r = proveriOdrediste(join(g, 'agencija'), plugin);
  assert.equal(r.ok, true);
  assert.ok(r.upozorenja.some((u) => u.includes('privatan')));
});

test('napravi kopira template, pravi foldere i .gitignore, a odbijen init ne piše ništa', () => {
  const d = join(tmp(), 'moja agencija');
  const r = napravi(d, plugin);
  assert.equal(r.ok, true);
  for (const p of ['AGENTS.md', 'agencija.json', '.gitignore', 'Memory/log.md', 'Sabloni/faktura.html', 'Finansije/KPO', 'Finansije/Fakture', 'Klijenti', 'Banka/Izvodi', 'Poreska']) {
    assert.ok(existsSync(join(d, p)), p);
  }
  assert.ok(!existsSync(join(d, 'gitignore')));
  assert.equal(JSON.parse(readFileSync(join(d, 'agencija.json'), 'utf8')).pib, '');
  const odbijen = napravi(join(plugin, 'x'), plugin);
  assert.equal(odbijen.ok, false);
  assert.ok(!existsSync(join(plugin, 'x')));
  assert.ok(readdirSync(d).length > 0);
});

test('putanja direktno ispod korena zadržava ime foldera', () => {
  const koren = process.platform === 'win32' ? 'C:\\' : '/';
  const r = proveriOdrediste(join(koren, 'pausal-nepostojeci-folder-xyz'), plugin);
  assert.equal(r.odrediste, join(koren, 'pausal-nepostojeci-folder-xyz'));
});
