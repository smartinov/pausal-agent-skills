// Verzija plugin-a je ista u svim manifestima, CalVer YYYY.M.N, i podignuta je
// kad se plugin promeni u odnosu na osnovnu granu.
//
// CLI: node scripts/verzija.mjs [<osnovni-ref>]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MANIFESTI = [
  ['.claude-plugin/marketplace.json', (j) => j.plugins.find((p) => p.name === 'pausal').version],
  ['.claude-plugin/marketplace.json', (j) => j.metadata.version],
  ['plugins/pausal/.claude-plugin/plugin.json', (j) => j.version],
  ['plugins/pausal/.codex-plugin/plugin.json', (j) => j.version],
];

export function verzije(citaj) {
  return MANIFESTI.map(([f, uzmi]) => uzmi(JSON.parse(citaj(f))));
}

export function veca(a, b) {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const osnova = process.argv[2];
  const greske = [];
  const sada = verzije((f) => readFileSync(f, 'utf8'));
  if (new Set(sada).size !== 1) greske.push(`verzije u manifestima se razlikuju: ${sada.join(', ')}`);
  if (!/^\d{4}\.(1[0-2]|[1-9])\.\d+$/.test(sada[0])) greske.push(`verzija ${sada[0]} nije CalVer YYYY.M.N`);
  if (osnova) {
    const git = (...a) => execFileSync('git', a, { encoding: 'utf8' });
    const promenjeno = git('diff', '--name-only', `${osnova}...HEAD`, '--', 'plugins/pausal').trim();
    const pre = verzije((f) => git('show', `${osnova}:${f}`))[0];
    if (promenjeno && !veca(sada[0], pre)) greske.push(`plugin je promenjen, a verzija ${sada[0]} nije veća od ${pre}; podigni je i dopiši CHANGELOG`);
  }
  for (const g of greske) console.error(`verzija: ${g}`);
  console.log(`verzija: ${sada[0]}, ${greske.length} grešaka`);
  if (greske.length) process.exitCode = 1;
}
