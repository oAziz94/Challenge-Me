// Commit-identity rules for new commits.
// Source: STACK-ADR-002 §6.9, E3, E10, E12, E17. Pure functions: no git, no I/O.

export const REQUIRED_NAME = 'oAziz94';
export const REQUIRED_EMAIL = '30234485+oAziz94@users.noreply.github.com';

// STACK-ADR-002 §6.9 / E10: the four existing commits are historical exceptions.
// Matched by full hash only; never rewritten.
export const HISTORICAL_EXEMPT = Object.freeze([
  '8b39463f3874cb52292d87aa7cb936e273f7ab7a',
  'dabaa0c34802d3f113dca5e06f9240d15a95d97a',
  '3ab11747bfb800b6a35024b140ebbb4d4fe0e3c8',
  '496c5c07a07322f0daa3a2bd3917b4c49a1ec0fc',
]);

// Names/emails that identify an AI tool or bot.
const AI_IDENTITY = [
  /\b(claude|anthropic|codex|openai|chatgpt|copilot|gemini|fable|opus|sonnet|haiku)\b/i,
  /\bgpt-?\d/i,
  /\bAI\b/,
  /\[bot\]|\bbot\b/i,
];

// Matched against the normalized detection views below, so it is not anchored to the line start.
const CO_AUTHOR_LINE = /co-authored-by\s*:(.*)$/gim;
// Tool-attribution footers such as "Generated with Claude Code".
const AI_FOOTER = /generated\s+(with|by)\b.*\b(claude|codex|ai|copilot|chatgpt|gemini)\b/i;

// Unicode Default_Ignorable_Code_Point: every invisible format character, including UNASSIGNED code points
// (U+2065, U+FFF0..U+FFF8, U+E0080 ...) that a category test such as \p{Cf} does not cover.
const DEFAULT_IGNORABLE = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu;
// Blank-looking characters outside that property: Hangul fillers and the braille blank.
const INVISIBLE_FILLERS = /[\u115F\u1160\u3164\uFFA0\u2800]/gu;
// Separators and control characters (other than the ASCII space and the newline) that can be inserted inside a token.
const ODD_SEPARATOR = /[\p{Z}\p{Cc}]/gu;

/**
 * Detection views of free text. They are used ONLY for matching; the original text is never altered or printed.
 * Obfuscation by invisible format characters (zero-width space/joiner, word joiner, BOM, soft hyphen, tag
 * characters), combining marks, compatibility forms (full-width letters) and unusual whitespace or control
 * characters must not split a prohibited name or phrase. Two views are produced so that neither a split token
 * nor a lost word boundary can hide a match:
 *   - separators become an ASCII space (word boundaries survive);
 *   - separators are removed (a token split by a separator is rejoined).
 */
export function detectionViews(text) {
  const normalize = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').replace(DEFAULT_IGNORABLE, '');
  const stripped = text.replace(/\r\n?/g, '\n').replace(DEFAULT_IGNORABLE, '').replace(INVISIBLE_FILLERS, '');
  const keep = (c) => c === ' ' || c === '\n';
  return [
    normalize(stripped.replace(ODD_SEPARATOR, (c) => (keep(c) ? c : ' '))),
    normalize(stripped.replace(ODD_SEPARATOR, (c) => (keep(c) ? c : ''))),
  ];
}

const isAiIdentity = (text) => detectionViews(text).some((v) => AI_IDENTITY.some((re) => re.test(v)));

/**
 * @param {{hash:string, authorName:string, authorEmail:string, committerName?:string, committerEmail:string, message:string}} commit
 * @returns {{hash:string, exempt:boolean, ok:boolean, violations:string[]}}
 */
export function evaluateCommit(commit) {
  if (HISTORICAL_EXEMPT.includes(commit.hash)) {
    return { hash: commit.hash, exempt: true, ok: true, violations: [] };
  }
  const violations = [];
  if (commit.authorName !== REQUIRED_NAME) violations.push('author name is not the required name');
  if (commit.authorEmail !== REQUIRED_EMAIL) violations.push('author email is not the required no-reply address');
  if (commit.committerEmail !== REQUIRED_EMAIL) violations.push('committer email is not the required no-reply address');
  if (commit.committerName !== undefined && isAiIdentity(commit.committerName)) {
    violations.push('committer name identifies an AI or bot');
  }

  const views = detectionViews(commit.message);
  const trailer = views.some((v) => [...v.matchAll(CO_AUTHOR_LINE)].some((m) => isAiIdentity(m[1])));
  if (trailer) violations.push('Co-Authored-By trailer names an AI or bot identity');
  if (views.some((v) => AI_FOOTER.test(v))) violations.push('message carries an AI tool attribution footer');

  return { hash: commit.hash, exempt: false, ok: violations.length === 0, violations };
}

export function evaluateCommits(commits) {
  const results = commits.map(evaluateCommit);
  return { ok: results.every((r) => r.ok), results };
}
