// Jednokratan prelaz postojeće evidencije u KPO format ovog plugin-a. Ništa ne pogađa:
// nepoznat oblik ruši migraciju, a neslaganja idu u upozorenja za korisnika.
// Podržan izvor: CSV sa ; i kolonama STARO_ZAGLAVLJE, datumi DD.MM.YYYY, decimalni zarez.
//
// CLI: node migracija.mjs <stari.csv> <novi-kpo.csv>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsirajCsv, pisiCsv } from './kpo.mjs';
import { uPare, izPara, preracunaj } from './novac.mjs';

const STARO_ZAGLAVLJE = 'rb;broj_fakture;datum_izdavanja;datum_prometa;klijent;opis;iznos_eur;kurs_nbs;prihod_usluge_rsd;ukupno_rsd;rok_placanja;datum_naplate;napomena';

function iso(d, gde) {
  if (d === '') return '';
  const m = d.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const rezultat = `${m?.[3]}-${m?.[2]}-${m?.[1]}`;
  if (!m || new Date(`${rezultat}T00:00:00Z`).toISOString().slice(0, 10) !== rezultat) throw new Error(`${gde}: datum ${d} nije ispravan DD.MM.YYYY`);
  return rezultat;
}

function obavezan(v, sta) {
  if (!v) throw new Error(`${sta} nedostaje`);
  return v;
}

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'dj').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Ručno vođen stari CSV često nije ispravan CSV (navodnik u tekstu, ; u napomeni bez navodnika).
// Tada se čita doslovno: navodnici su obični znaci, a višak polja pripada napomeni, poslednjoj koloni.
function citajStari(tekst, upozorenja) {
  try {
    return parsirajCsv(tekst);
  } catch (e) {
    upozorenja.push(`fajl nije ispravan CSV (${e.message}); pročitan doslovno, proveri napomene`);
    const [zaglavlje, ...linije] = tekst.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => l.split(';'));
    const redovi = linije.map((l, i) => {
      if (l.length < zaglavlje.length) throw new Error(`red ${i + 1}: ${l.length} polja umesto ${zaglavlje.length}`);
      if (l.length > zaglavlje.length) upozorenja.push(`red ${i + 1}: ${l.length - zaglavlje.length} ; u napomeni, spojeno u napomenu`);
      return [...l.slice(0, zaglavlje.length - 1), l.slice(zaglavlje.length - 1).join(';')];
    });
    return { zaglavlje, redovi };
  }
}

export function prevedi(tekst) {
  const upozorenja = [];
  const { zaglavlje, redovi } = citajStari(tekst, upozorenja);
  if (zaglavlje.join(';') !== STARO_ZAGLAVLJE) throw new Error(`nepoznato zaglavlje: ${zaglavlje.join(';')}`);
  const novi = redovi.map((l) => {
    const s = Object.fromEntries(zaglavlje.map((k, i) => [k, l[i]]));
    const gde = `faktura ${s.broj_fakture}`;
    const eur = s.iznos_eur ? uPare(s.iznos_eur) : null;
    const kurs = s.kurs_nbs.replace(',', '.');
    const usluge = uPare(s.prihod_usluge_rsd);
    const ukupno = uPare(s.ukupno_rsd);
    if (usluge !== ukupno) upozorenja.push(`${gde}: prihod od usluga ${s.prihod_usluge_rsd} ≠ ukupno ${s.ukupno_rsd}`);
    if (eur !== null && preracunaj(eur, kurs) !== ukupno) upozorenja.push(`${gde}: ${s.iznos_eur} EUR × ${s.kurs_nbs} ≠ ukupno ${s.ukupno_rsd}`);
    if (/storn/i.test(s.napomena)) upozorenja.push(`${gde}: napomena pominje storno; status ostaje izdata dok korisnik ne potvrdi`);
    return {
      rb: s.rb, broj_fakture: s.broj_fakture, datum_izdavanja: obavezan(iso(s.datum_izdavanja, gde), `${gde}: datum izdavanja`), datum_prometa: obavezan(iso(s.datum_prometa, gde), `${gde}: datum prometa`),
      klijent: slug(s.klijent), opis: s.opis, valuta: eur === null ? 'RSD' : 'EUR', iznos_valuta: izPara(eur ?? ukupno),
      kurs_nbs: eur === null ? '' : kurs, kursna_lista: '', prihod_proizvodi_rsd: '0.00', prihod_usluge_rsd: izPara(usluge),
      ukupno_rsd: izPara(ukupno), rok_placanja: iso(s.rok_placanja, gde), datum_naplate: iso(s.datum_naplate, gde),
      status: 'izdata', nacrt_id: `migracija-${s.broj_fakture}`, napomena: s.napomena,
    };
  });
  return { redovi: novi, upozorenja, zbirStari: redovi.reduce((z, l) => z + uPare(l[zaglavlje.indexOf('ukupno_rsd')]), 0) };
}

export function migriraj(stari, novi) {
  if (existsSync(novi)) throw new Error(`${novi} već postoji; migracija ne prepisuje postojeći KPO`);
  const { redovi, upozorenja, zbirStari } = prevedi(readFileSync(stari, 'utf8'));
  writeFileSync(novi, pisiCsv(redovi), { flag: 'wx' });
  const zbirNovi = redovi.reduce((z, r) => z + uPare(r.ukupno_rsd), 0);
  return { redova: redovi.length, zbirStari, zbirNovi, upozorenja };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const r = migriraj(...process.argv.slice(2, 4));
    console.log(JSON.stringify({ ...r, zbirStari: izPara(r.zbirStari), zbirNovi: izPara(r.zbirNovi) }, null, 2));
  } catch (e) {
    console.error(`migracija: ${e.message}`);
    process.exitCode = 1;
  }
}
