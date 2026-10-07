#!/usr/bin/env node
// Usage:
//   node scripts/governance/scanner-gate.mjs <gitleaks-binary> --canary-only
//   node scripts/governance/scanner-gate.mjs <gitleaks-binary> [<repository-root>]
// Exit 0 only when the scanner passes its canary AND (unless --canary-only) every real scan is clean and
// cross-checked. Output names checks and counts only; it never prints a secret value.
import { gitIn, makeScannerRunner, runPrepublicationGate, verifyScanner } from './lib/scanner-gate.mjs';

const args = process.argv.slice(2);
const bin = args[0];
const canaryOnly = args.includes('--canary-only');
const repoArg = args.slice(1).find((a) => !a.startsWith('--'));
if (!bin) {
  console.error('usage: scanner-gate.mjs <gitleaks-binary> [--canary-only | <repository-root>]');
  process.exit(2);
}

// The scanner and every Git child run with a sanitized copy of the environment (no GITLEAKS_*, no ambient GIT_*
// redirection, GIT_NO_REPLACE_OBJECTS=1); process.env itself is not modified. The gate also passes its own --config.
const run = makeScannerRunner(bin);

let result;
try {
  if (canaryOnly) result = verifyScanner({ run });
  else {
    const repo = repoArg ?? gitIn(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
    result = runPrepublicationGate({ run, repo });
  }
} catch (e) {
  console.error(`scanner gate: ${e.message}`);
  process.exit(2);
}

for (const c of result.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
console.log(result.ok ? 'scanner gate: PASS' : 'scanner gate: FAIL — no clean result may be trusted');
process.exit(result.ok ? 0 : 1);
