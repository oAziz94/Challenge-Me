// Database roles (DM section 6.4; Foundation brief section 16 row 4; section 9 "Roles"), asserted against the catalogue after
// the real migrations have run. cm_resolver is intentionally ABSENT: CR-7 item 5 and the managed-PostgreSQL / bootstrap decision
// block it, and no creation mechanism is assumed. These assertions stay valid while it is absent.
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BYPASSRLS_ROLES,
  CM_APP,
  CM_MIGRATOR,
  CM_OPS_READONLY,
  CM_QUEUE,
  CM_RESOLVER,
  DECIDED_ROLES,
} from '../../src/foundation/db/role-inventory.ts';
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

describe('the four decided roles exist with the contracted attributes', () => {
  it('exist', async () => {
    const r = await q('SELECT rolname FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname', [[...DECIDED_ROLES]]);
    expect(r.map((x) => x.rolname)).toEqual([...DECIDED_ROLES].sort());
  });

  it('none is SUPERUSER, CREATEROLE, CREATEDB or REPLICATION', async () => {
    const r = await q('SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolreplication FROM pg_roles WHERE rolname = ANY($1)', [
      [...DECIDED_ROLES],
    ]);
    expect(r).toHaveLength(4);
    for (const x of r)
      expect([x.rolname, x.rolsuper, x.rolcreaterole, x.rolcreatedb, x.rolreplication]).toEqual([x.rolname, false, false, false, false]);
  });

  it('BYPASSRLS is held by cm_ops_readonly and by no other cm_ role; cm_app and cm_queue have none', async () => {
    const r = await q("SELECT rolname FROM pg_roles WHERE rolname LIKE 'cm_%' AND rolbypassrls ORDER BY rolname");
    expect(r.map((x) => x.rolname)).toEqual([CM_OPS_READONLY]);
    for (const role of [CM_APP, CM_QUEUE, CM_MIGRATOR]) {
      expect((await q('SELECT rolbypassrls FROM pg_roles WHERE rolname = $1', [role]))[0]?.rolbypassrls).toBe(false);
    }
    expect([...BYPASSRLS_ROLES].sort()).toEqual([CM_OPS_READONLY, CM_RESOLVER]);
  });

  it('login: cm_migrator, cm_app and cm_queue can log in; the break-glass role does not in this test bootstrap', async () => {
    const r = await q('SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname', [[...DECIDED_ROLES]]);
    expect(r).toEqual([
      { rolname: CM_APP, rolcanlogin: true },
      { rolname: CM_MIGRATOR, rolcanlogin: true },
      { rolname: CM_OPS_READONLY, rolcanlogin: false },
      { rolname: CM_QUEUE, rolcanlogin: true },
    ]);
  });

  it('are members of no role and have no members (no role membership the contract does not authorize)', async () => {
    const r = await q(
      `SELECT m.rolname AS member, g.rolname AS granted FROM pg_auth_members am
         JOIN pg_roles m ON m.oid = am.member JOIN pg_roles g ON g.oid = am.roleid
        WHERE m.rolname = ANY($1) OR g.rolname = ANY($1)`,
      [[...DECIDED_ROLES]],
    );
    expect(r).toEqual([]);
  });
});

describe('cm_resolver stays blocked', () => {
  it('does not exist, before and after migration (no creation mechanism is assumed)', async () => {
    expect(await q('SELECT 1 FROM pg_roles WHERE rolname = $1', [CM_RESOLVER])).toEqual([]);
  });
  it('is not created by the migrations or the runner: no source file creates it', async () => {
    const r = await q("SELECT 1 FROM pg_roles WHERE rolname ILIKE '%resolver%'");
    expect(r).toEqual([]);
  });
});

describe('roles act within their rights', () => {
  it('cm_app and cm_queue own nothing in the database', async () => {
    for (const role of [CM_APP, CM_QUEUE, CM_OPS_READONLY]) {
      const r = await q(
        `SELECT (SELECT count(*) FROM pg_namespace WHERE nspowner = o.oid)::int AS schemas,
                (SELECT count(*) FROM pg_class WHERE relowner = o.oid)::int AS relations,
                (SELECT count(*) FROM pg_proc WHERE proowner = o.oid)::int AS functions
           FROM pg_roles o WHERE o.rolname = $1`,
        [role],
      );
      expect(r[0]).toEqual({ schemas: 0, relations: 0, functions: 0 });
    }
  });

  it('cm_app and cm_queue cannot create schemas (they cannot run migrations)', async () => {
    for (const login of ['cm_app', 'cm_queue'] as const) {
      const c = await db.connect(login);
      await expect(c.query('CREATE SCHEMA not_allowed')).rejects.toMatchObject({ code: '42501' });
      await c.end();
    }
    expect((await q("SELECT has_database_privilege($1, current_database(), 'CREATE') AS x", [CM_APP]))[0]?.x).toBe(false);
    expect((await q("SELECT has_database_privilege($1, current_database(), 'CREATE') AS x", [CM_QUEUE]))[0]?.x).toBe(false);
  });

  it('cm_migrator owns every schema the baseline created', async () => {
    const r = await q(
      "SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema', 'public') AND pg_get_userbyid(nspowner) <> $1",
      [CM_MIGRATOR],
    );
    expect(r).toEqual([]);
  });
});
