// Srednji kurs NBS za dati datum. Za neradni dan NBS vraća poslednju objavljenu listu,
// pa se uz kurs uvek vraća stvarni datum i broj liste. Koji datum važi za preračun
// prihoda: propis:kpo.kurs-datum.
//
// CLI: node kurs.mjs YYYY-MM-DD [EUR]
import { fileURLToPath } from 'node:url';

const NBS = 'https://webappcenter.nbs.rs/ExchangeRateWebApp/ExchangeRate';

export function parsirajNbs(csv) {
  const [, ...linije] = csv.trim().split(/\r?\n/);
  const kursevi = {};
  let lista, datum;
  for (const l of linije) {
    const [broj, dan, , , oznaka, vaziZa, srednji] = l.split(',').map((s) => s.trim());
    const [d, m, g] = dan.split('.');
    if ((lista && lista !== broj) || (datum && datum !== `${g}-${m}-${d}`)) throw new Error('NBS CSV meša više kursnih lista');
    if (!/^\d+(\.\d{1,4})?$/.test(srednji) || !/[1-9]/.test(srednji)) throw new Error(`neispravan kurs za ${oznaka}: ${srednji}`);
    lista = broj;
    datum = `${g}-${m}-${d}`;
    kursevi[oznaka] = { vaziZa: Number(vaziZa), srednji };
  }
  return { lista, datum, kursevi };
}

async function tekst(fetchFn, url) {
  const r = await fetchFn(url);
  if (!r.ok) throw new Error(`NBS je vratio ${r.status} za ${url}`);
  return r.text();
}

export async function dohvati(datum, valuta = 'EUR', fetchFn = fetch) {
  const [g, m, d] = datum.split('-');
  const strana = await tekst(fetchFn, `${NBS}/IndexByDate?isSearchExecuted=true&Date=${d}.${m}.${g}&ExchangeRateListTypeID=3`);
  const id = strana.match(/ExchangeRateListID=([0-9a-f-]+)&(?:amp;)?Format=csv/)?.[1];
  if (!id) throw new Error(`NBS nije vratio kursnu listu za ${datum}`);
  const lista = parsirajNbs(await tekst(fetchFn, `${NBS}/Download?ExchangeRateListID=${id}&Format=csv`));
  const k = lista.kursevi[valuta];
  if (!k) throw new Error(`valuta ${valuta} nije na listi ${lista.lista}`);
  // ponytail: samo valute koje važe za 1 jedinicu (EUR, USD, CHF...); HUF/JPY traže deljenje sa više decimala.
  if (k.vaziZa !== 1) throw new Error(`${valuta} se objavljuje za ${k.vaziZa} jedinica; nije podržano`);
  return { valuta, srednji: k.srednji, lista: lista.lista, datumListe: lista.datum, trazeniDatum: datum };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [datum, valuta = 'EUR'] = process.argv.slice(2);
  dohvati(datum, valuta)
    .then((k) => console.log(JSON.stringify(k, null, 2)))
    .catch((e) => { console.error(`kurs: ${e.message}; unesi kurs ručno sa kursne liste NBS`); process.exitCode = 1; });
}
