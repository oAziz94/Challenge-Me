// Migration file discovery (STACK-ADR-003 section 4).
//
// Files are plain forward-only SQL under migrations/, named NNNN_<attribution>__<slug>.sql: a four-digit version, the module
// schema or `foundation` the file is attributed to, and a slug. Versions are contiguous ordered integers starting at 1.
// The checksum is SHA-256 over the exact bytes of the file; nothing is normalized (no line-ending or encoding rewriting).

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATION_ATTRIBUTIONS } from '../db/schema-inventory.ts';
import { MigrationError } from './errors.ts';
import { checkMigrationBytes, readMode, type MigrationMode, type StaticFinding } from './static-rules.ts';

export interface MigrationFile {
  readonly version: number;
  readonly fileName: string;
  readonly attribution: string;
  readonly slug: string;
  readonly mode: MigrationMode;
  /** SHA-256 hex over the exact file bytes. */
  readonly checksum: string;
  readonly bytes: Uint8Array;
}

const FILE_NAME = /^([0-9]{4})_([a-z]+)__([a-z0-9]+(?:_[a-z0-9]+)*)[.]sql$/;

export const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Parses a file name. Returns undefined when it does not follow the convention or the attribution is not allowed. */
export function parseMigrationFileName(fileName: string): { version: number; attribution: string; slug: string } | undefined {
  const m = FILE_NAME.exec(fileName);
  if (!m) return undefined;
  const version = Number(m[1]);
  const attribution = m[2] ?? '';
  const slug = m[3] ?? '';
  if (version < 1) return undefined;
  if (!(MIGRATION_ATTRIBUTIONS as readonly string[]).includes(attribution)) return undefined;
  return { version, attribution, slug };
}

/**
 * Reads every entry of the directory. Any entry that is not a well-formed migration file is an error (nothing is skipped
 * silently). Checks, in order: file names, duplicate versions, contiguity. Static rules are checked separately
 * (staticFindings), so that the runner can restrict them to pending files and CI can run them over all files.
 */
export async function loadMigrationFiles(directory: string): Promise<MigrationFile[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => {
    throw new MigrationError('DIRECTORY_UNREADABLE');
  });
  const parsed: { fileName: string; version: number; attribution: string; slug: string }[] = [];
  for (const e of entries) {
    const p = e.isFile() ? parseMigrationFileName(e.name) : undefined;
    if (!p) throw new MigrationError('INVALID_FILE_NAME', { fileName: e.name });
    parsed.push({ fileName: e.name, ...p });
  }
  parsed.sort((a, b) => a.version - b.version || (a.fileName < b.fileName ? -1 : 1));

  const dup = new Set<number>();
  for (let i = 1; i < parsed.length; i++) {
    const prev = parsed[i - 1];
    const cur = parsed[i];
    if (prev && cur && prev.version === cur.version) dup.add(cur.version);
  }
  if (dup.size > 0) throw new MigrationError('DUPLICATE_VERSION', { versions: [...dup] });

  for (let i = 0; i < parsed.length; i++) {
    const cur = parsed[i];
    if (cur && cur.version !== i + 1) throw new MigrationError('VERSION_GAP', { version: i + 1, fileName: cur.fileName });
  }

  const files: MigrationFile[] = [];
  for (const p of parsed) {
    const bytes = new Uint8Array(await readFile(join(directory, p.fileName)));
    files.push({ ...p, mode: readMode(bytes), checksum: sha256Hex(bytes), bytes });
  }
  return files;
}

export interface FileStaticFindings {
  readonly file: MigrationFile;
  readonly findings: readonly StaticFinding[];
}

/** Static rules over the given files; returns only files that have findings. */
export function staticFindings(files: readonly MigrationFile[]): FileStaticFindings[] {
  const out: FileStaticFindings[] = [];
  for (const file of files) {
    const findings = checkMigrationBytes(file.bytes);
    if (findings.length > 0) out.push({ file, findings });
  }
  return out;
}
