#!/usr/bin/env node
// The CI meta-gate (Foundation Task 2; STACK-ADR-002 section 8): fails when a required gate is missing, when a workflow
// or image definition breaks the supply-chain and permission policy, or when a "pending" gate is not backed by an
// accepted, still-open prerequisite. Pending gates are listed in every run and are never reported as passed.
//
// Usage: node scripts/governance/ci-gates/check-gates.mjs [--list-required-checks]
// Exit 0 = consistent (pending gates are listed); 1 = a violation; 2 = the gate itself could not run (never a pass).
import { existsSync, readFileSync, readdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCatalogue, checkGateDefinitions } from './lib/catalogue.mjs';
import { listRepositoryFiles } from './lib/repo-files.mjs';
import { checkSupplyChain } from './lib/supply-chain.mjs';
import { checkDockerfile, checkInstallCommands, checkWorkflow, commandLines } from './lib/workflow-policy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const maybe = (rel) => (existsSync(join(root, rel)) ? read(rel) : null);

function main() {
  const catalogue = JSON.parse(read('scripts/governance/ci-gates/gates.json'));
  const exceptions = JSON.parse(read('scripts/governance/ci-gates/install-script-exceptions.json'));
  const allowedActions = Array.isArray(catalogue.allowedActions) ? catalogue.allowedActions : [];

  const wfDir = '.github/workflows';
  const files = existsSync(join(root, wfDir))
    ? readdirSync(join(root, wfDir))
        .filter((f) => /\.ya?ml$/.test(f))
        .sort()
    : [];
  const errors = [];
  const workflows = {};
  const workflowEnv = {};
  for (const f of files) {
    const rel = `${wfDir}/${f}`;
    const { violations, doc } = checkWorkflow({ file: rel, text: read(rel), allowedActions });
    errors.push(...violations);
    workflows[rel] = doc;
    workflowEnv[rel] = doc && typeof doc.env === 'object' && doc.env ? doc.env : {};
  }
  const dockerfile = maybe('Dockerfile');
  if (dockerfile !== null) errors.push(...checkDockerfile({ file: 'Dockerfile', text: dockerfile }));

  // The repository's own install scripts follow the same install rules as workflows and the Dockerfile.
  const scriptDir = 'scripts/governance/ci-gates';
  for (const f of readdirSync(join(root, scriptDir)).filter((n) => n.endsWith('.sh'))) {
    errors.push(...checkInstallCommands(commandLines(read(`${scriptDir}/${f}`)), `${scriptDir}/${f}`));
  }

  const result = checkCatalogue({ catalogue, workflows });
  errors.push(...result.errors);
  errors.push(
    ...checkGateDefinitions({ packageJson: JSON.parse(read('package.json')), workflows, prettierIgnoreText: maybe('.prettierignore') }),
  );

  if (process.argv.includes('--list-required-checks')) {
    console.log(result.required.join('\n'));
    return errors.length === 0 ? 0 : 1;
  }

  errors.push(
    ...checkSupplyChain({
      packageJson: JSON.parse(read('package.json')),
      lockText: maybe('pnpm-lock.yaml'),
      nodeVersionFile: maybe('.node-version'),
      exceptions,
      workflowEnv,
      dockerfileText: dockerfile,
      existingFiles: listRepositoryFiles(root),
    }),
  );

  const lines = [];
  lines.push(`Gate catalogue: ${result.required.length} required, ${result.scheduled.length} scheduled, ${result.pending.length} pending.`);
  lines.push('', 'Required checks (register each on main): ' + result.required.join(', '));
  if (result.pending.length > 0) {
    lines.push('', 'PENDING gates (NOT implemented; each waits on an accepted, still-open prerequisite; none is reported as passed):');
    for (const p of result.pending) lines.push(`  - ${p.id}  <- ${p.prerequisites.join(', ')}  (${p.reason})`);
  }
  for (const l of lines) console.log(l);
  if (process.env.GITHUB_ACTIONS) {
    for (const p of result.pending)
      console.log(`::warning title=PENDING gate ${p.id}::waits on ${p.prerequisites.join(', ')}; not implemented, not passed`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [
      '## Gate catalogue',
      '',
      `**${result.required.length} required, ${result.scheduled.length} scheduled, ${result.pending.length} pending**`,
      '',
    ];
    md.push('| Pending gate (NOT passed) | Waits on |', '| --- | --- |');
    for (const p of result.pending) md.push(`| ${p.id} | ${p.prerequisites.join(', ')} |`);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
  }
  if (errors.length > 0) {
    console.log('');
    for (const e of errors) console.log(`FAIL ${e.replace(/[\r\n]+/g, ' ')}`);
    console.log(`gate catalogue: FAIL (${errors.length} violation(s))`);
    return 1;
  }
  console.log('\ngate catalogue: PASS (consistent; pending gates above are NOT passed gates)');
  return 0;
}

try {
  process.exit(main());
} catch (e) {
  console.error(`gate catalogue: cannot run (${String(e.message).split('\n')[0]})`);
  process.exit(2);
}
