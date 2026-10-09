// The exact STACK-ADR-003 section 6 grant matrix and closed schema contents, asserted against the catalogue and exercised with
// real roles. cm_resolver is intentionally absent: its matrix row ("none") is proven by the ACL contents, which cannot name a
// role that does not exist, and no assertion here requires the role to exist.
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrationSchemaViolations } from '../../src/foundation/db/migration-schema-check.ts';
import { CM_APP, CM_MIGRATOR, CM_OPS_READONLY, CM_QUEUE, CM_RESOLVER } from '../../src/foundation/db/role-inventory.ts';
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

/** Every (grantee, privilege) pair in the ACL, with PUBLIC spelled out; owner defaults included. */
async function schemaGrants(): Promise<string[]> {
  const r = await q(
    `SELECT coalesce(g.rolname, 'PUBLIC') AS grantee, a.privilege_type AS p
       FROM pg_namespace n, aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a LEFT JOIN pg_roles g ON g.oid = a.grantee
      WHERE n.nspname = 'migration' ORDER BY 1, 2`,
  );
  return r.map((x) => `${String(x.grantee)}:${String(x.p)}`);
}
async function tableGrants(): Promise<string[]> {
  const r = await q(
    `SELECT coalesce(g.rolname, 'PUBLIC') AS grantee, a.privilege_type AS p
       FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a LEFT JOIN pg_roles g ON g.oid = a.grantee
      WHERE c.oid = 'migration.history'::regclass ORDER BY 1, 2`,
  );
  return r.map((x) => `${String(x.grantee)}:${String(x.p)}`);
}

describe('grant matrix: schema migration', () => {
  it('is owned by cm_migrator, who holds USAGE and CREATE; cm_ops_readonly holds USAGE; nobody else holds anything', async () => {
    expect(await schemaGrants()).toEqual([`${CM_MIGRATOR}:CREATE`, `${CM_MIGRATOR}:USAGE`, `${CM_OPS_READONLY}:USAGE`]);
  });
  it('gives PUBLIC, cm_app, cm_queue and cm_resolver nothing (cm_resolver need not exist)', async () => {
    const grantees = new Set((await schemaGrants()).map((g) => g.split(':')[0]));
    for (const none of ['PUBLIC', CM_APP, CM_QUEUE, CM_RESOLVER]) expect(grantees.has(none)).toBe(false);
  });
  it('per role, has_schema_privilege agrees', async () => {
    const want: Record<string, [boolean, boolean]> = {
      [CM_MIGRATOR]: [true, true],
      [CM_OPS_READONLY]: [true, false],
      [CM_APP]: [false, false],
      [CM_QUEUE]: [false, false],
    };
    for (const [role, [usage, create]] of Object.entries(want)) {
      const r = await q(
        "SELECT has_schema_privilege($1, 'migration', 'USAGE') AS u, has_schema_privilege($1, 'migration', 'CREATE') AS c",
        [role],
      );
      expect([role, r[0]?.u, r[0]?.c]).toEqual([role, usage, create]);
    }
  });
});

describe('grant matrix: table migration.history', () => {
  it('cm_migrator owns it; cm_ops_readonly holds SELECT only; nobody else holds anything', async () => {
    const grants = await tableGrants();
    const owner = grants.filter((g) => g.startsWith(`${CM_MIGRATOR}:`));
    expect(owner.length).toBeGreaterThan(0);
    expect(grants.filter((g) => !g.startsWith(`${CM_MIGRATOR}:`))).toEqual([`${CM_OPS_READONLY}:SELECT`]);
  });
  it('REFERENCE ceiling is narrowed: cm_app has NO select and no other access of any kind', async () => {
    const r = await q(
      `SELECT has_table_privilege($1, 'migration.history', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') AS t,
              has_any_column_privilege($1, 'migration.history', 'SELECT, INSERT, UPDATE, REFERENCES') AS c`,
      [CM_APP],
    );
    expect(r[0]).toEqual({ t: false, c: false });
    expect((await q("SELECT has_table_privilege($1, 'migration.history', 'SELECT') AS s", [CM_APP]))[0]?.s).toBe(false);
  });
  it('cm_queue has nothing; cm_ops_readonly can SELECT and nothing else', async () => {
    expect(
      (
        await q(
          "SELECT has_table_privilege($1, 'migration.history', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') AS t",
          [CM_QUEUE],
        )
      )[0]?.t,
    ).toBe(false);
    for (const [priv, want] of [
      ['SELECT', true],
      ['INSERT', false],
      ['UPDATE', false],
      ['DELETE', false],
      ['TRUNCATE', false],
      ['REFERENCES', false],
      ['TRIGGER', false],
    ] as const) {
      expect([
        priv,
        (await q('SELECT has_table_privilege($1, $2::regclass, $3) AS x', [CM_OPS_READONLY, 'migration.history', priv]))[0]?.x,
      ]).toEqual([priv, want]);
    }
  });
  it('has no column-level grants and PUBLIC has no privilege on it', async () => {
    expect(await q("SELECT 1 FROM pg_attribute WHERE attrelid = 'migration.history'::regclass AND attacl IS NOT NULL")).toEqual([]);
    expect((await tableGrants()).some((g) => g.startsWith('PUBLIC:'))).toBe(false);
  });
});

