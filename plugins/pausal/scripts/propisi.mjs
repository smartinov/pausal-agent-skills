// Čita reference/propisi.md i vraća vrednost propisa samo kad je tačno jedna
// primenljiva verzija proverena i neistekla; inače NEPROVERENO sa razlogom.
//
// CLI: node propisi.mjs propis:<id> [--datum=YYYY-MM-DD] [--kljuc=vrednost ...]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const KOLONE = {
  'ID': 'id', 'Pravilo': 'pravilo', 'Vrednost': 'vrednost', 'Period': 'period',
  'Važi za': 'vaziZa', 'Primena od': 'od', 'Primena do': 'do', 'Izvor': 'izvor',
  'Status': 'status', 'Provereno': 'provereno', 'Revizija': 'revizija',
};
const PERIODI = ['', 'kalendarska-godina', 'klizecih-12-meseci', 'mesec', 'dogadjaj'];
const STATUSI = ['verified', 'unverified', 'disputed'];
const ID = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export const PUTANJA = fileURLToPath(new URL('../reference/propisi.md', import.meta.url));

function celije(linija) {
  return linija.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

// Ćelije ne smeju da sadrže znak |.
export function parsiraj(md) {
  const redovi = [];
  let kljucevi = null;
  for (const linija of md.split('\n')) {
    if (!linija.trim().startsWith('|')) { kljucevi = null; continue; }
    const c = celije(linija);
    if (!kljucevi) {
      kljucevi = c.every((h) => h in KOLONE) ? c.map((h) => KOLONE[h]) : null;
      continue;
    }
    if (c.every((x) => /^:?-+:?$/.test(x))) continue;
    redovi.push(Object.fromEntries(kljucevi.map((k, i) => [k, c[i] ?? ''])));
  }
  return redovi;
}

function uslovi(vaziZa) {
  if (vaziZa === 'svi') return {};
  return Object.fromEntries(vaziZa.split(';').map((u) => u.trim().split('=').map((s) => s.trim())));
}

function datumOk(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(d);
}

function vazi(red, datum) {
  return red.od <= datum && (red.do === '' || datum <= red.do);
}

export function izaberi(redovi, citat, { datum, danas, okolnosti = {} }) {
  if (!citat.startsWith('propis:')) throw new Error(`citat mora počinjati sa propis: (${citat})`);
  const id = citat.slice('propis:'.length);
  if (!datumOk(datum) || !datumOk(danas)) throw new Error(`neispravan datum: ${datum} / ${danas}`);
  const kandidati = [];
  for (const red of redovi.filter((r) => r.id === id && vazi(r, datum))) {
    const u = uslovi(red.vaziZa);
    const nepoznata = Object.keys(u).find((k) => !(k in okolnosti));
    if (nepoznata) return { status: 'NEPROVERENO', id, razlog: `nedostaje okolnost ${nepoznata}` };
    if (Object.entries(u).every(([k, v]) => okolnosti[k] === v)) kandidati.push(red);
  }
  if (kandidati.length === 0) return { status: 'NEPROVERENO', id, razlog: `nema primenljive verzije za ${datum}` };
  if (kandidati.length > 1) return { status: 'NEPROVERENO', id, razlog: 'više primenljivih verzija' };
  const red = kandidati[0];
  const razlog =
    proveri([red]).length ? `red nije ispravan: ${proveri([red]).join('; ')}` :
    red.status !== 'verified' ? `status ${red.status}` :
    !red.izvor ? 'nema izvor' :
    !(red.revizija > danas) ? `revizija istekla ${red.revizija}` : null;
  if (razlog) return { status: 'NEPROVERENO', id, razlog, red };
  return { status: 'ok', id, vrednost: red.vrednost === '' ? null : Number(red.vrednost), red };
}

export function proveri(redovi) {
  const greske = [];
  for (const r of redovi) {
    const g = (poruka) => greske.push(`${r.id}: ${poruka}`);
    if (!ID.test(r.id)) g('ID mora biti oblika grupa.naziv, mala slova');
    if (r.vrednost !== '' && !(/^-?\d+$/.test(r.vrednost) && Number.isSafeInteger(Number(r.vrednost)))) g('vrednost mora biti ceo broj (pare ili bazni poeni)');
    if (!PERIODI.includes(r.period)) g(`nepoznat period ${r.period}`);
    if (r.vaziZa !== 'svi' && !r.vaziZa.split(';').every((u) => /^\s*[a-z-]+=[a-z0-9-]+\s*$/.test(u))) g('Važi za mora biti svi ili kljuc=vrednost; ...');
    else if (r.vaziZa !== 'svi' && new Set(r.vaziZa.split(';').map((u) => u.split('=')[0].trim())).size !== r.vaziZa.split(';').length) g('Važi za ima isti ključ dvaput');
    if (!datumOk(r.od)) g(`neispravan datum primene od ${r.od}`);
    if (r.do !== '' && (!datumOk(r.do) || r.do < r.od)) g(`neispravan datum primene do ${r.do}`);
    if (!STATUSI.includes(r.status)) g(`nepoznat status ${r.status}`);
    if (r.status === 'verified' && (!r.izvor || !datumOk(r.provereno) || !datumOk(r.revizija))) g('verified traži izvor, datum provere i datum revizije');
  }
  // ponytail: preklapanje se traži samo za isti "Važi za" ili "svi"; različiti ključevi se smatraju disjunktnim.
  for (let i = 0; i < redovi.length; i++) {
    for (let j = i + 1; j < redovi.length; j++) {
      const [a, b] = [redovi[i], redovi[j]];
      if (a.id !== b.id) continue;
      if (a.vaziZa !== b.vaziZa && a.vaziZa !== 'svi' && b.vaziZa !== 'svi') continue;
      const krajA = a.do || '9999-12-31';
      const krajB = b.do || '9999-12-31';
      if (a.od <= krajB && b.od <= krajA) greske.push(`${a.id}: preklapaju se verzije od ${a.od} i od ${b.od}`);
    }
  }
  return greske;
}

export function danasLokalno() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [citat, ...opcije] = process.argv.slice(2);
  const danas = danasLokalno();
  const okolnosti = {};
  let datum = danas;
  for (const o of opcije) {
    const [k, v] = o.replace(/^--/, '').split('=');
    if (k === 'datum') datum = v; else okolnosti[k] = v;
  }
  const rezultat = izaberi(parsiraj(readFileSync(PUTANJA, 'utf8')), citat, { datum, danas, okolnosti });
  console.log(JSON.stringify(rezultat, null, 2));
  if (rezultat.status !== 'ok') process.exitCode = 2;
}
