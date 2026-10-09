// Static policy for GitHub Actions workflow files and Dockerfiles (STACK-ADR-002 6.4-6.7, STACK-ADR-001 4.12-4.13).
// Pure functions over file text. Every function returns a list of violation strings; an empty list is a pass.
// A file that cannot be parsed is a violation (fail closed), never a pass.
import { parse } from 'yaml';
import { EXPECTED_TRIVY_LINES } from './catalogue.mjs';

/** Triggers a workflow may use. Privileged triggers (pull_request_target, workflow_run, ...) are not in the set. */
export const ALLOWED_TRIGGERS = new Set(['pull_request', 'push', 'schedule', 'workflow_dispatch']);

const SHA_PINNED_ACTION = /^[\w.-]+\/[\w.-]+(?:\/[^@\s]+)?@[0-9a-f]{40}$/;
const DIGEST_PINNED_IMAGE = /@sha256:[0-9a-f]{64}$/;
const SECRETS_REFERENCE = /\$\{\{[\s\S]*?\bsecrets\b[\s\S]*?\}\}|\bsecrets\s*(?:\.|\[)|\bsecrets\s*:\s*inherit\b/;
// An exact flag only: --frozen-lockfile or --frozen-lockfile=true, never --no-frozen-lockfile or --frozen-lockfile=false.
const hasFlag = (line, flag) => new RegExp(`(?:^|\\s)--${flag}(?:=true)?(?=\\s|$)`).test(line);

// Scanner policy. No findings-based policy is decided (decision-vulnerability-findings-policy is OPEN), so a scan command may only
// have the exact shape held in catalogue.mjs. Exact shapes, not a deny-list: a deny-list misses spellings (-s, --ignore-status,
// --pkg-types, --ignore-unfixable, TRIVY_* variables) that encode the same policy.
const TRIVY_ENV = /^TRIVY_/i;
// Package-manager configuration through the environment (registry, audit level, ...): a second route to the same policy.
const PM_CONFIG_ENV = /^(?:npm|pnpm)_config_/i;
const PM_CONFIG_IN_TEXT = /\b(?:npm|pnpm)_config_[a-z0-9_]*/i;
const TRIVY_IN_TEXT = /\bTRIVY_[A-Z0-9_]+/i;
const MENTIONS_TRIVY = /trivy/i;
const isPnpmAudit = (line) => /\bpnpm\s+.*\baudit\b/.test(line);

/**
 * The scan commands of one run script. Any line that mentions Trivy must be EXACTLY one of the lines held in catalogue.mjs
 * (installer lines and the two allowed invocations); a spelling that differs in any way, including inside \`sh -c "..."\`, is
 * rejected. \`pnpm audit\` is never run from a workflow: only vulnerability-report.mjs runs it, with the fixed AUDIT_ARGS.
 */
export function checkScannerCommands(lines, where) {
  const v = [];
  for (const line of lines) {
    if (isPnpmAudit(line)) v.push(`${where}: pnpm audit may only be run by vulnerability-report.mjs with its fixed arguments: ${line}`);
    if (MENTIONS_TRIVY.test(line) && !EXPECTED_TRIVY_LINES.includes(line)) {
      v.push(`${where}: the Trivy command must be exactly an allowed line (no policy, filter, ignore or database option): ${line}`);
    }
  }
  return v;
}

/** TRIVY_*, npm_config_* and pnpm_config_* environment variables at workflow, job or step level. */
export function checkEnvironment(doc, file) {
  const v = [];
  const check = (env, where) => {
    if (!isObject(env)) return;
    for (const k of Object.keys(env)) {
      if (TRIVY_ENV.test(k)) v.push(`${where}: environment variable ${k} can encode scanner policy and is not allowed`);
      if (PM_CONFIG_ENV.test(k))
        v.push(`${where}: environment variable ${k} can change package-manager or registry configuration and is not allowed`);
    }
  };
  check(doc.env, file);
  for (const [jobId, job] of Object.entries(isObject(doc.jobs) ? doc.jobs : {})) {
    if (!isObject(job)) continue;
    check(job.env, `${file} job "${jobId}"`);
    (Array.isArray(job.steps) ? job.steps : []).forEach(
      (step, i) => isObject(step) && check(step.env, `${file} job "${jobId}" step ${i + 1}`),
    );
  }
  return v;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Every string (keys and values) reachable in a parsed document. */
function* strings(node) {
  if (typeof node === 'string') yield node;
  else if (Array.isArray(node)) for (const n of node) yield* strings(n);
  else if (isObject(node)) {
    for (const [k, v] of Object.entries(node)) {
      yield k;
      yield* strings(v);
    }
  }
}

/** Logical command lines of a shell script: backslash continuations are joined, blank lines and comments dropped. */
export function commandLines(script) {
  const lines = String(script)
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n/);
  return lines.map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
}

/** Install-command rules shared by workflow `run` scripts and Dockerfile `RUN` lines. */
export function checkInstallCommands(lines, where) {
  const v = [];
  for (const line of lines) {
    const pnpmInstall = /\bpnpm\s+(?:--?\S+\s+)*(?:i|install)\b/.test(line);
    if (pnpmInstall) {
      if (!hasFlag(line, 'frozen-lockfile')) v.push(`${where}: pnpm install without --frozen-lockfile: ${line}`);
      if (!hasFlag(line, 'ignore-scripts')) v.push(`${where}: pnpm install without --ignore-scripts: ${line}`);
      if (!hasFlag(line, 'ignore-pnpmfile')) v.push(`${where}: pnpm install without --ignore-pnpmfile: ${line}`);
    }
    if (/\bpnpm\s+(?:--?\S+\s+)*(?:add|update|up|upgrade|dlx|import)\b/.test(line)) {
      v.push(`${where}: pnpm command that changes or fetches unpinned dependencies is not allowed in CI: ${line}`);
    }
    if (/\bnpm\s+(?:--?\S+\s+)*(?:i|install|ci|add|update|exec)\b/.test(line) || /\bnpx\b/.test(line) || /\byarn\b/.test(line)) {
      v.push(`${where}: only pnpm with the frozen lockfile may install dependencies: ${line}`);
    }
  }
  return v;
}

function normalizeTriggers(on) {
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on.map(String);
  if (isObject(on)) return Object.keys(on);
  return [];
}

/**
 * @param {{file:string, text:string, allowedActions?:string[]}} o
 * @returns {{violations:string[], doc:any}}
 */
export function checkWorkflow({ file, text, allowedActions = [] }) {
  const v = [];
  let doc;
  try {
    doc = parse(text, { uniqueKeys: true });
  } catch (e) {
    return { violations: [`${file}: cannot be parsed as YAML (${String(e.message).split('\n')[0]})`], doc: null };
  }
  if (!isObject(doc)) return { violations: [`${file}: not a YAML mapping`], doc: null };

  // Triggers
  const triggers = normalizeTriggers(doc.on);
  if (triggers.length === 0) v.push(`${file}: no trigger found under "on"`);
  for (const t of triggers) {
    if (!ALLOWED_TRIGGERS.has(t)) v.push(`${file}: trigger "${t}" is not allowed (privileged or unreviewed trigger)`);
  }
  if (isObject(doc.on)) {
    for (const t of ['pull_request', 'push']) {
      const cfg = doc.on[t];
      if (isObject(cfg) && ('paths' in cfg || 'paths-ignore' in cfg)) {
        v.push(`${file}: trigger "${t}" must not filter by path (a required check that does not run never reports)`);
      }
    }
  }

  // Permissions
  if (!isObject(doc.permissions) || Object.keys(doc.permissions).length !== 0) {
    v.push(`${file}: top-level permissions must be exactly {} (no token scope)`);
  }
  if ('defaults' in doc)
    v.push(`${file}: workflow-level "defaults" can change the shell or working directory of every step and is not allowed`);
  const jobs = isObject(doc.jobs) ? doc.jobs : {};
  if (Object.keys(jobs).length === 0) v.push(`${file}: no jobs`);

  for (const [jobId, job] of Object.entries(jobs)) {
    const where = `${file} job "${jobId}"`;
    if (!isObject(job)) {
      v.push(`${where}: not a mapping`);
      continue;
    }
    if (!('permissions' in job)) v.push(`${where}: permissions are not declared explicitly`);
    else if (isObject(job.permissions)) {
      for (const [scope, level] of Object.entries(job.permissions)) {
        if (String(level).toLowerCase() === 'write') v.push(`${where}: write permission "${scope}"`);
      }
    } else if (/write/i.test(String(job.permissions))) v.push(`${where}: write permission`);
    if (typeof job['timeout-minutes'] !== 'number') v.push(`${where}: timeout-minutes is not set`);
    if (job['continue-on-error'] !== undefined && job['continue-on-error'] !== false) {
      v.push(`${where}: continue-on-error would let a gate fail without failing the check`);
    }
    if (typeof job.uses === 'string') checkUses(job.uses, where, allowedActions, v);
    if ('secrets' in job) v.push(`${where}: passes secrets to a called workflow`);
    if ('defaults' in job)
      v.push(`${where}: job-level "defaults" can change the shell or working directory of its steps and is not allowed`);

    // Images: container and services must be pinned by digest.
    const containers = [];
    if (typeof job.container === 'string') containers.push(['container', job.container]);
    else if (isObject(job.container) && typeof job.container.image === 'string') containers.push(['container', job.container.image]);
    if (isObject(job.services)) {
      for (const [name, svc] of Object.entries(job.services)) {
        if (isObject(svc) && typeof svc.image === 'string') containers.push([`service "${name}"`, svc.image]);
        else v.push(`${where}: service "${name}" has no image`);
      }
    }
    for (const [what, image] of containers) {
      if (!DIGEST_PINNED_IMAGE.test(image)) v.push(`${where}: ${what} image is not pinned by digest: ${image}`);
    }

    const steps = Array.isArray(job.steps) ? job.steps : [];
    steps.forEach((step, i) => {
      const sw = `${where} step ${i + 1}`;
      if (!isObject(step)) {
        v.push(`${sw}: not a mapping`);
        return;
      }
      if ('shell' in step) v.push(`${sw}: step-level "shell" can change how the command runs and is not allowed`);
      if ('working-directory' in step)
        v.push(`${sw}: step-level "working-directory" can select other scripts or configuration and is not allowed`);
      if ('if' in step) v.push(`${sw}: step-level "if" could silently skip a check`);
      if (step['continue-on-error'] !== undefined && step['continue-on-error'] !== false) v.push(`${sw}: continue-on-error`);
      if (typeof step.uses === 'string') checkUses(step.uses, sw, allowedActions, v);
      if (typeof step.run === 'string') {
        const lines = commandLines(step.run);
        v.push(...checkInstallCommands(lines, sw));
        v.push(...checkScannerCommands(lines, sw));
        for (const line of lines) {
          if (/\bdocker\s+(?:pull|push|login|tag)\b/.test(line))
            v.push(`${sw}: docker pull/push/login/tag is not allowed (no publishing, no pulled images): ${line}`);
          if (/\bdocker\s+(?:run|create)\b/.test(line) && !/\bchallenge-me:ci\b/.test(line)) {
            v.push(`${sw}: docker run/create may only use the locally built challenge-me:ci image: ${line}`);
          }
        }
      }
    });
  }

  v.push(...checkEnvironment(doc, file));

  // Secrets and artifact retention anywhere in the document
  for (const s of strings(doc)) {
    if (SECRETS_REFERENCE.test(s)) v.push(`${file}: references the secrets context: ${s.trim().slice(0, 80)}`);
    // Any string of the workflow (run text, a non-run field, a key): a name that encodes scanner or package-manager policy.
    if (TRIVY_IN_TEXT.test(s)) v.push(`${file}: a TRIVY_* variable can encode scanner policy and is not allowed: ${s.trim().slice(0, 80)}`);
    if (PM_CONFIG_IN_TEXT.test(s))
      v.push(
        `${file}: an npm_config_* or pnpm_config_* name can change package-manager configuration and is not allowed: ${s.trim().slice(0, 80)}`,
      );
  }
  const retention = [];
  (function walk(n) {
    if (Array.isArray(n)) n.forEach(walk);
    else if (isObject(n)) {
      for (const [k, val] of Object.entries(n)) {
        if (k === 'retention-days') retention.push(Number(val));
        walk(val);
      }
    }
  })(doc);
  for (const r of retention) if (!(r <= 30)) v.push(`${file}: retention-days ${r} exceeds the 30-day retention (STACK-ADR-002 6.10)`);

  return { violations: v, doc };
}

function checkUses(uses, where, allowedActions, v) {
  if (uses.startsWith('./')) return;
  if (!SHA_PINNED_ACTION.test(uses)) {
    v.push(`${where}: uses "${uses}" is not pinned to a full-length commit SHA`);
    return;
  }
  if (!allowedActions.includes(uses)) {
    v.push(`${where}: uses "${uses}" is not in the reviewed allowedActions list of the gate catalogue`);
  }
}

/** Dockerfile rules: every FROM pinned by digest, non-root final user, frozen/no-scripts installs, no secrets in args. */
export function checkDockerfile({ file, text }) {
  const v = [];
  const lines = commandLines(text);
  const stages = new Set();
  let finalUser = null;
  let froms = 0;
  for (const line of lines) {
    const from = /^FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
    if (from) {
      froms += 1;
      const image = from[1];
      if (!stages.has(image) && image.toLowerCase() !== 'scratch' && !DIGEST_PINNED_IMAGE.test(image)) {
        v.push(`${file}: base image is not pinned by digest: ${image}`);
      }
      if (from[2]) stages.add(from[2]);
      finalUser = null;
      continue;
    }
    const user = /^USER\s+(\S+)/i.exec(line);
    if (user) finalUser = user[1];
    if (/^RUN\b/i.test(line)) v.push(...checkInstallCommands([line.replace(/^RUN\s+/i, '')], file));
    if (/^(?:ARG|ENV)\s+\S*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY)\S*/i.test(line)) {
      v.push(`${file}: secret-like build argument or environment variable: ${line.split(/\s|=/)[1]}`);
    }
    if (/^(?:COPY|ADD)\b.*\.env\b/i.test(line)) v.push(`${file}: copies an .env file into the image`);
  }
  if (froms === 0) v.push(`${file}: no FROM instruction`);
  if (finalUser === null || /^(?:root|0)(?::|$)/.test(finalUser)) v.push(`${file}: the final stage does not run as a non-root user`);
  return v;
}