describe('the roles behave as the matrix says (real sessions)', () => {
  it('cm_app and cm_queue are refused at the schema, on SELECT, INSERT and DDL', async () => {
    for (const login of ['cm_app', 'cm_queue'] as const) {
      const c = await db.connect(login);
      for (const sql of [
        'SELECT * FROM migration.history',
        "INSERT INTO migration.history (version, file_name, attribution, checksum, mode, state) VALUES (1, 'x', 'foundation', 'x', 'transactional', 'complete')",
        'UPDATE migration.history SET state = state',
        'CREATE TABLE migration.other (a int)',
      ]) {
        await expect(c.query(sql)).rejects.toMatchObject({ code: '42501' });
      }
      await c.end();
    }
  });

  it('cm_ops_readonly can read the history and cannot change it or create anything', async () => {
    await admin.query('BEGIN');
    try {
      await admin.query(`SET LOCAL ROLE ${CM_OPS_READONLY}`);
      expect((await admin.query('SELECT count(*)::int AS n FROM migration.history')).rows[0]?.n).toBeGreaterThan(0);
      for (const sql of [
        'DELETE FROM migration.history',
        "UPDATE migration.history SET state = 'complete'",
        'TRUNCATE migration.history',
        'CREATE TABLE migration.other (a int)',
      ]) {
        await admin.query('SAVEPOINT s');
        await expect(admin.query(sql)).rejects.toMatchObject({ code: '42501' });
        await admin.query('ROLLBACK TO SAVEPOINT s');
      }
    } finally {
      await admin.query('ROLLBACK');
    }
  });

  it('PUBLIC cannot use the schema: a role with no grant at all is refused', async () => {
    await admin.query('BEGIN');
    try {
      await admin.query('CREATE ROLE cm_test_nobody NOLOGIN');
      await admin.query('SET LOCAL ROLE cm_test_nobody');
      await expect(admin.query('SELECT * FROM migration.history')).rejects.toMatchObject({ code: '42501' });
    } finally {
      await admin.query('ROLLBACK');
    }
  });
});

describe('default privileges and closed schema contents (STACK-ADR-003 section 6)', () => {
  it('the only default privilege on schema migration is SELECT on tables for cm_ops_readonly', async () => {
    const r = await q(
      "SELECT pg_get_userbyid(defaclrole) AS owner, defaclobjtype AS kind, defaclacl::text AS acl FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace WHERE n.nspname = 'migration'",
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ owner: CM_MIGRATOR, kind: 'r' });
    expect(String(r[0]?.acl)).toContain(`${CM_OPS_READONLY}=r/${CM_MIGRATOR}`);
    const entries = String(r[0]?.acl).replace(/[{}]/g, '').split(',');
    expect(entries.filter((e) => !e.startsWith(CM_MIGRATOR + '=') && e !== `${CM_OPS_READONLY}=r/${CM_MIGRATOR}`)).toEqual([]);
  });
  it('after migration the schema holds nothing outside the closed set', async () => {
    expect(await migrationSchemaViolations(admin)).toEqual([]);
  });
});

describe('the closed-contents assertion detects every stray object class', () => {
  const strays: [string, string][] = [
    ['a table', 'CREATE TABLE migration.stray (a int)'],
    ['a view', 'CREATE VIEW migration.stray AS SELECT 1 AS a'],
    ['a materialized view', 'CREATE MATERIALIZED VIEW migration.stray AS SELECT 1 AS a'],
    ['a sequence', 'CREATE SEQUENCE migration.stray'],
    ['a function', 'CREATE FUNCTION migration.stray() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$'],
    ['a type', "CREATE TYPE migration.stray AS ENUM ('a')"],
    ['a domain', 'CREATE DOMAIN migration.stray AS int'],
    [
      'a trigger',
      'CREATE FUNCTION public.cm_noop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; CREATE TRIGGER stray BEFORE INSERT ON migration.history FOR EACH ROW EXECUTE FUNCTION public.cm_noop()',
    ],
    ['a policy', 'CREATE POLICY stray ON migration.history USING (true)'],
    ['a collation', "CREATE COLLATION migration.stray (provider = icu, locale = 'und')"],
  ];
  for (const [label, ddl] of strays) {
    it('flags ' + label, async () => {
      await admin.query('BEGIN');
      try {
        await admin.query(ddl);
        expect((await migrationSchemaViolations(admin)).length).toBeGreaterThan(0);
      } finally {
        await admin.query('ROLLBACK');
      }
    });
  }
  it('flags a default privilege that grants beyond the matrix', async () => {
    await admin.query('BEGIN');
    try {
      await admin.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${CM_MIGRATOR} IN SCHEMA migration GRANT SELECT ON TABLES TO ${CM_APP}`);
      expect((await migrationSchemaViolations(admin)).length).toBeGreaterThan(0);
    } finally {
      await admin.query('ROLLBACK');
    }
  });
});
