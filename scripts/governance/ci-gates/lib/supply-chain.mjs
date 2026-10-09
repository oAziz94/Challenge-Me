// Supply-chain policy (STACK-ADR-001 4.8, 4.12, 4.13, section 7; STACK-ADR-002 6.7): exact toolchain pins, a committed
// lockfile, no workspace tooling, no unreviewed install scripts, one Node.js version everywhere, no bot dependency updates.
// Pure functions over file contents; every function returns violation strings, an empty list is a pass.

const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
const PACKAGE_MANAGER = /^pnpm@(\d+\.\d+\.\d+)\+sha512\.[0-9a-f]{128}$/;

/** Files whose existence would add monorepo tooling or bot-authored dependency updates (both are out of scope). */
export const FORBIDDEN_FILES = Object.freeze([
  'pnpm-workspace.yaml',
  '.npmrc',
  'nx.json',
  'turbo.json',
  'lerna.json',
  '.github/dependabot.yml',
  '.github/dependabot.yaml',
  'renovate.json',
  'renovate.json5',
  '.renovaterc',
  '.renovaterc.json',
  '.github/renovate.json',
  '.github/renovate.json5',
  'package-lock.json',
  'yarn.lock',
]);

/** Scanner configuration and ignore files: rejected at any depth (a nested copy can still be picked up by the tool). */
export const FORBIDDEN_BASENAMES = Object.freeze(['trivy.yaml', '.trivy.yaml', '.trivyignore', '.trivyignore.yaml']);

/**
 * Configuration that can shadow or override an approved root configuration, or run code during install. Rejected at any
 * repository depth. Each entry names the one root file that IS the approved configuration (null = none is approved).
 */
export const SHADOW_CONFIGS = Object.freeze([
  {
    pattern: /^eslint\.config\./,
    approved: 'eslint.config.mjs',
    why: 'an alternate or nested ESLint configuration can override or suppress the approved one',
  },
  {
    pattern: /^\.prettierrc/,
    approved: '.prettierrc.json',
    why: 'an alternate or nested Prettier configuration can override the approved one',
  },
  { pattern: /^prettier\.config\./, approved: null, why: 'an alternate Prettier configuration can override the approved one' },
  {
    pattern: /^vitest\.config\./,
    approved: 'vitest.config.ts',
    why: 'an alternate Vitest configuration can replace the approved test projects',
  },
  { pattern: /^vite\.config\./, approved: null, why: 'a Vite configuration can replace the approved Vitest configuration' },
  {
    pattern: /^package\.json$/,
    approved: 'package.json',
    why: 'a nested package manifest is not part of the single-package repository, and Prettier reads configuration from manifests',
  },
  {
    pattern: /^package\.yaml$/,
    approved: null,
    why: 'a package.yaml manifest can carry Prettier configuration; the repository is a single package',
  },
  { pattern: /^\.editorconfig$/, approved: null, why: 'an .editorconfig is a second Prettier configuration route' },
  { pattern: /^\.pnpmfile\./, approved: null, why: 'a pnpmfile executes code during dependency resolution' },
]);

/**
 * Why a repository file (path relative to the repository root, forward slashes) is not allowed, or null. This is the single
 * definition: the meta-gate scans the real file tree and passes every path through it.
 */
export function forbiddenFileReason(path) {
  if (FORBIDDEN_FILES.includes(path)) return 'single pnpm package, no monorepo tooling, no bot-authored dependency updates';
  const base = path.slice(path.lastIndexOf('/') + 1);
  if (FORBIDDEN_BASENAMES.includes(base)) return 'scanner configuration and ignore files can encode a findings policy';
  for (const { pattern, approved, why } of SHADOW_CONFIGS) {
    if (pattern.test(base) && path !== approved) return why;
  }
  return null;
}

/** Packages in the lockfile whose install scripts would run: `requiresBuild: true` entries. */
export function lockfileBuildPackages(lockText) {
  const names = [];
  let current = null;
  for (const raw of lockText.split(/\r?\n/)) {
    const pkg = /^ {2}'?([^'\s][^']*?)'?:\s*$/.exec(raw);
    if (pkg && !raw.startsWith('   ')) current = pkg[1];
    if (/^ {4}requiresBuild:\s*true\s*$/.test(raw) && current) names.push(current);
  }
  return names;
}

