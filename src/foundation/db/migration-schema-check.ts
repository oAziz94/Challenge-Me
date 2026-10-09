// The closed-contents assertion for schema `migration` (STACK-ADR-003 section 6): the schema may contain exactly table `history`,
// the constraints and indexes belonging to it and, only if task 3 chose one, one protection trigger function and its trigger.
// Task 3 chose NO trigger, so no function and no trigger are permitted. Everything else is a violation.
// Enumerates the namespace in pg_class, pg_proc, pg_type, pg_trigger, pg_constraint, pg_policy, pg_default_acl and the other
// namespace-bearing catalogues. Reads catalogues only.

import type { Queryable } from './catalogue-checks.ts';
import { CM_MIGRATOR, CM_OPS_READONLY } from './role-inventory.ts';
import { MIGRATION_SCHEMA } from './schema-inventory.ts';

// Catalogues whose rows carry a namespace column, other than the ones inspected individually below. Any row here is a violation.
const OTHER_NAMESPACED_CATALOGUES: readonly (readonly [string, string])[] = [
  ['pg_operator', 'oprnamespace'],
  ['pg_collation', 'collnamespace'],
  ['pg_conversion', 'connamespace'],
  ['pg_opclass', 'opcnamespace'],
  ['pg_opfamily', 'opfnamespace'],
  ['pg_statistic_ext', 'stxnamespace'],
  ['pg_ts_config', 'cfgnamespace'],
  ['pg_ts_dict', 'dictnamespace'],
  ['pg_ts_parser', 'prsnamespace'],
  ['pg_ts_template', 'tmplnamespace'],
  ['pg_extension', 'extnamespace'],
];

export async function migrationSchemaViolations(db: Queryable): Promise<string[]> {
  const v: string[] = [];
  const ns = (await db.query('SELECT oid::int AS oid FROM pg_namespace WHERE nspname = $1', [MIGRATION_SCHEMA])).rows[0]?.oid;
  if (ns === undefined) return ['schema migration does not exist'];
  const history = (await db.query("SELECT to_regclass('migration.history')::oid::int AS oid")).rows[0]?.oid;

  const rels = await db.query(
    `SELECT c.relname, c.relkind, c.oid::int AS oid, coalesce(i.indrelid::int, 0) AS indrelid
       FROM pg_class c LEFT JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relnamespace = $1::oid`,
    [ns],
  );
  for (const r of rels.rows) {
    const isHistory = r.relkind === 'r' && r.relname === 'history';
    const isIndexOfHistory = r.relkind === 'i' && history !== null && r.indrelid === history;
    if (!isHistory && !isIndexOfHistory) v.push(`relation ${String(r.relname)} (kind ${String(r.relkind)})`);
  }

  const procs = await db.query('SELECT proname FROM pg_proc WHERE pronamespace = $1::oid', [ns]);
  for (const r of procs.rows) v.push(`function ${String(r.proname)}`);

  const types = await db.query(
    `SELECT t.typname, t.typtype, t.typrelid::int AS typrelid, coalesce(e.typrelid::int, 0) AS elemrel
       FROM pg_type t LEFT JOIN pg_type e ON e.oid = t.typelem AND t.typcategory = 'A' WHERE t.typnamespace = $1::oid`,
    [ns],
  );
  for (const r of types.rows) {
    const rowType = r.typtype === 'c' && history !== null && r.typrelid === history;
    const rowTypeArray = history !== null && r.elemrel === history;
    if (!rowType && !rowTypeArray) v.push(`type ${String(r.typname)}`);
  }

  const trig = await db.query(
    `SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relnamespace = $1::oid AND NOT t.tgisinternal`,
    [ns],
  );
  for (const r of trig.rows) v.push(`trigger ${String(r.tgname)}`);

  const cons = await db.query(
    `SELECT k.conname FROM pg_constraint k WHERE k.connamespace = $1::oid AND (k.conrelid <> $2::oid OR k.conrelid IS NULL)`,
    [ns, history ?? 0],
  );
  for (const r of cons.rows) v.push(`constraint ${String(r.conname)} not on history`);

  const pols = await db.query('SELECT p.polname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relnamespace = $1::oid', [
    ns,
  ]);
  for (const r of pols.rows) v.push(`policy ${String(r.polname)}`);

  for (const [catalogue, column] of OTHER_NAMESPACED_CATALOGUES) {
    const r = await db.query(`SELECT count(*)::int AS n FROM ${catalogue} WHERE ${column} = $1::oid`, [ns]);
    if (Number(r.rows[0]?.n) > 0) v.push(`${catalogue} object`);
  }

  // Default privileges: the only permitted entry grants SELECT on tables to cm_ops_readonly, set by cm_migrator.
  const acls = await db.query(
    `SELECT pg_get_userbyid(d.defaclrole) AS owner, d.defaclobjtype AS kind, d.defaclacl::text AS acl FROM pg_default_acl d WHERE d.defaclnamespace = $1::oid`,
    [ns],
  );
  for (const r of acls.rows) {
    const expected = `{${CM_OPS_READONLY}=r/${CM_MIGRATOR}}`;
    if (!(r.owner === CM_MIGRATOR && r.kind === 'r' && r.acl === expected)) v.push('default privilege beyond the grant matrix');
  }
  return v;
}
