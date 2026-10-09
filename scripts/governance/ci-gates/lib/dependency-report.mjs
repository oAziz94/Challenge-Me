// Dependency report (STACK-ADR-002 6.7, STACK-ADR-001 section 7 rule 7). Pure functions: pin discovery from repository
// files, advisory and outdated parsing, and rendering. Network access lives in dependency-report.mjs.
// A report identifies, for every item: the dependency, the currently pinned version, the proposed target, and the
// relevant vulnerability information where applicable. It proposes; it never changes a file and never opens a pull request.
import { parse } from 'yaml';

const SEVERITY_ORDER = ['critical', 'high', 'moderate', 'low', 'info'];

/** Pins found in repository files: tools, runtime, package manager and container images. */
export function collectPins({ nodeVersionFile, packageJson, workflows, dockerfileText }) {
  const pins = [];
  pins.push({ name: 'Node.js', kind: 'runtime', current: String(nodeVersionFile).trim(), source: '.node-version' });
  const pm = /^pnpm@(\d+\.\d+\.\d+)/.exec(String(packageJson.packageManager ?? ''));
  if (pm) pins.push({ name: 'pnpm', kind: 'package-manager', current: pm[1], source: 'package.json packageManager' });
  for (const [name, spec] of Object.entries({ ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) })) {
    pins.push({ name, kind: 'npm-dependency', current: String(spec), source: 'package.json' });
  }
  const seenTools = new Set();
  for (const [file, text] of Object.entries(workflows)) {
    let doc;
    try {
      doc = parse(text);
    } catch {
      continue;
    }
    const env = doc && typeof doc.env === 'object' && doc.env ? doc.env : {};
    for (const [tool, key] of [
      ['gitleaks', 'GITLEAKS_VERSION'],
      ['trivy', 'IMAGE_SCANNER_VERSION'],
    ]) {
      if (env[key] !== undefined && !seenTools.has(`${tool}@${env[key]}`)) {
        seenTools.add(`${tool}@${env[key]}`);
        pins.push({ name: tool, kind: 'ci-tool', current: String(env[key]), source: file });
      }
    }
    const jobs = doc && typeof doc.jobs === 'object' && doc.jobs ? doc.jobs : {};
    for (const job of Object.values(jobs)) {
      const services = job && typeof job.services === 'object' && job.services ? job.services : {};
      for (const svc of Object.values(services)) {
        const image = svc && typeof svc.image === 'string' ? svc.image : null;
        const m = image && /^([^:@\s]+):([^@\s]+)@(sha256:[0-9a-f]{64})$/.exec(image);
        if (m) pins.push({ name: m[1], kind: 'container-image', current: `${m[2]}@${m[3]}`, tag: m[2], digest: m[3], source: file });
      }
    }
  }
  for (const line of String(dockerfileText ?? '').split(/\r?\n/)) {
    const m = /^FROM\s+([^:@\s]+):([^@\s]+)@(sha256:[0-9a-f]{64})/i.exec(line.trim());
    if (m) pins.push({ name: m[1], kind: 'container-image', current: `${m[2]}@${m[3]}`, tag: m[2], digest: m[3], source: 'Dockerfile' });
  }
  return pins;
}

/** pnpm audit --json -> [{package, severity, title, vulnerable, patched, url}] sorted by severity. Unparseable input throws. */
export function parseAudit(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || typeof data !== 'object' || typeof data.advisories !== 'object') throw new Error('unparseable audit report');
  const rows = Object.values(data.advisories).map((a) => ({
    package: String(a.module_name ?? a.name ?? 'unknown'),
    severity: String(a.severity ?? 'unknown'),
    title: String(a.title ?? ''),
    vulnerable: String(a.vulnerable_versions ?? ''),
    patched: String(a.patched_versions ?? ''),
    url: String(a.url ?? ''),
  }));
  rows.sort((x, y) => SEVERITY_ORDER.indexOf(x.severity) - SEVERITY_ORDER.indexOf(y.severity));
  return rows;
}

