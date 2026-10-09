// A gate that is present but weakened proves nothing. The exact package.json scripts, the exact final run command of every Task 2
// job and the exact .prettierignore scope are pinned in catalogue.mjs. These tests run the real files against the pins.
// They do not claim CI can prove its own integrity against a change that edits the guard and its tests together: the gate-defining
// root files are self-modifying paths (Task 1 notice) and the engineering authority reads the actual diff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { EXPECTED_PRETTIER_IGNORE, EXPECTED_RUNS, EXPECTED_SCRIPTS, checkGateDefinitions } from '../lib/catalogue.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const world = () => {
  const dir = join(root, '.github/workflows');
  return {
    packageJson: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')),
    workflows: Object.fromEntries(readdirSync(dir).map((f) => [`.github/workflows/${f}`, parse(readFileSync(join(dir, f), 'utf8'))])),
    prettierIgnoreText: readFileSync(join(root, '.prettierignore'), 'utf8'),
  };
};
const has = (v, re) => v.some((x) => re.test(x));

test('the real package.json scripts, workflow run commands and .prettierignore match the pins', () => {
  assert.deepEqual(checkGateDefinitions(world()), []);
});

test('weakening any pinned package.json script fails (including "lint": "true" and "check:gates": "node -e 0")', () => {
  for (const name of Object.keys(EXPECTED_SCRIPTS)) {
    for (const weak of ['true', 'node -e 0', 'echo ok', `${EXPECTED_SCRIPTS[name]} || true`, '']) {
      const w = world();
      w.packageJson.scripts[name] = weak;
      assert.ok(
        has(checkGateDefinitions(w), new RegExp(`script "${name.replace(':', ':')}" must be exactly`)),
        `${name} -> ${JSON.stringify(weak)}`,
      );
    }
    const w = world();
    delete w.packageJson.scripts[name];
    assert.ok(has(checkGateDefinitions(w), new RegExp(`script "${name}" must be exactly`)), `${name} removed`);
  }
  const w = world();
  w.packageJson.scripts.lint = 'true';
  w.packageJson.scripts['check:gates'] = 'node -e 0';
  const v = checkGateDefinitions(w);
  assert.ok(has(v, /script "lint" must be exactly "eslint \."/));
  assert.ok(has(v, /script "check:gates" must be exactly/));
});

test('weakening the final run command of any Task 2 job fails; so does removing the job or its steps', () => {
  for (const { file, job, fromEnd = 1 } of EXPECTED_RUNS) {
    for (const weak of ['true', 'echo skipped', 'exit 0']) {
      const w = world();
      const steps = w.workflows[file].jobs[job].steps;
      steps[steps.length - fromEnd].run = weak;
      assert.ok(has(checkGateDefinitions(w), new RegExp(`${job}": step .* must run exactly`)), `${job} -> ${weak}`);
    }
    const w = world();
    delete w.workflows[file].jobs[job];
    assert.ok(has(checkGateDefinitions(w), new RegExp(`${job}": step .* must run exactly`)), `${job} removed`);
    const w2 = world();
    w2.workflows[file].jobs[job].steps = [];
    assert.ok(has(checkGateDefinitions(w2), new RegExp(`${job}": step .* must run exactly`)), `${job} without steps`);
  }
  // a trailing step that is not a run (for example an action) hides the real command from the "last step" pin
  const w = world();
  w.workflows['.github/workflows/ci.yml'].jobs.lint.steps.push({ uses: './x' });
  assert.ok(has(checkGateDefinitions(w), /job "lint": step last must run exactly/));
});

test('a final run that merely contains the command, or adds a suffix, is not the pinned command', () => {
  const w = world();
  const steps = w.workflows['.github/workflows/ci.yml'].jobs.lint.steps;
  steps[steps.length - 1].run = 'corepack pnpm run lint || true';
  assert.ok(has(checkGateDefinitions(w), /job "lint"/));
  steps[steps.length - 1].run = 'corepack pnpm run lint\ntrue';
  assert.ok(has(checkGateDefinitions(w), /job "lint"/));
});

test('.prettierignore: a catch-all or any new exclusion is detected, and so is a missing expected pattern', () => {
  for (const extra of [
    '*',
    '**',
    '**/*',
    '/*',
    '*.ts',
    '*.mjs',
    'src/',
    'tests/',
    'scripts/',
    'scripts/governance/ci-gates/',
    '.github/',
    'package.json',
    '!docs/',
  ]) {
    const w = world();
    w.prettierIgnoreText += `\n${extra}\n`;
    assert.ok(has(checkGateDefinitions(w), /\.prettierignore: unexpected pattern/), extra);
  }
  for (const missing of EXPECTED_PRETTIER_IGNORE) {
    const w = world();
    w.prettierIgnoreText = w.prettierIgnoreText
      .split('\n')
      .filter((l) => l.trim() !== missing)
      .join('\n');
    assert.ok(
      has(checkGateDefinitions(w), new RegExp(`expected pattern "${missing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" is missing`)),
      missing,
    );
  }
  const w = world();
  w.prettierIgnoreText = null;
  assert.ok(has(checkGateDefinitions(w), /\.prettierignore: missing/));
  const w2 = world();
  w2.prettierIgnoreText += '\n# a comment is fine\n\n';
  assert.deepEqual(checkGateDefinitions(w2), []);
});
