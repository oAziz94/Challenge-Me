// Schemas after the real migrations (Foundation brief section 9 and 16 row 3; DM section 4 and 22; STACK-ADR-003 section 5).
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CM_APP, CM_MIGRATOR, CM_OPS_READONLY, CM_QUEUE } from '../../src/foundation/db/role-inventory.ts';
import { AUDIT_SCHEMA, MIGRATION_CREATED_SCHEMAS, MODULE_SCHEMAS, TASK3_SCHEMAS } from '../../src/foundation/db/schema-inventory.ts';
import { createTestDatabase, type TestDatabase } from './support/database.ts';
import { migrateRepository } from './support/fixtures.ts';

let db: TestDatabase;
let admin: Client;
beforeAll(async () => {
  db = await createTestDatabase();
  await migrateRepository(db);
  admin = await db.connect('admin');
});
afterAll(async () => {
  await admin?.end();
  await db?.drop();
});

const q = async (sql: string, v?: unknown[]): Promise<Record<string, unknown>[]> => (await admin.query(sql, v)).rows;
const userSchemas = (): Promise<Record<string, unknown>[]> =>
  q(
    "SELECT nspname, pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY nspname",
  );

describe('schemas', () => {
  it('are exactly the fourteen module schemas, audit and migration, plus the PostgreSQL built-in public', async () => {
    const names = (await userSchemas()).map((r) => r.nspname).sort();
    expect(names).toEqual(['public', ...TASK3_SCHEMAS].sort());
    expect(MODULE_SCHEMAS).toHaveLength(14);
    expect(MIGRATION_CREATED_SCHEMAS).toHaveLength(15);
  });

  it('do not include the foundation resolver schema (task 4a) or any unapproved schema', async () => {
    const names = (await userSchemas()).map((r) => r.nspname);
    expect(names).not.toContain('foundation');
    expect(names.filter((n) => n !== 'public' && !(TASK3_SCHEMAS as readonly string[]).includes(String(n)))).toEqual([]);
  });

  it('are all owned by cm_migrator (the built-in public schema is not decided here and is not asserted)', async () => {
    for (const r of await userSchemas()) if (r.nspname !== 'public') expect([r.nspname, r.owner]).toEqual([r.nspname, CM_MIGRATOR]);
  });

  it('module schemas and audit are empty and carry no grant beyond the owner: no PUBLIC, no runtime role', async () => {
    for (const s of [...MODULE_SCHEMAS, AUDIT_SCHEMA]) {
      const acl = await q(
        `SELECT coalesce(g.rolname, 'PUBLIC') AS grantee, a.privilege_type FROM pg_namespace n,
                aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a LEFT JOIN pg_roles g ON g.oid = a.grantee
          WHERE n.nspname = $1 ORDER BY 1, 2`,
        [s],
      );
      expect(acl.every((r) => r.grantee === CM_MIGRATOR)).toBe(true);
      const objects = await q(
        'SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1',
        [s],
      );
      expect(objects[0]?.n).toBe(0);
      for (const role of [CM_APP, CM_QUEUE, CM_OPS_READONLY]) {
        const r = await q("SELECT has_schema_privilege($1, $2, 'CREATE') AS c, has_schema_privilege($1, $2, 'USAGE') AS u", [role, s]);
        expect(r[0]).toEqual({ c: false, u: false });
      }
    }
  });

  it('migration holds no objects except migration.history and what belongs to it', async () => {
    const rels = await q(
      "SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'migration' ORDER BY 1",
    );
    expect(rels).toEqual([
      { relname: 'history', relkind: 'r' },
      { relname: 'history_file_name_key', relkind: 'i' },
      { relname: 'history_pkey', relkind: 'i' },
    ]);
  });
});

const EXPECTED_COLUMNS = [
  ['version', 'integer', true],
  ['file_name', 'text', true],
  ['attribution', 'text', true],
  ['checksum', 'text', true],
  ['mode', 'text', true],
  ['state', 'text', true],
  ['started_at', 'timestamp with time zone', true],
  ['completed_at', 'timestamp with time zone', false],
];

describe('migration.history (STACK-ADR-003 sections 5 and 7)', () => {
  it('is an ordinary permanent table owned by cm_migrator, with no RLS, no policy, no trigger, no rule', async () => {
    const t = await q(
      `SELECT pg_get_userbyid(relowner) AS owner, relkind, relpersistence, relrowsecurity, relforcerowsecurity,
              (SELECT count(*)::int FROM pg_policy WHERE polrelid = c.oid) AS policies,
              (SELECT count(*)::int FROM pg_trigger WHERE tgrelid = c.oid) AS triggers,
              (SELECT count(*)::int FROM pg_rewrite WHERE ev_class = c.oid) AS rules
         FROM pg_class c WHERE c.oid = 'migration.history'::regclass`,
    );
    expect(t[0]).toEqual({
      owner: CM_MIGRATOR,
      relkind: 'r',
      relpersistence: 'p',
      relrowsecurity: false,
      relforcerowsecurity: false,
      policies: 0,
      triggers: 0,
      rules: 0,
    });
  });

  it('has exactly the contracted columns and no applied_by or person/environment identifier', async () => {
    const cols = await q(
      `SELECT attname, format_type(atttypid, atttypmod) AS type, attnotnull FROM pg_attribute
        WHERE attrelid = 'migration.history'::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum`,
    );
    expect(cols.map((c) => [c.attname, c.type, c.attnotnull])).toEqual(EXPECTED_COLUMNS);
    expect(cols.map((c) => c.attname)).not.toContain('applied_by');
  });

  it('has version as primary key, a unique file_name, and the lifecycle check constraints', async () => {
    const k = await q(
      "SELECT conname, contype FROM pg_constraint WHERE conrelid = 'migration.history'::regclass AND contype <> 'n' ORDER BY conname",
    );
    const byName = Object.fromEntries(k.map((r) => [String(r.conname), String(r.contype)]));
    expect(byName).toMatchObject({ history_pkey: 'p', history_file_name_key: 'u' });
    expect(Object.keys(byName).sort()).toEqual([
      'history_checksum_sha256_hex',
      'history_completed_at_iff_complete',
      'history_file_name_key',
      'history_mode_known',
      'history_pkey',
      'history_state_known',
      'history_transactional_is_complete',
      'history_version_positive',
    ]);
    const pk = await q(
      "SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = 'migration.history'::regclass AND i.indisprimary",
    );
    expect(pk).toEqual([{ attname: 'version' }]);
  });

  it('refuses rows that break the lifecycle contract (checked as the owner, which the database cannot otherwise bind)', async () => {
    const c = await db.connect('cm_migrator');
    const ins = (mode: string, state: string, done: string): string =>
      `INSERT INTO migration.history (version, file_name, attribution, checksum, mode, state, completed_at) VALUES (900, 'x.sql', 'foundation', '${'a'.repeat(64)}', '${mode}', '${state}', ${done})`;
    await expect(c.query(ins('transactional', 'started', 'NULL'))).rejects.toMatchObject({ code: '23514' });
    await expect(c.query(ins('no_transaction', 'complete', 'NULL'))).rejects.toMatchObject({ code: '23514' });
    await expect(c.query(ins('no_transaction', 'started', 'now()'))).rejects.toMatchObject({ code: '23514' });
    await expect(c.query(ins('other', 'complete', 'now()'))).rejects.toMatchObject({ code: '23514' });
    await expect(c.query(ins('transactional', 'complete', 'now()').replace('a'.repeat(64), 'ZZ'))).rejects.toMatchObject({ code: '23514' });
    await c.end();
  });
});