/** pnpm outdated --format json -> [{package, current, wanted, latest}]. Empty output means nothing is outdated. */
export function parseOutdated(text) {
  if (String(text).trim() === '') return [];
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('unparseable outdated report');
  return Object.entries(data).map(([name, v]) => ({
    package: name,
    current: String(v.current),
    wanted: String(v.wanted),
    latest: String(v.latest),
  }));
}

/**
 * The outcome of `pnpm outdated --format json`, judged with its exit status. pnpm exits 0 with no output when nothing is
 * outdated and exits 1 WITH a JSON object naming the outdated packages. Anything else is an execution failure, never "none":
 *   - exit 0 and empty output  -> [] (nothing outdated);
 *   - exit 0 and a JSON object -> that object's rows;
 *   - exit non-zero with a non-empty JSON object -> those rows (this is how pnpm reports outdated packages);
 *   - exit non-zero with empty, invalid or empty-object output (registry or network failure) -> throws;
 *   - exit 0 with invalid output, or no exit status (killed) -> throws.
 */
export function interpretOutdated({ status, stdout, stderr = '' }) {
  const out = String(stdout ?? '');
  const why = String(stderr).split('\n')[0];
  if (status === 0) return parseOutdated(out);
  if (typeof status !== 'number') throw new Error('pnpm outdated did not finish (no exit status)');
  let rows;
  try {
    rows = parseOutdated(out);
  } catch {
    throw new Error(`pnpm outdated failed (exit ${status}) without a usable result: ${why}`);
  }
  if (rows.length === 0) throw new Error(`pnpm outdated failed (exit ${status}) without naming any package: ${why}`);
  // Only rows of the shape pnpm prints for an outdated package count; an arbitrary JSON object is not a result.
  const data = JSON.parse(out);
  for (const [name, row] of Object.entries(data)) {
    if (!row || typeof row !== 'object' || ['current', 'wanted', 'latest'].some((k) => typeof row[k] !== 'string')) {
      throw new Error(`pnpm outdated failed (exit ${status}) with an unexpected row for "${name}": ${why}`);
    }
  }
  return rows;
}

/** Latest Node.js release of a given major from https://nodejs.org/dist/index.json, or null. */
export function latestNodeOfMajor(index, major) {
  const versions = index.map((e) => String(e.version)).filter((v) => v.startsWith(`v${major}.`));
  const key = (v) => v.slice(1).split('.').map(Number);
  versions.sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  return versions.at(-1) ?? null;
}

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/**
 * @param {{rows: {name:string, kind:string, current:string, proposed:string, vulnerability:string}[], audit:object[], notes?:string[]}} r
 */
export function renderReport({ rows, audit, notes = [] }) {
  const out = [];
  out.push('# Dependency report', '');
  out.push('| Item | Kind | Current pin | Proposed target | Vulnerability information |', '| --- | --- | --- | --- | --- |');
  for (const r of rows)
    out.push(`| ${cell(r.name)} | ${cell(r.kind)} | ${cell(r.current)} | ${cell(r.proposed)} | ${cell(r.vulnerability)} |`);
  out.push('', `## Known advisories in the lockfile (${audit.length})`, '');
  if (audit.length === 0) out.push('None reported by the package-manager audit.');
  else {
    out.push('| Package | Severity | Vulnerable | Patched | Advisory |', '| --- | --- | --- | --- | --- |');
    for (const a of audit)
      out.push(
        `| ${cell(a.package)} | ${cell(a.severity)} | ${cell(a.vulnerable)} | ${cell(a.patched)} | ${cell(a.title)} ${cell(a.url)} |`,
      );
  }
  if (notes.length > 0) out.push('', '## Notes', '', ...notes.map((n) => `- ${n}`));
  out.push(
    '',
    'This report proposes only. It changes no file, opens no pull request and creates no commit; adopting a proposal is a reviewed change under the engineering authority.',
  );
  return out.join('\n') + '\n';
}
