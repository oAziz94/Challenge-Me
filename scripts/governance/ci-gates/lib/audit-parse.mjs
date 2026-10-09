// pnpm audit --json parsing. Node built-ins only (no package import): the image-scan job reports without installing dependencies,
// and both the scan report and the weekly dependency report parse audit output through this one function.

const SEVERITY_ORDER = ['critical', 'high', 'moderate', 'low', 'info'];

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