/**
 * @param {{
 *   packageJson:any, lockText:string|null, nodeVersionFile:string|null, exceptions:any,
 *   workflowEnv: Record<string,{NODE_VERSION?:string}>, dockerfileText:string|null, existingFiles:string[]
 * }} o
 */
export function checkSupplyChain({ packageJson, lockText, nodeVersionFile, exceptions, workflowEnv, dockerfileText, existingFiles }) {
  const v = [];
  const pkg = packageJson ?? {};

  const pm = PACKAGE_MANAGER.exec(String(pkg.packageManager ?? ''));
  if (!pm) v.push('package.json: packageManager must pin pnpm exactly with its integrity hash (pnpm@x.y.z+sha512.<hex>)');

  const nodeFile = (nodeVersionFile ?? '').trim();
  if (!EXACT_VERSION.test(nodeFile)) v.push('.node-version must contain one exact Node.js version');
  if (!String(nodeFile).startsWith('24.')) v.push('.node-version: Node.js 24 is the accepted Phase 1 major (STACK-ADR-001 section 7)');
  if (pkg.engines?.node !== nodeFile) v.push('package.json: engines.node must equal .node-version exactly');
  for (const [file, env] of Object.entries(workflowEnv)) {
    if (env.NODE_VERSION !== undefined && env.NODE_VERSION !== `v${nodeFile}`) {
      v.push(`${file}: NODE_VERSION ${env.NODE_VERSION} differs from .node-version v${nodeFile}`);
    }
  }
  if (dockerfileText !== null) {
    const tag = /^FROM\s+node:(\d+\.\d+\.\d+)[^\s@]*@sha256:/im.exec(dockerfileText);
    if (!tag) v.push('Dockerfile: the base image must be node:<exact version>-<variant>@sha256:<digest>');
    else if (tag[1] !== nodeFile) v.push(`Dockerfile: base image Node.js ${tag[1]} differs from .node-version ${nodeFile}`);
  }

  const dev = { ...(pkg.devDependencies ?? {}) };
  const prod = { ...(pkg.dependencies ?? {}) };
  for (const [name, range] of Object.entries({ ...dev, ...prod })) {
    if (name === 'typescript' && !EXACT_VERSION.test(String(range)))
      v.push(`package.json: typescript must be pinned exactly, found "${range}"`);
    if (/^(?:file|link|git|github|http|https|workspace):|\//.test(String(range)) && !/^[\^~]?\d/.test(String(range))) {
      v.push(`package.json: dependency "${name}" uses a non-registry source: ${range}`);
    }
  }
  if ('workspaces' in pkg) v.push('package.json: workspaces are not allowed (single package, STACK-ADR-001 4.8)');
  if ('scripts' in pkg) {
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'preprepare', 'postprepare']) {
      if (hook in pkg.scripts) v.push(`package.json: lifecycle script "${hook}" would run on install`);
    }
  }

  if (lockText === null) v.push('pnpm-lock.yaml: the lockfile must be committed');
  else {
    const approved = new Set(
      (Array.isArray(exceptions?.installScripts) ? exceptions.installScripts : [])
        .filter(
          (e) =>
            e &&
            typeof e.package === 'string' &&
            typeof e.justification === 'string' &&
            e.justification.trim() !== '' &&
            typeof e.reviewedBy === 'string' &&
            e.reviewedBy.trim() !== '',
        )
        .map((e) => e.package),
    );
    for (const name of lockfileBuildPackages(lockText)) {
      if (!approved.has(name))
        v.push(`pnpm-lock.yaml: "${name}" has an install script and no reviewed exception (install-script-exceptions.json)`);
    }
  }
  for (const key of ['prettier', 'eslintConfig']) {
    if (key in pkg)
      v.push(`package.json: "${key}" is a second configuration route and is not allowed (use the approved root configuration file)`);
  }
  if (pkg.pnpm && 'auditConfig' in pkg.pnpm)
    v.push('package.json: pnpm.auditConfig can encode a findings policy (ignored advisories) and is not allowed');
  if (pkg.pnpm?.onlyBuiltDependencies?.length)
    v.push('package.json: pnpm.onlyBuiltDependencies must be empty; exceptions live in install-script-exceptions.json');

  for (const f of existingFiles) {
    const why = forbiddenFileReason(f);
    if (why) v.push(`${f}: not allowed (${why})`);
  }
  return v;
}
