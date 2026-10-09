// Catalogue assertions written as SQL against the system catalogues (STACK-ADR-001 4.7; DM section 6.3 "CI test"; STACK-ADR-003
// section 6). They read pg_catalog only; they touch no module table and no data.
//
// Deferred, because a dependency does not exist yet: the OPERATIONAL rule "no column classified S2-S4 except hashes" needs the
// Privacy-owned classification register (task 12). It is not guessed here.

import { CM_APP } from './role-inventory.ts';
import { RLS_BY_CATEGORY, type TableRegistryEntry } from './table-registry.ts';
import { TENANT_POLICY_EXPRESSION, TENANT_POLICY_NAME } from './rls-template.ts';

/** The part of a pg client these checks need. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

const USER_TABLES = `
  SELECT n.nspname AS schema, c.relname AS name, c.oid::int AS oid, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
     AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
   ORDER BY n.nspname, c.relname`;

const str = (v: unknown): string => String(v);

/**
 * The deparsed form of the accepted tenant policy expression, taken from PostgreSQL itself via a session-local temporary table
 * that is dropped again. No transaction control is used, so the check composes with a caller that is inside a transaction.
 */
export async function referenceTenantPolicyExpression(db: Queryable): Promise<string> {
  await db.query('DROP TABLE IF EXISTS pg_temp.cm_rls_reference');
  await db.query('CREATE TEMP TABLE cm_rls_reference (tenant_id uuid)');
  try {
    await db.query(
      `CREATE POLICY ${TENANT_POLICY_NAME} ON pg_temp.cm_rls_reference USING (${TENANT_POLICY_EXPRESSION}) WITH CHECK (${TENANT_POLICY_EXPRESSION})`,
    );
    const r = await db.query(
      `SELECT pg_get_expr(polqual, polrelid) AS using_expr, pg_get_expr(polwithcheck, polrelid) AS check_expr
         FROM pg_policy WHERE polrelid = 'pg_temp.cm_rls_reference'::regclass`,
    );
    const row = r.rows[0];
    if (!row || row.using_expr !== row.check_expr) throw new Error('cannot derive the reference policy expression');
    return str(row.using_expr);
  } finally {
    await db.query('DROP TABLE IF EXISTS pg_temp.cm_rls_reference');
  }
}

/** Cross-schema foreign keys (DM section 4, ADR-013, Rem R4): none may exist. Returns "schema.table -> schema.table (constraint)". */
export async function findCrossSchemaForeignKeys(db: Queryable): Promise<string[]> {
  const r = await db.query(`
    SELECT cn.nspname AS from_schema, c.relname AS from_table, tn.nspname AS to_schema, t.relname AS to_table, k.conname AS name
      FROM pg_constraint k
      JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace cn ON cn.oid = c.relnamespace
      JOIN pg_class t ON t.oid = k.confrelid JOIN pg_namespace tn ON tn.oid = t.relnamespace
     WHERE k.contype = 'f' AND cn.oid <> tn.oid
     ORDER BY 1, 2, 5`);
  return r.rows.map((x) => `${str(x.from_schema)}.${str(x.from_table)} -> ${str(x.to_schema)}.${str(x.to_table)} (${str(x.name)})`);
}

async function roleExists(db: Queryable, role: string): Promise<boolean> {
  const r = await db.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
  return r.rows.length > 0;
}

const WRITE_PRIVILEGES = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] as const;

async function policiesOf(db: Queryable, oid: unknown): Promise<Record<string, unknown>[]> {
  const r = await db.query(
    `SELECT polname AS name, polcmd AS cmd, polpermissive AS permissive, polroles::text AS roles,
            pg_get_expr(polqual, polrelid) AS using_expr, pg_get_expr(polwithcheck, polrelid) AS check_expr
       FROM pg_policy WHERE polrelid = $1::oid ORDER BY polname`,
    [oid],
  );
  return r.rows;
}

