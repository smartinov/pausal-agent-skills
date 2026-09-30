// Provera agencija.json: oblik polja je greška, pogrešna kontrolna cifra je upozorenje
// (verovatna greška u kucanju; fiktivni primeri je namerno imaju).
//
// CLI: node agencija.mjs <agencija.json>
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function pibKontrola(pib) {
  if (!/^\d{9}$/.test(pib)) return false;
  let p = 10;
  for (let i = 0; i < 8; i++) {
    let s = (Number(pib[i]) + p) % 10;
    if (s === 0) s = 10;
    p = (2 * s) % 11;
  }
  return (11 - p) % 10 === Number(pib[8]);
}

export function racunKontrola(broj) {
  if (!/^\d{18}$/.test(broj)) return false;
  return BigInt(broj) % 97n === 1n;
}

export function ibanKontrola(iban) {
  const s = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return false;
  const brojevi = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  return BigInt(brojevi) % 97n === 1n;
}

const OBAVEZNO = ['poslovno_ime', 'naziv', 'adresa', 'mesto', 'pib', 'mb', 'sifra_delatnosti', 'osiguranje', 'datum_registracije', 'email'];

export function proveriAgenciju(a) {
  const greske = [];
  const upozorenja = [];
  for (const k of OBAVEZNO) if (!a[k]) greske.push(`nedostaje ${k}`);
  if (a.pib && !/^\d{9}$/.test(a.pib)) greske.push('pib mora imati 9 cifara');
  else if (a.pib && !pibKontrola(a.pib)) upozorenja.push('PIB ne prolazi kontrolnu cifru; proveri ga');
  if (a.mb && !/^\d{8}$/.test(a.mb)) greske.push('mb mora imati 8 cifara');
  if (a.osiguranje && !['samostalan', 'zaposlen'].includes(a.osiguranje)) greske.push('osiguranje mora biti samostalan ili zaposlen');
  if (a.datum_registracije && !/^\d{4}-\d{2}-\d{2}$/.test(a.datum_registracije)) greske.push('datum_registracije mora biti YYYY-MM-DD');
  if (a.rok_placanja_dana !== undefined && !(Number.isInteger(a.rok_placanja_dana) && a.rok_placanja_dana > 0)) greske.push('rok_placanja_dana mora biti ceo broj dana');
  const racuni = a.racuni ?? [];
  const rsd = racuni.find((r) => r.valuta === 'RSD');
  if (!rsd) greske.push('nedostaje RSD račun');
  for (const r of racuni) {
    if (r.valuta === 'RSD') {
      if (!/^\d{18}$/.test(r.broj ?? '')) greske.push('RSD račun mora imati 18 cifara bez crtica');
      else if (!racunKontrola(r.broj)) upozorenja.push(`račun ${r.broj.slice(0, 3)}… ne prolazi kontrolni broj; proveri ga`);
    } else {
      if (!r.iban || !r.swift) greske.push(`${r.valuta} račun traži iban i swift`);
      else if (!ibanKontrola(r.iban)) upozorenja.push(`IBAN za ${r.valuta} ne prolazi kontrolni broj; proveri ga`);
    }
  }
  return { greske, upozorenja };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = proveriAgenciju(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  console.log(JSON.stringify(r, null, 2));
  if (r.greske.length) process.exitCode = 1;
}
