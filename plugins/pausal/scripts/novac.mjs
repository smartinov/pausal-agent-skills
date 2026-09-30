// Novac se računa u celim parama; nikad float.

export function uPare(tekst) {
  const s = String(tekst).trim().replace(/\s/g, '');
  if (!/^-?[\d.,]+$/.test(s)) throw new Error(`neispravan iznos: ${tekst}`);
  const znak = s.startsWith('-') ? -1 : 1;
  const bez = s.replace(/^-/, '');
  // Srpski oblik: tačke grupišu hiljade, zarez je decimalni. Bez zareza, tačka sa 1–2 cifre je decimalna.
  let ceo = bez, dec = '';
  if (bez.includes(',')) [ceo, dec] = [bez.slice(0, bez.lastIndexOf(',')), bez.slice(bez.lastIndexOf(',') + 1)];
  else if (/^\d+\.\d{1,2}$/.test(bez)) [ceo, dec] = bez.split('.');
  if (!/^\d{0,2}$/.test(dec) || !/^(\d+|[1-9]\d{0,2}(\.\d{3})+)$/.test(ceo)) {
    throw new Error(`neispravan iznos (hiljade 1.234.567, decimale najviše dve): ${tekst}`);
  }
  ceo = ceo.replace(/\./g, '');
  const pare = Number(ceo) * 100 + Number(dec.padEnd(2, '0') || 0);
  if (!Number.isSafeInteger(pare)) throw new Error(`iznos prevelik: ${tekst}`);
  return znak * pare;
}

export function izPara(pare) {
  const a = Math.abs(pare);
  return `${pare < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

export function formatRsd(pare) {
  const a = Math.abs(pare);
  const ceo = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${pare < 0 ? '-' : ''}${ceo},${String(a % 100).padStart(2, '0')}`;
}

// Iznos u parama strane valute × kurs (tekst sa tačkom, do 4 decimale) → RSD pare, pola na gore.
export function preracunaj(parevalute, kurs) {
  if (!/^\d+(\.\d{1,4})?$/.test(kurs) || !/[1-9]/.test(kurs)) throw new Error(`neispravan kurs: ${kurs}`);
  const [c, d = ''] = kurs.split('.');
  const k = BigInt(c + d.padEnd(4, '0'));
  const p = BigInt(parevalute);
  const a = (p < 0n ? -p : p) * k;
  const r = (a + 5000n) / 10000n;
  const rezultat = Number(p < 0n ? -r : r);
  if (!Number.isSafeInteger(rezultat)) throw new Error(`iznos prevelik: ${parevalute} × ${kurs}`);
  return rezultat;
}
