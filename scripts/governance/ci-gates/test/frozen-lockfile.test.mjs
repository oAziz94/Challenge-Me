// Frozen-lockfile enforcement, proven with the real package manager: when package.json no longer matches the lockfile,
// `pnpm install --frozen-lockfile` fails and leaves the lockfile untouched. Needs corepack and the pinned pnpm (cached or
// downloadable); when pnpm cannot be started the tests are SKIPPED with a message, never reported as passed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const env = { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', CI: 'true' };

const pnpm = (cwd, ...args) => {
  const r = spawnSync('corepack', ['pnpm', ...args], { cwd, env, encoding: 'utf8', shell: process.platform === 'win32', timeout: 180000 });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, error: r.error };
};

function project(deps) {
  const dir = mkdtempSync(join(tmpdir(), 'cm-frozen-'));
  const manifest = { name: 'frozen-probe', version: '0.0.0', private: true, packageManager: pkg.packageManager, devDependencies: deps };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2));
  return {
    dir,
    manifest,
    setDeps: (d) => writeFileSync(join(dir, 'package.json'), JSON.stringify({ ...manifest, devDependencies: d }, null, 2)),
  };
}

test('a lockfile that matches package.json installs frozen; one that does not is refused and left unchanged', (t) => {
  const p = project({});
  try {
    const gen = pnpm(p.dir, 'install', '--lockfile-only', '--ignore-scripts');
    if (gen.error || gen.code !== 0) {
      t.skip(
        `pnpm could not be started here, so frozen-lockfile enforcement was NOT tested (${String(gen.error?.code ?? gen.out).slice(0, 120)})`,
      );
      return;
    }
    const lockPath = join(p.dir, 'pnpm-lock.yaml');
    const before = readFileSync(lockPath, 'utf8');

    const ok = pnpm(p.dir, 'install', '--frozen-lockfile', '--ignore-scripts', '--ignore-pnpmfile');
    assert.equal(ok.code, 0, `an unchanged manifest installs: ${ok.out}`);
    assert.equal(readFileSync(lockPath, 'utf8'), before);

    p.setDeps({ 'left-pad': '1.3.0' }); // the manifest now asks for something the lockfile does not contain
    const refused = pnpm(p.dir, 'install', '--frozen-lockfile', '--ignore-scripts', '--ignore-pnpmfile');
    assert.notEqual(refused.code, 0, `a lockfile that would change must fail the install: ${refused.out}`);
    assert.match(refused.out, /lockfile|frozen/i);
    assert.equal(readFileSync(lockPath, 'utf8'), before, 'the lockfile is not rewritten');
  } finally {
    rmSync(p.dir, { recursive: true, force: true });
  }
});

test('CI environment defaults do not hide the flag: the install scripts always pass --frozen-lockfile, --ignore-scripts and --ignore-pnpmfile explicitly', () => {
  for (const rel of ['scripts/governance/ci-gates/ci-setup.sh', 'Dockerfile']) {
    const text = readFileSync(join(root, rel), 'utf8');
    const installs = text.split('\n').filter((l) => /\bpnpm\s+install\b/.test(l) && !l.trim().startsWith('#'));
    assert.ok(installs.length >= 1, `${rel} installs dependencies`);
    for (const l of installs) {
      assert.match(l, /--frozen-lockfile/);
      assert.match(l, /--ignore-scripts/);
      assert.match(l, /--ignore-pnpmfile/);
    }
  }
});
