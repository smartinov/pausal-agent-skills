// Provera repoa za CI: shema propisi.md, citati u oba smera, istekle revizije (upozorenje).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsiraj, proveri, PUTANJA } from '../plugins/pausal/scripts/propisi.mjs';

const CITAT = /propis:([a-z0-9-]+(?:\.[a-z0-9-]+)+)/g;

export function proveriCitate(fajlovi, redovi) {
  const greske = [];
  const ids = new Set(redovi.map((r) => r.id));
  const citirani = new Set();
  for (const [putanja, tekst] of Object.entries(fajlovi)) {
    for (const [, id] of tekst.matchAll(CITAT)) {
      citirani.add(id);
      if (!ids.has(id)) greske.push(`${putanja}: citira propis:${id}, a red ne postoji`);
    }
  }
  for (const id of ids) if (!citirani.has(id)) greske.push(`propisi.md: red ${id} niko ne citira`);
  return greske;
}

export function istekli(redovi, danas) {
  return redovi.filter((r) => r.status === 'verified' && r.revizija !== '' && r.revizija <= danas);
}

function citajPlugin(koren) {
  const fajlovi = {};
  for (const dir of ['skills', 'scripts', 'template']) {
    const d = join(koren, dir);
    if (!existsSync(d)) continue;
    for (const p of readdirSync(d, { recursive: true, withFileTypes: true })) {
      if (!p.isFile() || !/\.(md|mjs|html|csv|txt)$/.test(p.name)) continue;
      const puna = join(p.parentPath, p.name);
      fajlovi[relative(koren, puna)] = readFileSync(puna, 'utf8');
    }
  }
  return fajlovi;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const koren = fileURLToPath(new URL('../plugins/pausal/', import.meta.url));
  const redovi = parsiraj(readFileSync(PUTANJA, 'utf8'));
  const greske = [...proveri(redovi), ...proveriCitate(citajPlugin(koren), redovi)];
  const danas = new Date().toISOString().slice(0, 10);
  for (const r of istekli(redovi, danas)) console.warn(`upozorenje: ${r.id} revizija istekla ${r.revizija}`);
  for (const g of greske) console.error(`greška: ${g}`);
  console.log(`propisi: ${redovi.length} redova, ${greske.length} grešaka`);
  if (greske.length) process.exitCode = 1;
}
