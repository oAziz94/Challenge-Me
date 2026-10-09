#!/usr/bin/env node
// Dependency report CLI (STACK-ADR-002 6.7). Reads the pins from the repository, asks public sources for the latest
// release, runs the package manager's outdated and audit commands, prints the report and appends it to the job summary.
// Sources: the npm registry (already trusted for installs), nodejs.org, the GitHub releases pages and the Docker registry.
// No account, no secret, no write. Exit 0 = report produced; 1 = a source could not be read (never a silent partial report).
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPins, interpretOutdated, latestNodeOfMajor, parseAudit, renderReport } from './lib/dependency-report.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

async function get(url, init = {}, tries = 3) {
  let last;
  for (let i = 1; i <= tries; i += 1) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
      if (res.ok || (init.redirect === 'manual' && res.status >= 300 && res.status < 400)) return res;
      last = new Error(`${url} -> HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 1000 * i));
  }
  throw new Error(`cannot read ${url} (${String(last?.message ?? last).split('\n')[0]})`);
}

const npmLatest = async (name) => (await (await get(`https://registry.npmjs.org/${name.replace('/', '%2F')}/latest`)).json()).version;

async function githubLatest(repo) {
  const res = await get(`https://github.com/${repo}/releases/latest`, { redirect: 'manual' });
  const loc = res.headers.get('location') ?? '';
  const m = /\/releases\/tag\/v?([^/]+)$/.exec(loc);
  if (!m) throw new Error(`cannot determine the latest release of ${repo}`);
  return m[1];
}

async function imageDigest(name, tag) {
  const repo = name.includes('/') ? name : `library/${name}`;
  const tok = await (await get(`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`)).json();
  const accept =
    'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json';
  const res = await get(`https://registry-1.docker.io/v2/${repo}/manifests/${tag}`, {
    method: 'HEAD',
    headers: { Authorization: `Bearer ${tok.token}`, Accept: accept },
  });
  const d = res.headers.get('docker-content-digest');
  if (!d) throw new Error(`no digest for ${name}:${tag}`);
  return d;
}

function pnpm(args) {
  const r = spawnSync('corepack', ['pnpm', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    shell: process.platform === 'win32',
  });
  if (r.error) throw new Error(`cannot run pnpm (${r.error.code ?? 'error'})`);
  return r; // outdated exits 1 when something is outdated; the output is still the report
}

async function main() {
  const wfDir = '.github/workflows';
  const workflows = {};
  if (existsSync(join(root, wfDir)))
    for (const f of readdirSync(join(root, wfDir)).filter((n) => /\.ya?ml$/.test(n))) workflows[`${wfDir}/${f}`] = read(`${wfDir}/${f}`);
  const pins = collectPins({
    nodeVersionFile: read('.node-version'),
    packageJson: JSON.parse(read('package.json')),
    workflows,
    dockerfileText: existsSync(join(root, 'Dockerfile')) ? read('Dockerfile') : '',
  });

  const audit = parseAudit(pnpm(['audit', '--json']).stdout);
  const outdated = interpretOutdated(pnpm(['outdated', '--format', 'json']));
  const outdatedBy = new Map(outdated.map((o) => [o.package, o]));
  const advisoriesBy = new Map();
  for (const a of audit) advisoriesBy.set(a.package, [...(advisoriesBy.get(a.package) ?? []), a]);

  const nodeIndex = await (await get('https://nodejs.org/dist/index.json')).json();
  const notes = [
    'Node.js: only the pinned major is proposed (a runtime-major change needs the compatibility verification of STACK-ADR-001 section 7 rule 3). Vulnerability information for Node.js is published at https://nodejs.org/en/blog/vulnerability and is not machine-assessed here.',
    'Container images: the proposal is the digest the same tag points to now; vulnerability information for the images in use comes from the image-scan gate (Trivy; findings are reported, and no findings-based failure policy is decided yet).',
    'CI tools (gitleaks, Trivy): the latest release is proposed; adopting it means updating the pinned version and SHA-256 in the workflow after reading the release checksums.',
    'For npm dependencies the proposal is the version satisfying the declared range ("wanted"); a newer major ("latest") is shown for information and needs its own review.',
  ];
  const rows = [];
  for (const p of pins) {
    if (p.kind === 'runtime') {
      const major = p.current.split('.')[0];
      const latest = latestNodeOfMajor(nodeIndex, major);
      rows.push({
        ...p,
        proposed: latest ? (latest.slice(1) === p.current ? 'none (current)' : latest.slice(1)) : 'unknown',
        vulnerability: 'see notes',
      });
    } else if (p.kind === 'package-manager') {
      const latest = await npmLatest('pnpm');
      rows.push({ ...p, proposed: latest === p.current ? 'none (current)' : latest, vulnerability: 'none reported' });
    } else if (p.kind === 'npm-dependency') {
      const o = outdatedBy.get(p.name);
      const adv = advisoriesBy.get(p.name) ?? [];
      const proposed = o
        ? o.wanted !== o.current
          ? `${o.wanted} (latest ${o.latest})`
          : `none within range (latest ${o.latest})`
        : 'none (current)';
      rows.push({
        ...p,
        current: o ? `${p.current} (resolved ${o.current})` : p.current,
        proposed,
        vulnerability: adv.length ? adv.map((a) => `${a.severity}: ${a.title}`).join('; ') : 'none reported',
      });
    } else if (p.kind === 'ci-tool') {
      const latest = await githubLatest(p.name === 'trivy' ? 'aquasecurity/trivy' : 'gitleaks/gitleaks');
      rows.push({
        ...p,
        proposed: latest === p.current ? 'none (current)' : latest,
        vulnerability: 'not machine-assessed (see release notes)',
      });
    } else if (p.kind === 'container-image') {
      const now = await imageDigest(p.name, p.tag);
      rows.push({ ...p, proposed: now === p.digest ? 'none (digest current)' : `${p.tag}@${now}`, vulnerability: 'see image-scan gate' });
    }
  }

  const report = renderReport({ rows, audit, notes });
  process.stdout.write(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`dependency report: ${String(e.message).split('\n')[0]}`);
    process.exit(1);
  },
);
