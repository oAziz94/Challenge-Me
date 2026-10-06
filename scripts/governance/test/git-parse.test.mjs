import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommitObject, parseNameStatusZ, parseNulList, parseRevList } from '../lib/git-parse.mjs';

const H = 'a'.repeat(40);
const ident = (n, e) => `${n} <${e}> 1700000000 +0000`;
const obj = (headerLines, message) => `${headerLines.join('\n')}\n\n${message}`;
const goodHeader = [
  `tree ${'b'.repeat(40)}`,
  `author ${ident('oAziz94', 'a@x')}`,
  `committer ${ident('oAziz94', 'c@x')}`,
];

// --- rev-list -----------------------------------------------------------------------------------

test('parseRevList: exact 40-hex ids only, no duplicates', () => {
  assert.deepEqual(parseRevList(`${H}\n${'c'.repeat(40)}\n`), [H, 'c'.repeat(40)]);
  assert.deepEqual(parseRevList(''), []);
  assert.throws(() => parseRevList('abc123\n'));
  assert.throws(() => parseRevList(`${H.toUpperCase()}\n`));
  assert.throws(() => parseRevList(`${H}\n${H}\n`));
  assert.throws(() => parseRevList(`${H} extra\n`));
});

// --- commit objects -----------------------------------------------------------------------------

test('parseCommitObject: reads author and committer; the message is never parsed', () => {
  const c = parseCommitObject(H, obj(goodHeader, 'subject\n\nbody'));
  assert.equal(c.authorName, 'oAziz94');
  assert.equal(c.authorEmail, 'a@x');
  assert.equal(c.committerEmail, 'c@x');
  assert.equal(c.message, 'subject\n\nbody');
});

test('parseCommitObject: a message that imitates headers or records cannot change the identities', () => {
  const forged = `x\n\nauthor ${ident('Evil', 'evil@x')}\ncommitter ${ident('Evil', 'evil@x')}\n\x1e${H}\x1fEvil\x1fe@x\n`;
  const c = parseCommitObject(H, obj(goodHeader, forged));
  assert.equal(c.authorName, 'oAziz94');
  assert.equal(c.hash, H);
  assert.match(c.message, /\x1e/);
});

test('parseCommitObject: continuation header lines (gpgsig) are skipped', () => {
  const sig = ['gpgsig -----BEGIN PGP SIGNATURE-----', ' ', ' abc', ' -----END PGP SIGNATURE-----'];
  const c = parseCommitObject(H, obj([...goodHeader, ...sig], 'msg'));
  assert.equal(c.authorName, 'oAziz94');
});

test('parseCommitObject fails closed on malformed objects', () => {
  assert.throws(() => parseCommitObject('short', obj(goodHeader, 'm')));
  assert.throws(() => parseCommitObject(H, goodHeader.join('\n'))); // no header terminator
  assert.throws(() => parseCommitObject(H, obj([goodHeader[0], goodHeader[1]], 'm'))); // no committer
  assert.throws(() => parseCommitObject(H, obj([...goodHeader, goodHeader[1]], 'm'))); // two authors
  assert.throws(() => parseCommitObject(H, obj([goodHeader[0], 'author nobody', goodHeader[2]], 'm'))); // malformed ident
  assert.throws(() => parseCommitObject(H, obj([goodHeader[0], `author ${ident('x', 'y')} junk`, goodHeader[2]], 'm')));
});

// --- NUL-delimited output -----------------------------------------------------------------------

test('parseNameStatusZ: single-path statuses keep the exact pathname', () => {
  const hostile = 'docs/specifications/authoritative/01_Dömain "q"\t日本\nx.md';
  assert.deepEqual(parseNameStatusZ(`M\0${hostile}\0A\0b.md\0D\0c.md\0T\0d.md\0`), [
    { status: 'M', path: hostile },
    { status: 'A', path: 'b.md' },
    { status: 'D', path: 'c.md' },
    { status: 'T', path: 'd.md' },
  ]);
  assert.deepEqual(parseNameStatusZ(''), []);
});

test('parseNameStatusZ: rename and copy carry two pathnames, both reported with the R/C status', () => {
  assert.deepEqual(parseNameStatusZ('R100\0old.md\0new.md\0M\0x.md\0'), [
    { status: 'R', path: 'old.md' },
    { status: 'R', path: 'new.md' },
    { status: 'M', path: 'x.md' },
  ]);
  assert.deepEqual(parseNameStatusZ('C75\0a.md\0b.md\0'), [
    { status: 'C', path: 'a.md' },
    { status: 'C', path: 'b.md' },
  ]);
});

test('parseNameStatusZ fails closed on malformed records', () => {
  assert.throws(() => parseNameStatusZ('M\0a.md')); // not terminated
  assert.throws(() => parseNameStatusZ('Z\0a.md\0')); // unknown status
  assert.throws(() => parseNameStatusZ('"M"\0a.md\0')); // quoted status
  assert.throws(() => parseNameStatusZ('R100\0only-one.md\0')); // truncated rename
  assert.throws(() => parseNameStatusZ('M\0\0')); // empty path
  assert.throws(() => parseNameStatusZ('M\0a.md\0M\0')); // status without a path
  assert.throws(() => parseNameStatusZ('a.md\0')); // path where a status belongs
});

test('parseNulList', () => {
  assert.deepEqual(parseNulList('a\0b c\0'), ['a', 'b c']);
  assert.deepEqual(parseNulList(''), []);
  assert.throws(() => parseNulList('a\0b'));
  assert.throws(() => parseNulList('a\0\0b\0'));
});
