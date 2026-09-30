// KPO knjiga kao CSV sa ; (otvara se u Excel-u sa srpskim podešavanjima).
// Iznosi su decimalni tekst sa tačkom, bez separatora hiljada.
//
// CLI: node kpo.mjs sledeci <kpo.csv> <godina>
//      node kpo.mjs naplata <kpo.csv> <broj> <YYYY-MM-DD>
//      node kpo.mjs izvoz <kpo.csv> <izlaz.html>
import { readFileSync, writeFileSync, renameSync, openSync, closeSync, rmSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uPare, formatRsd } from './novac.mjs';

export const KOLONE = [
  'rb', 'broj_fakture', 'datum_izdavanja', 'datum_prometa', 'klijent', 'opis',
  'valuta', 'iznos_valuta', 'kurs_nbs', 'kursna_lista',
  'prihod_proizvodi_rsd', 'prihod_usluge_rsd', 'ukupno_rsd',
  'rok_placanja', 'datum_naplate', 'status', 'nacrt_id', 'napomena',
];
const STATUSI = ['izdata', 'stornirana'];

function polje(v) {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function pisiCsv(redovi) {
  return [KOLONE.join(';'), ...redovi.map((r) => KOLONE.map((k) => polje(r[k])).join(';'))].join('\n') + '\n';
}

// Strogo: pogrešan navodnik ili broj polja ruši čitanje, da upis ne bi trajno sačuvao pogrešno tumačenje.
export function parsirajCsv(tekst) {
  tekst = tekst.replace(/^\uFEFF/, ''); // Excel „CSV UTF-8" dodaje BOM
  const linije = [];
  let red = [], polje = '', navodnici = false, citirano = false, linija = 1;
  const greska = (sta) => { throw new Error(`KPO CSV, linija ${linija}: ${sta}`); };
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (navodnici) {
      if (c === '"' && tekst[i + 1] === '"') { polje += '"'; i++; }
      else if (c === '"') navodnici = false;
      else { if (c === '\n') linija++; polje += c; }
    } else if (c === '"') {
      if (polje !== '' || citirano) greska('navodnik usred polja');
      navodnici = true; citirano = true;
    } else if (c === ';') { red.push(polje); polje = ''; citirano = false; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && tekst[i + 1] === '\n') i++;
      red.push(polje); linije.push(red); red = []; polje = ''; citirano = false; linija++;
    } else {
      if (citirano) greska('tekst posle zatvorenog navodnika');
      polje += c;
    }
  }
  if (navodnici) greska('navodnik nije zatvoren');
  if (polje !== '' || red.length) { red.push(polje); linije.push(red); }
  const [zaglavlje, ...ostalo] = linije.filter((l) => l.some((x) => x !== ''));
  if (!zaglavlje) return { zaglavlje: [], redovi: [] };
  ostalo.forEach((l, i) => { if (l.length !== zaglavlje.length) throw new Error(`CSV, red ${i + 1}: ${l.length} polja umesto ${zaglavlje.length}`); });
  return { zaglavlje, redovi: ostalo };
}

export function citajCsv(tekst) {
  const { zaglavlje, redovi: ostalo } = parsirajCsv(tekst);
  if (!zaglavlje.length) return [];
  if (zaglavlje.join(';') !== KOLONE.join(';')) throw new Error(`nepoznato zaglavlje KPO fajla: ${zaglavlje.join(';')}`);
  return ostalo.map((l) => Object.fromEntries(KOLONE.map((k, j) => [k, l[j]])));
}

export function ucitaj(putanja) {
  return existsSync(putanja) ? citajCsv(readFileSync(putanja, 'utf8')) : [];
}

export function sledeciBroj(redovi, godina) {
  const indeksi = redovi
    .map((r) => r.broj_fakture.match(/^(\d{4})-(\d+)$/))
    .filter((m) => m && Number(m[1]) === godina)
    .map((m) => Number(m[2]));
  return `${godina}-${Math.max(0, ...indeksi) + 1}`;
}

function podLockom(putanja, posao) {
  const lock = `${putanja}.lock`;
  let fd;
  try {
    fd = openSync(lock, 'wx');
  } catch (e) {
    // ponytail: zaostali lock posle pada se briše ručno; automatsko isticanje ako se to često dešava.
    if (e.code === 'EEXIST') throw new Error(`KPO je zaključan (${lock}); ako nijedna finalizacija nije u toku, obriši lock fajl`);
    throw e;
  }
  try {
    return posao();
  } finally {
    closeSync(fd);
    rmSync(lock, { force: true });
  }
}

function upisi(putanja, redovi) {
  writeFileSync(`${putanja}.tmp`, pisiCsv(redovi));
  renameSync(`${putanja}.tmp`, putanja);
}

