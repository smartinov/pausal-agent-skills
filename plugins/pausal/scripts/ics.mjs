// Rokovi paušalca za godinu, iz propisa: lista za Memory/schedule.md i .ics za kalendar.
// Pomeranje roka zbog neradnog dana nije primenjeno (propis:obaveze.neradni-dan).
//
// CLI: node ics.mjs <agencija.json> <godina> [izlaz.ics]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { izaberi, parsiraj, danasLokalno, PUTANJA } from './propisi.mjs';

const MESECI = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];
const dvocifreno = (n) => String(n).padStart(2, '0');

export function dogadjaji(agencija, propisi, { godina, danas }) {
  const lista = [];
  const preskoceno = [];
  const okolnosti = { osiguranje: agencija.osiguranje };
  // Datum obaveze zavisi od vrednosti propisa, pa se propis bira probnim datumom
  // i ponovo proverava na izračunatom datumu; promena usred godine preskače događaj.
  const naDan = (citat, probni, uDatum) => {
    const r = izaberi(propisi, citat, { datum: probni, danas, okolnosti });
    if (r.status !== 'ok') { preskoceno.push(`${citat} (${probni}): ${r.razlog}`); return null; }
    const datum = uDatum(r.vrednost);
    const r2 = izaberi(propisi, citat, { datum, danas, okolnosti });
    if (r2.status !== 'ok' || r2.vrednost !== r.vrednost) { preskoceno.push(`${citat} (${datum}): propis se razlikuje na datum obaveze`); return null; }
    return datum;
  };
  const neradni = izaberi(propisi, 'propis:obaveze.neradni-dan', { datum: `${godina}-01-01`, danas, okolnosti });
  const napomena = neradni.status === 'ok' ? '' : ' Ako rok pada na neradni dan, proveri da li se pomera (NEPROVERENO).';
  const registracija = agencija.datum_registracije ?? '';

  for (let m = 1; m <= 12; m++) {
    const prethodni = new Date(Date.UTC(godina, m - 2, 1));
    const obracunski = `${prethodni.getUTCFullYear()}-${dvocifreno(prethodni.getUTCMonth() + 1)}`;
    if (!registracija || obracunski < registracija.slice(0, 7)) continue;
    const datum = naDan('propis:obaveze.rok-mesecni', `${godina}-${dvocifreno(m)}-01`, (v) => `${godina}-${dvocifreno(m)}-${dvocifreno(v)}`);
    if (datum) lista.push({ datum, citat: 'propis:obaveze.rok-mesecni', naslov: `Porez i doprinosi za ${MESECI[prethodni.getUTCMonth()]} ${prethodni.getUTCFullYear()}`, opis: `Iznosi i uplatni računi su u rešenju Poreske uprave.${napomena}` });
  }

  const prijava = naDan('propis:eko-taksa.prijava', `${godina}-01-01`, (v) => { const s = String(v).padStart(4, '0'); return `${godina}-${s.slice(0, 2)}-${s.slice(2)}`; });
  if (prijava) lista.push({ datum: prijava, citat: 'propis:eko-taksa.prijava', naslov: 'Prijava eko-takse lokalnoj poreskoj administraciji', opis: `Naknada za zaštitu i unapređenje životne sredine.${napomena}` });
  for (const [m, opis] of [[1, 'IV tromesečje prethodne godine'], [4, 'I tromesečje'], [7, 'II tromesečje'], [10, 'III tromesečje']]) {
    const datum = naDan('propis:eko-taksa.placanje', `${godina}-${dvocifreno(m)}-01`, (v) => `${godina}-${dvocifreno(m)}-${dvocifreno(v)}`);
    if (datum) lista.push({ datum, citat: 'propis:eko-taksa.placanje', naslov: `Eko-taksa: ${opis}`, opis: `Iznos je u rešenju lokalne poreske administracije.${napomena}` });
  }
  if (agencija.osiguranje === 'zaposlen') {
    const datum = naDan('propis:doprinos.povracaj', `${godina}-03-01`, () => `${godina}-03-01`);
    if (datum) lista.push({ datum, citat: 'propis:doprinos.povracaj', naslov: `Povraćaj PIO za ${godina - 1}: zahtev PIO fondu za uverenje`, opis: 'Samo ako je zbir osnovica (zarada + paušal) prešao najvišu godišnju osnovicu; zatim Obrazac 2 Poreskoj upravi.' });
  }
  // Obaveze sa rokom pre registracije ne postoje; mesečne su već filtrirane po obračunskom mesecu.
  const posle = lista.filter((d) => d.citat === 'propis:obaveze.rok-mesecni' || d.datum >= registracija);
  posle.sort((a, b) => a.datum.localeCompare(b.datum));
  return { lista: posle, preskoceno };
}

const tekstIcs = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

// RFC 5545: linija najviše 75 okteta, nastavak počinje razmakom.
function savij(linija) {
  const delovi = [];
  let tekuci = '';
  for (const znak of linija) {
    const granica = delovi.length === 0 ? 75 : 74;
    if (Buffer.byteLength(tekuci + znak) > granica) { delovi.push(tekuci); tekuci = ''; }
    tekuci += znak;
  }
  delovi.push(tekuci);
  return delovi.join('\r\n ');
}

export function uIcs(lista, danas) {
  const linije = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//pausal-agent-skills//SR', 'CALSCALE:GREGORIAN'];
  for (const d of lista) {
    const [g, m, dan] = d.datum.split('-').map(Number);
    const sutra = new Date(Date.UTC(g, m - 1, dan + 1)).toISOString().slice(0, 10);
    linije.push(
      'BEGIN:VEVENT',
      `UID:${createHash('sha256').update(`${d.datum}${d.naslov}`).digest('hex').slice(0, 24)}@pausal`,
      `DTSTAMP:${danas.replace(/-/g, '')}T000000Z`,
      `DTSTART;VALUE=DATE:${d.datum.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${sutra.replace(/-/g, '')}`,
      `SUMMARY:${tekstIcs(d.naslov)}`,
      `DESCRIPTION:${tekstIcs(`${d.opis} Izvor: ${d.citat}.`)}`,
      'BEGIN:VALARM', 'TRIGGER:-P3D', 'ACTION:DISPLAY', `DESCRIPTION:${tekstIcs(d.naslov)}`, 'END:VALARM',
      'END:VEVENT',
    );
  }
  linije.push('END:VCALENDAR');
  return linije.map(savij).join('\r\n') + '\r\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [agencijaPutanja, godina, izlaz] = process.argv.slice(2);
  const danas = danasLokalno();
  const r = dogadjaji(JSON.parse(readFileSync(agencijaPutanja, 'utf8')), parsiraj(readFileSync(PUTANJA, 'utf8')), { godina: Number(godina), danas });
  if (izlaz) writeFileSync(izlaz, uIcs(r.lista, danas));
  console.log(JSON.stringify(r, null, 2));
}
