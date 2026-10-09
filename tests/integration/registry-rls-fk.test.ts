// Table-category registry gate, the RLS template and the no-cross-schema-FK assertion (DM section 6.2, 6.3; Foundation brief
// section 16 rows 3, 7, 8). Each negative case builds the offending table in a disposable database, as a fixture, and proves
// the gate names it.
import type { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { checkTableRegistry, findCrossSchemaForeignKeys } from '../../src/foundation/db/catalogue-checks.ts';
import { tenantIsolationStatements, TENANT_POLICY_EXPRESSION } from '../../src/foundation/db/rls-template.ts';
import { TABLE_REGISTRY, type TableRegistryEntry } from '../../src/foundation/db/table-registry.ts';
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
// Every case runs in a transaction that is rolled back, so cases cannot influence each other.
beforeEach(async () => {
  await admin.query('BEGIN');
});
afterEach(async () => {
  await admin.query('ROLLBACK');
});

const entry = (
  schema: string,
  table: string,
  category: TableRegistryEntry['category'],
  over: Partial<TableRegistryEntry> = {},
): TableRegistryEntry => ({
  schema,
  table,
  category,
  classification: 'S1',
  rls: category === 'TENANT' ? 'forced-tenant-isolation' : category === 'GLOBAL-IDENTITY' ? 'user-visibility' : 'none',
  cmAppAccess: 'category-profile',
  purgeHandler: 'none',
  retentionClass: 'none',
  ...over,
});
const gate = (extra: TableRegistryEntry[] = []): Promise<string[]> => checkTableRegistry(admin, [...TABLE_REGISTRY, ...extra]);
const applyTemplate = async (schema: string, table: string): Promise<void> => {
  for (const s of tenantIsolationStatements(schema, table)) await admin.query(s);
};

describe('the registry against the migrated database', () => {
  it('has every table exactly once and no violation', async () => {
    expect(await gate()).toEqual([]);
    expect(await checkTableRegistry(admin, TABLE_REGISTRY)).toEqual([]);
  });
  it('fails on a table that is not registered', async () => {
    await admin.query('CREATE TABLE content.stray (id int)');
    expect(await gate()).toEqual(['content.stray: table is not in the registry']);
  });
  it('fails on a registry entry without a table, and on a duplicate entry', async () => {
    expect(await gate([entry('content', 'ghost', 'REFERENCE')])).toEqual(['content.ghost: registry entry without a table']);
    const dup = TABLE_REGISTRY[0] as TableRegistryEntry;
    expect(await checkTableRegistry(admin, [dup, dup])).toContain('migration.history: registered 2 times (must be exactly once)');
  });
  it('encodes the migration.history narrowing: cm_app gets no access, and any grant to it is caught', async () => {
    await admin.query('GRANT USAGE ON SCHEMA migration TO cm_app');
    await admin.query('GRANT SELECT ON migration.history TO cm_app');
    expect(await gate()).toEqual(['migration.history: cm_app has access but the registry narrows it to none']);
  });
});

describe('REFERENCE, OPERATIONAL, PLATFORM and GLOBAL-IDENTITY rules', () => {
  it('REFERENCE and PLATFORM tables must not enable RLS or carry policies', async () => {
    await admin.query('CREATE TABLE content.ref (id int)');
    await admin.query('ALTER TABLE content.ref ENABLE ROW LEVEL SECURITY');
    expect(await gate([entry('content', 'ref', 'REFERENCE')])).toContain('content.ref: REFERENCE table must not enable row level security');
  });
  it('cm_app is SELECT-only on REFERENCE and PLATFORM tables (DM section 6.3)', async () => {
    await admin.query('CREATE TABLE content.ref (id int)');
    await admin.query('GRANT USAGE ON SCHEMA content TO cm_app');
    await admin.query('GRANT SELECT, INSERT ON content.ref TO cm_app');
    expect(await gate([entry('content', 'ref', 'REFERENCE')])).toEqual([
      'content.ref: cm_app holds INSERT on a REFERENCE table (SELECT only)',
    ]);
    expect(await gate([entry('content', 'ref', 'PLATFORM')])).toEqual([
      'content.ref: cm_app holds INSERT on a PLATFORM table (SELECT only)',
    ]);
    expect(await gate([entry('content', 'ref', 'OPERATIONAL')])).toEqual([]);
  });
  it('GLOBAL-IDENTITY needs forced RLS and a user_visibility policy', async () => {
    await admin.query('CREATE TABLE identity.person (id int)');
    expect(await gate([entry('identity', 'person', 'GLOBAL-IDENTITY')])).toEqual([
      'identity.person: GLOBAL-IDENTITY table must enable and force row level security',
      'identity.person: GLOBAL-IDENTITY table has no user_visibility policy',
    ]);
    await admin.query('ALTER TABLE identity.person ENABLE ROW LEVEL SECURITY');
    await admin.query('ALTER TABLE identity.person FORCE ROW LEVEL SECURITY');
    await admin.query('CREATE POLICY user_visibility ON identity.person USING (true)');
    expect(await gate([entry('identity', 'person', 'GLOBAL-IDENTITY')])).toEqual([]);
  });
  it('rejects a registry entry whose rls does not match its category', async () => {
    await admin.query('CREATE TABLE content.ref (id int)');
    expect(await gate([entry('content', 'ref', 'REFERENCE', { rls: 'forced-tenant-isolation' })])).toEqual([
      'content.ref: registry rls does not match category REFERENCE',
    ]);
  });
});

describe('TENANT tables and the accepted RLS template (DM section 6.2)', () => {
  const mk = (): Promise<unknown> => admin.query('CREATE TABLE content.item (id int, tenant_id uuid NOT NULL)');
  const tenant = (): TableRegistryEntry => entry('content', 'item', 'TENANT');

  it('the template produces a table the gate accepts', async () => {
    await mk();
    await applyTemplate('content', 'item');
    expect(await gate([tenant()])).toEqual([]);
  });
  it('fails without tenant_id, with a non-uuid tenant_id, without RLS, without FORCE, without the policy', async () => {
    await admin.query('CREATE TABLE content.item (id int)');
    expect(await gate([tenant()])).toContain('content.item: TENANT table has no uuid tenant_id');
    await admin.query('ROLLBACK');
    await admin.query('BEGIN');
    await admin.query('CREATE TABLE content.item (id int, tenant_id text)');
    expect(await gate([tenant()])).toContain('content.item: TENANT table has no uuid tenant_id');
    await admin.query('ROLLBACK');
    await admin.query('BEGIN');
    await mk();
    const v = await gate([tenant()]);
    expect(v).toEqual([
      'content.item: TENANT table does not enable row level security',
      'content.item: TENANT table does not force row level security',
      'content.item: TENANT table has no tenant_isolation policy',
    ]);
    await admin.query('ALTER TABLE content.item ENABLE ROW LEVEL SECURITY');
    expect(await gate([tenant()])).toContain('content.item: TENANT table does not force row level security');
  });
  it('fails when the policy expression drops the load-bearing nullif', async () => {
    await mk();
    await admin.query('ALTER TABLE content.item ENABLE ROW LEVEL SECURITY');
    await admin.query('ALTER TABLE content.item FORCE ROW LEVEL SECURITY');
    await admin.query(
      "CREATE POLICY tenant_isolation ON content.item USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)",
    );
    const v = await gate([tenant()]);
    expect(v).toContain('content.item: tenant_isolation USING differs from the accepted expression');
    expect(v).toContain('content.item: tenant_isolation WITH CHECK differs from the accepted expression');
  });
  it('fails on a missing WITH CHECK, a policy for one command only, and an extra permissive policy', async () => {
    await mk();
    await admin.query('ALTER TABLE content.item ENABLE ROW LEVEL SECURITY');
    await admin.query('ALTER TABLE content.item FORCE ROW LEVEL SECURITY');
    await admin.query(`CREATE POLICY tenant_isolation ON content.item FOR SELECT USING (${TENANT_POLICY_EXPRESSION})`);
    await admin.query('CREATE POLICY open_door ON content.item USING (true)');
    const v = await gate([tenant()]);
    expect(v).toContain('content.item: tenant_isolation is not a permissive ALL policy for PUBLIC');
    expect(v).toContain('content.item: tenant_isolation WITH CHECK differs from the accepted expression');
    expect(v).toContain('content.item: extra permissive policy open_door on a TENANT table');
  });
});

describe('the template is fail-closed in a real session', () => {
  it('shows only the transaction-local tenant, rejects a foreign tenant row, and shows nothing once the setting is gone', async () => {
    await admin.query('ROLLBACK');
    await admin.query('BEGIN');
    await admin.query('CREATE TABLE content.item (id int, tenant_id uuid NOT NULL)');
    await applyTemplate('content', 'item');
    await admin.query('GRANT USAGE ON SCHEMA content TO cm_app');
    await admin.query('GRANT SELECT, INSERT ON content.item TO cm_app');
    await admin.query('COMMIT');
    await admin.query('BEGIN');
    const a = '11111111-1111-1111-1111-111111111111';
    const b = '22222222-2222-2222-2222-222222222222';
    const app = await db.connect('cm_app');
    await app.query('BEGIN');
    await app.query("SELECT set_config('app.tenant_id', $1, true)", [a]);
    await app.query('INSERT INTO content.item VALUES (1, $1)', [a]);
    await expect(app.query('INSERT INTO content.item VALUES (2, $1)', [b])).rejects.toMatchObject({ code: '42501' });
    await app.query('ROLLBACK');
    await app.query('BEGIN');
    await app.query("SELECT set_config('app.tenant_id', $1, true)", [a]);
    await app.query('INSERT INTO content.item VALUES (1, $1)', [a]);
    expect((await app.query('SELECT count(*)::int AS n FROM content.item')).rows[0]?.n).toBe(1);
    await app.query('COMMIT');
    // After the transaction the setting is the empty string: nullif turns it into NULL and no row matches (no error either).
    expect((await app.query("SELECT current_setting('app.tenant_id', true) AS s")).rows[0]?.s).toBe('');
    expect((await app.query('SELECT count(*)::int AS n FROM content.item')).rows[0]?.n).toBe(0);
    await app.end();
    await admin.query('ROLLBACK');
    await admin.query('BEGIN');
    await admin.query('DROP TABLE content.item');
    await admin.query('COMMIT');
    await admin.query('BEGIN');
  });
});

describe('no cross-schema foreign key (DM section 4, ADR-013, Rem R4)', () => {
  it('finds none in the migrated database', async () => {
    expect(await findCrossSchemaForeignKeys(admin)).toEqual([]);
  });
  it('finds a foreign key from one schema to another, and not one inside a schema', async () => {
    await admin.query('CREATE TABLE content.a (id int PRIMARY KEY)');
    await admin.query('CREATE TABLE challenge.b (id int PRIMARY KEY, a_id int)');
    await admin.query('CREATE TABLE content.c (id int, a_id int REFERENCES content.a (id))');
    expect(await findCrossSchemaForeignKeys(admin)).toEqual([]);
    await admin.query('ALTER TABLE challenge.b ADD CONSTRAINT b_a_fk FOREIGN KEY (a_id) REFERENCES content.a (id)');
    expect(await findCrossSchemaForeignKeys(admin)).toEqual(['challenge.b -> content.a (b_a_fk)']);
  });
  it('also finds a foreign key into the migration or audit schema', async () => {
    await admin.query('CREATE TABLE audit.e (id int PRIMARY KEY)');
    await admin.query('CREATE TABLE tenancy.x (e_id int REFERENCES audit.e (id))');
    expect(await findCrossSchemaForeignKeys(admin)).toEqual(['tenancy.x -> audit.e (x_e_id_fkey)']);
  });
});
