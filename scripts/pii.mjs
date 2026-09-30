// Traži lične podatke u fajlovima repoa po obrascu: JMBG, PIB i račun sa ispravnom
// kontrolnom cifrom, IBAN i e-mail adrese. Fiktivni primeri namerno imaju neispravne
// kontrolne cifre i domen .invalid. Lista konkretnih ličnih vrednosti je samo lokalna
// (.pii-lista, gitignored) i nikad se ne commit-uje.
//
// CLI: node scripts/pii.mjs [--istorija]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pibKontrola, racunKontrola, ibanKontrola } from '../plugins/pausal/scripts/agencija.mjs';

// Dužine IBAN-a po državi (ISO 13616) za zemlje sa kojima paušalci najčešće posluju.
const IBAN_DUZINE = { RS: 22, DE: 22, AT: 20, GB: 22, FR: 27, IT: 27, ES: 24, NL: 18, BE: 16, CH: 21, HR: 21, SI: 19, HU: 28, BA: 20, ME: 22, MK: 19, PL: 28, CZ: 24, SK: 24, RO: 24, BG: 22, GR: 27, SE: 24, NO: 15, DK: 18, FI: 18, IE: 22, PT: 25, LU: 20, LI: 21, AE: 23, TR: 26 };

const DOZVOLJENI_DOMENI = /@([a-z0-9-]+\.)*(invalid|example\.(com|org|net)|users\.noreply\.github\.com)$/i;

export function jmbgKontrola(j) {
  if (!/^\d{13}$/.test(j)) return false;
  const d = [...j].map(Number);
  const s = 7 * (d[0] + d[6]) + 6 * (d[1] + d[7]) + 5 * (d[2] + d[8]) + 4 * (d[3] + d[9]) + 3 * (d[4] + d[10]) + 2 * (d[5] + d[11]);
  const k = 11 - (s % 11);
  return (k > 9 ? 0 : k) === d[12];
}

export function nadji(tekst, lokalna = []) {
  const nalazi = [];
  for (const [m] of tekst.matchAll(/(?<!\d)\d{13}(?!\d)/g)) if (jmbgKontrola(m)) nalazi.push(`JMBG ${m}`);
  for (const [m] of tekst.matchAll(/(?<!\d)\d{9}(?!\d)/g)) if (pibKontrola(m)) nalazi.push(`PIB ${m}`);
  for (const [m] of tekst.matchAll(/(?<!\d)\d{18}(?!\d)/g)) if (racunKontrola(m)) nalazi.push(`račun ${m}`);
  for (const [m, banka, broj, k] of tekst.matchAll(/(?<![\d-])(\d{3})-(\d{1,13})-(\d{2})(?![\d-])/g)) {
    if (racunKontrola(banka + broj.padStart(13, '0') + k)) nalazi.push(`račun ${m}`);
  }
  for (const [m] of tekst.matchAll(/\b[A-Za-z]{2}\d{2}(?: ?[A-Za-z0-9]{4}){2,7}(?: ?[A-Za-z0-9]{1,4})?\b/g)) {
    const s = m.replace(/ /g, '').toUpperCase();
    const duzina = IBAN_DUZINE[s.slice(0, 2)];
    if (duzina && s.length >= duzina && ibanKontrola(s.slice(0, duzina))) nalazi.push(`IBAN ${s.slice(0, duzina)}`);
  }
  for (const [m] of tekst.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) if (!DOZVOLJENI_DOMENI.test(m)) nalazi.push(`e-mail ${m}`);
  for (const v of lokalna) if (v && tekst.includes(v)) nalazi.push(`lokalna lista: ${v}`);
  return nalazi;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lokalna = existsSync('.pii-lista') ? readFileSync('.pii-lista', 'utf8').split('\n').map((s) => s.trim()).filter(Boolean) : [];
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
  // Istorija grane koja se objavljuje: svaka dodata linija, autori i poruke commit-a.
  const izvori = process.argv.includes('--istorija')
    ? {
        'git istorija (diff)': git('log', '-p', '--no-color', 'HEAD').split('\n').filter((l) => l.startsWith('+')).join('\n'),
        'git istorija (autori i poruke)': git('log', '--format=%an <%ae>%n%cn <%ce>%n%B', 'HEAD'),
      }
    : Object.fromEntries(git('ls-files', '-z').split('\0').filter(Boolean).map((f) => [f, readFileSync(f, 'utf8')]));
  let ukupno = 0;
  for (const [ime, tekst] of Object.entries(izvori)) {
    for (const n of nadji(tekst, lokalna)) { console.error(`${ime}: ${n}`); ukupno++; }
  }
  console.log(`pii: ${ukupno} nalaza${lokalna.length ? ` (lokalna lista: ${lokalna.length} vrednosti)` : ''}`);
  if (ukupno) process.exitCode = 1;
}