// KPO red je tačka commit-a fakture: upis je atomičan, pod lock-om i idempotentan po nacrt_id.
// preUpisa (npr. premeštanje PDF-a pod konačno ime) radi pod istim lock-om, posle provere broja.
export function finalizuj(putanja, red, preUpisa = () => {}) {
  if (!red.nacrt_id) throw new Error('red mora imati nacrt_id');
  if (!STATUSI.includes(red.status)) throw new Error(`nepoznat status ${red.status}`);
  return podLockom(putanja, () => {
    const redovi = ucitaj(putanja);
    if (redovi.some((r) => r.nacrt_id === red.nacrt_id)) return { status: 'postoji' };
    const godina = Number(red.datum_izdavanja.slice(0, 4));
    const ocekivan = sledeciBroj(redovi, godina);
    if (red.broj_fakture !== ocekivan) throw new Error(`broj ${red.broj_fakture} nije sledeći; sledeći je ${ocekivan}`);
    preUpisa();
    upisi(putanja, [...redovi, { ...red, rb: String(redovi.length + 1) }]);
    return { status: 'upisano', rb: redovi.length + 1 };
  });
}

export function oznaciNaplatu(putanja, broj, datum) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) throw new Error('datum naplate mora biti YYYY-MM-DD');
  return podLockom(putanja, () => {
    const redovi = ucitaj(putanja);
    const red = redovi.find((r) => r.broj_fakture === broj);
    if (!red) throw new Error(`faktura ${broj} nije u KPO`);
    if (red.status === 'stornirana') throw new Error(`faktura ${broj} je stornirana`);
    if (red.datum_naplate) return { status: 'vec-naplacena', datum_naplate: red.datum_naplate };
    red.datum_naplate = datum;
    upisi(putanja, redovi);
    return { status: 'naplaceno' };
  });
}

// Pet propisanih kolona KPO-a (propis:kpo.kolone) kao HTML za štampu; stornirane se vide, ali ne ulaze u zbir.
export function izvozHtml(redovi, naslov) {
  const e = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const f = (s) => formatRsd(uPare(s || '0'));
  const zbir = (k) => redovi.filter((r) => r.status !== 'stornirana').reduce((z, r) => z + uPare(r[k] || '0'), 0);
  const telo = redovi.map((r) => `<tr><td>${e(r.rb)}</td><td>${e(r.datum_prometa.split('-').reverse().join('.'))} ${e(`Faktura ${r.broj_fakture}, ${r.klijent}: ${r.opis}`)}${r.status === 'stornirana' ? ' (STORNIRANA)' : ''}</td><td class="n">${f(r.prihod_proizvodi_rsd)}</td><td class="n">${f(r.prihod_usluge_rsd)}</td><td class="n">${f(r.ukupno_rsd)}</td></tr>`).join('\n');
  return `<!doctype html><html lang="sr-Latn"><meta charset="utf-8"><title>${e(naslov)}</title>
<style>body{font:10pt Helvetica,Arial,sans-serif}table{border-collapse:collapse;width:100%}td,th{border:.5pt solid #999;padding:1.5mm;vertical-align:top}.n{text-align:right;white-space:nowrap}</style>
<h1>${e(naslov)}</h1><table><tr><th>Redni broj</th><th>Datum i opis knjiženja</th><th>Prihod od proizvoda</th><th>Prihod od usluga</th><th>Ukupno</th></tr>
${telo}
<tr><th></th><th>Ukupno</th><th class="n">${formatRsd(zbir('prihod_proizvodi_rsd'))}</th><th class="n">${formatRsd(zbir('prihod_usluge_rsd'))}</th><th class="n">${formatRsd(zbir('ukupno_rsd'))}</th></tr></table></html>\n`;
}

// Storno ne briše red: red ostaje sa statusom stornirana i razlogom u napomeni.
export function storniraj(putanja, broj, razlog) {
  if (!razlog) throw new Error('storno traži razlog');
  return podLockom(putanja, () => {
    const redovi = ucitaj(putanja);
    const red = redovi.find((r) => r.broj_fakture === broj);
    if (!red) throw new Error(`faktura ${broj} nije u KPO`);
    if (red.status === 'stornirana') return { status: 'vec-stornirana' };
    red.status = 'stornirana';
    red.napomena = [red.napomena, `storno: ${razlog}`].filter(Boolean).join('; ');
    upisi(putanja, redovi);
    return { status: 'stornirana' };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [komanda, putanja, a, b] = process.argv.slice(2);
  try {
    const rezultat =
      komanda === 'sledeci' ? { broj: sledeciBroj(ucitaj(putanja), Number(a)) } :
      komanda === 'naplata' ? oznaciNaplatu(putanja, a, b) :
      komanda === 'izvoz' ? (writeFileSync(a, izvozHtml(ucitaj(putanja), `KPO knjiga — ${basename(putanja, '.csv')}`)), { izvoz: a }) :
      (() => { throw new Error('komanda: sledeci | naplata | izvoz'); })();
    console.log(JSON.stringify(rezultat, null, 2));
  } catch (e) {
    console.error(`kpo: ${e.message}`);
    process.exitCode = 1;
  }
}
