// Instalira plugin u izolovane Claude Code i Codex home foldere i proverava da je
// instalirana kopija potpuna. Samo lokalno: traži oba CLI-ja.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const marketplace = 'pausal-agent-skills';
const plugin = 'pausal';
const skills = readdirSync(join(repo, 'plugins', plugin, 'skills')).sort();

const root = mkdtempSync(join(tmpdir(), 'pausal smoke '));
const home = join(root, 'home');
const claudeHome = join(root, 'claude');
const codexHome = join(root, 'codex');
for (const dir of [home, claudeHome, codexHome, join(root, 'tmp')]) mkdirSync(dir);

const env = {
  PATH: process.env.PATH,
  HOME: home,
  TMPDIR: join(root, 'tmp'),
  LC_ALL: 'C',
  CLAUDE_CONFIG_DIR: claudeHome,
  CODEX_HOME: codexHome,
};

function run(label, cmd, args) {
  const r = spawnSync(cmd, args, { env, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`${label} failed (exit ${r.status})\n${(r.stdout ?? '').slice(-2000)}\n${(r.stderr ?? '').slice(-2000)}`);
    throw new Error(label);
  }
  console.log(`ok: ${label}`);
}

// Koren instaliranog plugin-a je folder koji sadrži reference/propisi.md.
function installedRoots(base) {
  return readdirSync(base, { recursive: true })
    .filter((p) => p.endsWith(`reference${sep}propisi.md`))
    .map((p) => join(base, dirname(dirname(p))));
}

function checkInstalled(client, base) {
  const roots = installedRoots(base);
  if (roots.length === 0) throw new Error(`${client}: no installed reference/propisi.md under ${base}`);
  for (const r of roots) {
    const found = skills.filter((s) => existsSync(join(r, 'skills', s, 'SKILL.md')));
    if (found.length !== skills.length) {
      throw new Error(`${client}: ${r} has skills [${found}] instead of [${skills}]`);
    }
    const missing = ['scripts/faktura.mjs', 'scripts/init.mjs', 'template/AGENTS.md', 'template/gitignore', 'template/Sabloni/faktura.html']
      .filter((p) => !existsSync(join(r, ...p.split('/'))));
    if (missing.length) throw new Error(`${client}: ${r} is missing ${missing.join(', ')}`);
  }
  console.log(`ok: ${client} installed copy has reference, ${skills.length} skills, scripts and template`);
}

try {
  run('claude plugin validate --strict', 'claude', ['plugin', 'validate', repo, '--strict']);
  run('claude marketplace add', 'claude', ['plugin', 'marketplace', 'add', repo, '--scope', 'user']);
  run('claude plugin install', 'claude', ['plugin', 'install', `${plugin}@${marketplace}`, '--scope', 'user']);
  checkInstalled('claude', claudeHome);

  run('codex marketplace add', 'codex', ['plugin', 'marketplace', 'add', repo, '--json']);
  run('codex plugin add', 'codex', ['plugin', 'add', `${plugin}@${marketplace}`, '--json']);
  checkInstalled('codex', codexHome);
} catch (e) {
  console.error(`smoke: ${e.message}`);
  process.exitCode = 1;
} finally {
  rmSync(root, { recursive: true, force: true });
}
