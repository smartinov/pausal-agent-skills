// Stanje prometa prema limitima: propis:limit.pausal (kalendarska godina, meri se za pravo
// na paušal naredne godine; posledica tokom godine: propis:limit.pausal-tokom-godine) i
// propis:limit.pdv (klizećih 12 meseci). Promet se vodi po datumu prometa, bez storniranih.
//
// CLI: node limiti.mjs <kpo.csv> [<kpo-prethodna.csv> ...] [--danas=YYYY-MM-DD]
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uPare } from './novac.mjs';
import { izaberi, parsiraj, danasLokalno, PUTANJA } from './propisi.mjs';
import { ucitaj } from './kpo.mjs';

// Praksa, ne propis: upozorenje od 70% praga.
const UPOZORENJE_BP = 7000;

function redniDan(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return Math.round((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;
}

function danaUGodini(godina) {
  return (godina % 4 === 0 && godina % 100 !== 0) || godina % 400 === 0 ? 366 : 365;
}

function preGodinu(iso) {
  return `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;
}

function zbir(redovi) {
  return redovi.reduce((s, r) => s + uPare(r.ukupno_rsd), 0);
}

function limit(promet, pravilo, dodatno = {}) {
  const prag = pravilo.status === 'ok' ? pravilo.vrednost : null;
  const udeoBp = prag ? Math.floor((promet * 10000) / prag) : null;
  return {
    citat: `propis:${pravilo.id}`, status: pravilo.status, razlog: pravilo.razlog, prag, promet, udeoBp,
    napomena: 'isključenja iz prometa navedena u propisu nisu primenjena automatski; proveri ih ako postoje',
    ...dodatno,
  };
}

// danas = datum izveštaja; sada = stvarni današnji datum, po kom ističe revizija propisa.
// godine = godine čiji je KPO učitan; bez prethodne godine klizni PDV prozor je nepotpun.
export function stanje(kpo, propisi, { danas, sada = danasLokalno(), okolnosti = {}, godine }) {
  const izdate = kpo.filter((r) => r.status !== 'stornirana');
  const godina = danas.slice(0, 4);
  const tekuca = izdate.filter((r) => r.datum_prometa.startsWith(godina) && r.datum_prometa <= danas);
  const zadnjih12 = izdate.filter((r) => r.datum_prometa > preGodinu(danas) && r.datum_prometa <= danas);

  const promet = zbir(tekuca);
  const projekcija = Math.round((promet * danaUGodini(Number(godina))) / redniDan(danas));
  const pausal = limit(promet, izaberi(propisi, 'propis:limit.pausal', { datum: danas, danas: sada, okolnosti }), { projekcija });
  pausal.upozorenje = pausal.prag !== null && (pausal.udeoBp >= UPOZORENJE_BP || projekcija > pausal.prag);

  const pdv = limit(zbir(zadnjih12), izaberi(propisi, 'propis:limit.pdv', { datum: danas, danas: sada, okolnosti }));
  pdv.upozorenje = pdv.prag !== null && pdv.udeoBp >= UPOZORENJE_BP;
  const nedostaju = godine ? [Number(godina) - 1, Number(godina)].filter((g) => !godine.includes(g)) : [];
  if (nedostaju.length) pdv.nepotpuno = `KPO za ${nedostaju.join(' i ')} nije učitan; promet u 12 meseci može biti veći`;
  if (godine && !godine.includes(Number(godina))) pausal.nepotpuno = `KPO za ${godina} nije učitan`;

  const poKlijentu = new Map();
  for (const r of zadnjih12) poKlijentu.set(r.klijent, (poKlijentu.get(r.klijent) ?? 0) + uPare(r.ukupno_rsd));
  const ukupno12 = zbir(zadnjih12);
  const klijenti = [...poKlijentu]
    .map(([klijent, p]) => ({ klijent, promet: p, udeoBp: ukupno12 ? Math.floor((p * 10000) / ukupno12) : 0 }))
    .sort((a, b) => b.promet - a.promet);

  return { danas, pausal, pdv, klijenti };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const danasArg = args.find((a) => a.startsWith('--danas='));
  const sada = danasLokalno();
  const danas = danasArg?.split('=')[1] ?? sada;
  const putanje = args.filter((a) => !a.startsWith('--'));
  for (const p of putanje) if (!existsSync(p)) console.error(`limiti: ${p} ne postoji; preskočen`);
  const ucitane = putanje.filter((p) => existsSync(p));
  const godine = ucitane.map((p) => Number(basename(p).match(/(\d{4})/)?.[1])).filter(Boolean);
  const kpo = ucitane.flatMap((p) => ucitaj(p));
  console.log(JSON.stringify(stanje(kpo, parsiraj(readFileSync(PUTANJA, 'utf8')), { danas, sada, godine }), null, 2));
}
