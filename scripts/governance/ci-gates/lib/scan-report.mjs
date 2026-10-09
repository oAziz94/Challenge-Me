// Vulnerability scan reporting (STACK-ADR-001 4.13: dependency and image vulnerability scanning are required CI capabilities).
// No findings-based failure policy has been decided: no severity, score, fixability rule, allow-list or exception exists
// (prerequisite decision-vulnerability-findings-policy is OPEN). These functions therefore only PARSE and RENDER:
//   - a scan result that is unreadable, malformed or incomplete throws (the scan did not execute honestly -> the job fails);
//   - a readable result with findings is reported in full, whatever the severity, and never causes a failure by itself.
// A green scan job means "the required scan executed successfully and its findings were reported", not "no unacceptable
// vulnerability exists".
import { parseAudit } from './audit-parse.mjs';

export const POLICY_NOTE =
  'The scan executed successfully and its findings are reported above. This is not a statement that no unacceptable ' +
  'vulnerability exists: no findings-based failure policy has been decided (prerequisite decision-vulnerability-findings-policy is OPEN, ' +
  'owner: engineering authority), so a finding alone does not fail this job.';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * pnpm audit --json -> findings. Requires the advisories object and the metadata object that a completed audit produces;
 * anything else throws (a registry error page, an empty answer or an error message is not a scan result).
 */
export function parseDependencyScan(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!isObject(data) || !isObject(data.advisories) || !isObject(data.metadata)) throw new Error('the audit result is incomplete');
  return parseAudit(data).map((a) => ({
    id: a.url || a.title,
    package: a.package,
    severity: a.severity,
    title: a.title,
    fixed: a.patched,
  }));
}

/**
 * Trivy `--format json` -> findings. Requires the report envelope (SchemaVersion, ArtifactName); `Results` may be absent when
 * nothing was found. Each vulnerability needs an id and a severity; anything else throws.
 */
export function parseImageScan(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!isObject(data) || typeof data.SchemaVersion !== 'number' || typeof data.ArtifactName !== 'string') {
    throw new Error('the image scan result is incomplete (no report envelope)');
  }
  if (data.Results !== undefined && data.Results !== null && !Array.isArray(data.Results))
    throw new Error('the image scan result is malformed');
  const findings = [];
  for (const r of data.Results ?? []) {
    if (!isObject(r)) throw new Error('the image scan result is malformed');
    const list = r.Vulnerabilities;
    if (list === undefined || list === null) continue;
    if (!Array.isArray(list)) throw new Error('the image scan result is malformed');
    for (const v of list) {
      if (!isObject(v) || typeof v.VulnerabilityID !== 'string' || typeof v.Severity !== 'string')
        throw new Error('the image scan result is malformed');
      findings.push({
        id: v.VulnerabilityID,
        package: `${String(r.Target ?? '')} ${String(v.PkgName ?? '')} ${String(v.InstalledVersion ?? '')}`.trim(),
        severity: v.Severity.toLowerCase(),
        title: String(v.Title ?? ''),
        fixed: String(v.FixedVersion ?? ''),
      });
    }
  }
  return findings;
}

const ORDER = ['critical', 'high', 'medium', 'moderate', 'low', 'info', 'unknown'];
const rank = (s) => (ORDER.includes(s) ? ORDER.indexOf(s) : ORDER.length);
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** Every finding is listed, all severities, ordered by severity. Counts are descriptive; they trigger nothing. */
export function renderScan({ title, findings }) {
  const counts = new Map();
  for (const f of findings) counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
  const sorted = [...findings].sort((a, b) => rank(a.severity) - rank(b.severity));
  const summary = [...counts.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([s, n]) => `${s}: ${n}`);
  const out = [`## ${title}`, '', `Findings reported: ${findings.length}${summary.length ? ` (${summary.join(', ')})` : ''}`, ''];
  if (findings.length > 0) {
    out.push('| Severity | Id | Package | Fixed in | Title |', '| --- | --- | --- | --- | --- |');
    for (const f of sorted) out.push(`| ${cell(f.severity)} | ${cell(f.id)} | ${cell(f.package)} | ${cell(f.fixed)} | ${cell(f.title)} |`);
    out.push('');
  }
  out.push(POLICY_NOTE, '');
  return out.join('\n');
}
