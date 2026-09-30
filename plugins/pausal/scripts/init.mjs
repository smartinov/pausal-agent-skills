// Pravi radni prostor agencije iz template/. Odredište se proverava pre nego što
// agent pita za lične podatke: nikad unutar plugin-a, njegove instalacije ili ovog repoa.
//
// CLI: node init.mjs proveri <odrediste>
//      node init.mjs napravi <odrediste>
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, writeFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = fileURLToPath(new URL('../', import.meta.url));
const FOLDERI = ['Finansije/Fakture', 'Finansije/KPO', 'Klijenti', 'Banka/Izvodi', 'Poreska'];
const PRAZNA_AGENCIJA = {
  poslovno_ime: '', naziv: '', adresa: '', mesto: '', pib: '', mb: '', sifra_delatnosti: '',
  osiguranje: '', datum_registracije: '', email: '', telefon: '', rok_placanja_dana: 30,
  racuni: [{ valuta: 'RSD', broj: '', banka: '' }],
};

// Najduži postojeći predak, razrešen kroz simlinkove, da poređenje putanja bude pouzdano.
function stvarna(p) {
  let d = resolve(p);
  const ostatak = [];
  while (!existsSync(d)) { ostatak.unshift(basename(d)); d = dirname(d); }
  return join(realpathSync(d), ...ostatak);
}

const unutar = (dete, roditelj) => dete === roditelj || dete.startsWith(roditelj.endsWith(sep) ? roditelj : roditelj + sep);

function preci(p) {
  const lista = [];
  for (let d = p; ; d = dirname(d)) { lista.push(d); if (dirname(d) === d) return lista; }
}

export function proveriOdrediste(odrediste, plugin = PLUGIN) {
  const dest = stvarna(odrediste);
  const koren = stvarna(plugin);
  const upozorenja = [];
  if (unutar(dest, koren)) return { ok: false, razlog: 'odredište je unutar plugin-a; izaberi folder van instalacije', upozorenja };
  for (const d of preci(dest)) {
    if (existsSync(join(d, '.claude-plugin', 'plugin.json')) || existsSync(join(d, '.codex-plugin', 'plugin.json')) || existsSync(join(d, '.claude-plugin', 'marketplace.json'))) {
      return { ok: false, razlog: `odredište je unutar plugin-a ili marketplace repoa (${d}); lični podaci ne smeju tamo`, upozorenja };
    }
    if (existsSync(join(d, '.git'))) upozorenja.push(`odredište je u git repou (${d}); repo mora biti privatan`);
  }
  if (existsSync(dest) && readdirSync(dest).some((f) => !['.git', '.DS_Store'].includes(f))) {
    return { ok: false, razlog: 'odredište nije prazno; izaberi prazan ili nov folder', upozorenja };
  }
  return { ok: true, odrediste: dest, upozorenja };
}

export function napravi(odrediste, plugin = PLUGIN) {
  const r = proveriOdrediste(odrediste, plugin);
  if (!r.ok) return r;
  cpSync(join(plugin, 'template'), r.odrediste, { recursive: true, errorOnExist: true, force: false });
  renameSync(join(r.odrediste, 'gitignore'), join(r.odrediste, '.gitignore'));
  writeFileSync(join(r.odrediste, 'agencija.json'), JSON.stringify(PRAZNA_AGENCIJA, null, 2) + '\n');
  for (const f of FOLDERI) mkdirSync(join(r.odrediste, f), { recursive: true });
  return r;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [komanda, odrediste] = process.argv.slice(2);
  const r = komanda === 'napravi' ? napravi(odrediste) : proveriOdrediste(odrediste);
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exitCode = 1;
}