function checkTenantTable(
  name: string,
  t: Record<string, unknown>,
  tenantIdType: unknown,
  policies: Record<string, unknown>[],
  referenceExpr: string,
): string[] {
  const v: string[] = [];
  if (tenantIdType !== 'uuid') v.push(`${name}: TENANT table has no uuid tenant_id`);
  if (t.rls !== true) v.push(`${name}: TENANT table does not enable row level security`);
  if (t.forced !== true) v.push(`${name}: TENANT table does not force row level security`);
  const iso = policies.find((p) => p.name === TENANT_POLICY_NAME);
  if (!iso) v.push(`${name}: TENANT table has no ${TENANT_POLICY_NAME} policy`);
  else {
    if (iso.cmd !== '*' || iso.permissive !== true || iso.roles !== '{0}')
      v.push(`${name}: ${TENANT_POLICY_NAME} is not a permissive ALL policy for PUBLIC`);
    if (iso.using_expr !== referenceExpr) v.push(`${name}: ${TENANT_POLICY_NAME} USING differs from the accepted expression`);
    if (iso.check_expr !== referenceExpr) v.push(`${name}: ${TENANT_POLICY_NAME} WITH CHECK differs from the accepted expression`);
  }
  for (const p of policies) {
    if (p.name !== TENANT_POLICY_NAME && p.permissive === true) v.push(`${name}: extra permissive policy ${str(p.name)} on a TENANT table`);
  }
  return v;
}

async function checkAppAccess(db: Queryable, name: string, e: TableRegistryEntry, oid: unknown): Promise<string[]> {
  const v: string[] = [];
  const any = await db.query('SELECT has_table_privilege($1, $2::oid, $3) OR has_any_column_privilege($1, $2::oid, $4) AS has', [
    CM_APP,
    oid,
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER',
    'SELECT, INSERT, UPDATE, REFERENCES',
  ]);
  if (e.cmAppAccess === 'none' && any.rows[0]?.has === true) v.push(`${name}: cm_app has access but the registry narrows it to none`);
  if (e.category === 'REFERENCE' || e.category === 'PLATFORM') {
    for (const priv of WRITE_PRIVILEGES) {
      const r = await db.query('SELECT has_table_privilege($1, $2::oid, $3) AS has', [CM_APP, oid, priv]);
      if (r.rows[0]?.has === true) v.push(`${name}: cm_app holds ${priv} on a ${e.category} table (SELECT only)`);
    }
  }
  return v;
}

/**
 * The registry gate (DM section 6.3, Foundation brief section 16 rows 7 and 8): every user table is in the registry exactly once
 * and every registry entry is a real table; TENANT tables have tenant_id and forced tenant_isolation RLS; the other categories
 * carry the RLS the category states; cm_app stays within its category profile and within any registered narrowing.
 * Returns violations (table names and rule names only).
 */
export async function checkTableRegistry(db: Queryable, registry: readonly TableRegistryEntry[]): Promise<string[]> {
  const violations: string[] = [];
  const tables = (await db.query(USER_TABLES)).rows;
  const actual = new Map(tables.map((t) => [`${str(t.schema)}.${str(t.name)}`, t]));

  const counts = new Map<string, number>();
  for (const e of registry) counts.set(`${e.schema}.${e.table}`, (counts.get(`${e.schema}.${e.table}`) ?? 0) + 1);
  for (const [name, n] of counts) if (n > 1) violations.push(`${name}: registered ${n} times (must be exactly once)`);
  for (const name of actual.keys()) if (!counts.has(name)) violations.push(`${name}: table is not in the registry`);

  const referenceExpr = registry.some((e) => e.category === 'TENANT') ? await referenceTenantPolicyExpression(db) : '';
  const appExists = await roleExists(db, CM_APP);

  for (const e of registry) {
    const name = `${e.schema}.${e.table}`;
    const t = actual.get(name);
    if (!t) {
      violations.push(`${name}: registry entry without a table`);
      continue;
    }
    const policies = await policiesOf(db, t.oid);
    const wanted = RLS_BY_CATEGORY[e.category];
    if (e.rls !== wanted) violations.push(`${name}: registry rls does not match category ${e.category}`);

    if (wanted === 'forced-tenant-isolation') {
      const col = await db.query(
        `SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute
          WHERE attrelid = $1::oid AND attname = 'tenant_id' AND attnum > 0 AND NOT attisdropped`,
        [t.oid],
      );
      violations.push(...checkTenantTable(name, t, col.rows[0]?.type, policies, referenceExpr));
    } else if (wanted === 'user-visibility') {
      if (t.rls !== true || t.forced !== true) violations.push(`${name}: GLOBAL-IDENTITY table must enable and force row level security`);
      if (!policies.some((p) => p.name === 'user_visibility'))
        violations.push(`${name}: GLOBAL-IDENTITY table has no user_visibility policy`);
    } else {
      if (t.rls === true) violations.push(`${name}: ${e.category} table must not enable row level security`);
      if (policies.length > 0) violations.push(`${name}: ${e.category} table must not carry policies`);
    }
    if (appExists) violations.push(...(await checkAppAccess(db, name, e, t.oid)));
  }
  return violations;
}
