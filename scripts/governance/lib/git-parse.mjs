// Parsers for Git plumbing output. Pure functions; every parser fails closed (throws) on malformed input.
// Framing never depends on bytes an author controls: commit messages are read per commit object, and
// pathnames are read from NUL-delimited (-z) output so Git's path quoting cannot alter them.

const HEX40 = /^[0-9a-f]{40}$/;

/** `git rev-list` output: one exact 40-hex commit id per line, no duplicates. */
export function parseRevList(out) {
  const ids = out.split('\n').filter((l) => l !== '');
  const seen = new Set();
  for (const id of ids) {
    if (!HEX40.test(id)) throw new Error('rev-list returned a value that is not a full commit id');
    if (seen.has(id)) throw new Error('rev-list returned a duplicate commit id');
    seen.add(id);
  }
  return ids;
}

const IDENT = /^(.*) <([^<>\n]*)> (\d+) ([+-]\d{4})$/;

/**
 * Parses the raw bytes of one commit object (`git cat-file commit <hash>`).
 * The header ends at the first blank line; everything after it is the message and is never parsed.
 */
export function parseCommitObject(hash, raw) {
  if (!HEX40.test(hash)) throw new Error('not a full commit id');
  const split = raw.indexOf('\n\n');
  if (split < 0) throw new Error(`commit ${hash.slice(0, 12)}: malformed object (no header terminator)`);
  const header = raw.slice(0, split).split('\n');
  const message = raw.slice(split + 2);

  const idents = { author: [], committer: [] };
  for (const line of header) {
    if (line.startsWith(' ')) continue; // continuation of a multi-line header (gpgsig, mergetag)
    const sp = line.indexOf(' ');
    const key = sp < 0 ? line : line.slice(0, sp);
    if (key === 'author' || key === 'committer') {
      const m = IDENT.exec(line.slice(sp + 1));
      if (!m) throw new Error(`commit ${hash.slice(0, 12)}: malformed ${key} field`);
      idents[key].push({ name: m[1], email: m[2] });
    }
  }
  if (idents.author.length !== 1 || idents.committer.length !== 1) {
    throw new Error(`commit ${hash.slice(0, 12)}: expected exactly one author and one committer`);
  }
  return {
    hash,
    authorName: idents.author[0].name,
    authorEmail: idents.author[0].email,
    committerName: idents.committer[0].name,
    committerEmail: idents.committer[0].email,
    message,
  };
}

/** NUL-delimited list (`ls-tree -z --name-only`, `diff -z --name-only`). */
export function parseNulList(out) {
  if (out === '') return [];
  if (!out.endsWith('\0')) throw new Error('NUL-delimited output is not terminated');
  const parts = out.slice(0, -1).split('\0');
  if (parts.some((p) => p === '')) throw new Error('NUL-delimited output has an empty record');
  return parts;
}

/**
 * `git diff -z --name-status`: "STATUS\0path\0" and, for rename/copy, "Rnn\0old\0new\0".
 * A rename or copy yields one entry per pathname, both carrying the R/C status, so that neither
 * side of an authoritative rename can pass as an ordinary change.
 */
export function parseNameStatusZ(out) {
  if (out === '') return [];
  if (!out.endsWith('\0')) throw new Error('name-status output is not terminated');
  const t = out.slice(0, -1).split('\0');
  const changes = [];
  for (let i = 0; i < t.length; ) {
    const tok = t[i++];
    const m = /^([ACDMRTUXB])(\d{0,3})$/.exec(tok);
    if (!m) throw new Error('unexpected status record in name-status output');
    const status = m[1];
    const n = status === 'R' || status === 'C' ? 2 : 1;
    if (i + n > t.length) throw new Error('truncated name-status record');
    for (let k = 0; k < n; k++) {
      const path = t[i++];
      if (path === '') throw new Error('empty pathname in name-status output');
      changes.push({ status, path });
    }
  }
  return changes;
}
