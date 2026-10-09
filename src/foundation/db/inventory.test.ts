import { describe, expect, it } from 'vitest';
import { ADVISORY_LOCK_REGISTRY, MIGRATION_RUNNER_LOCK } from './lock-registry.ts';
import { BLOCKED_ROLE, BYPASSRLS_ROLES, CM_RESOLVER, DECIDED_ROLES } from './role-inventory.ts';
import { TENANT_POLICY_EXPRESSION, tenantIsolationStatements } from './rls-template.ts';
import {
  AUDIT_SCHEMA,
  MIGRATION_ATTRIBUTIONS,
  MIGRATION_CREATED_SCHEMAS,
  MIGRATION_SCHEMA,
  MODULE_SCHEMAS,
  TASK3_SCHEMAS,
} from './schema-inventory.ts';
import { TABLE_CATEGORIES, TABLE_REGISTRY, validateRegistry, type TableRegistryEntry } from './table-registry.ts';

describe('schema inventory (Foundation brief section 9, [A-2])', () => {
  it('keeps exactly fourteen module schemas, audit separate, migration separate', () => {
    expect(MODULE_SCHEMAS).toHaveLength(14);
    expect(new Set(MODULE_SCHEMAS).size).toBe(14);
    expect(MODULE_SCHEMAS).not.toContain(AUDIT_SCHEMA);
    expect(MODULE_SCHEMAS).not.toContain(MIGRATION_SCHEMA);
    expect(MIGRATION_CREATED_SCHEMAS).toHaveLength(15);
    expect(TASK3_SCHEMAS).toHaveLength(16);
  });
  it('never lists the foundation resolver schema (task 4a) as a Task 3 schema', () => {
    expect(TASK3_SCHEMAS as readonly string[]).not.toContain('foundation');
    expect(MIGRATION_CREATED_SCHEMAS as readonly string[]).not.toContain('foundation');
  });
  it('lets a migration file be attributed to a module schema or foundation only', () => {
    expect(MIGRATION_ATTRIBUTIONS).toHaveLength(15);
    expect(MIGRATION_ATTRIBUTIONS as readonly string[]).not.toContain(MIGRATION_SCHEMA);
  });
});

describe('role inventory', () => {
  it('decides four roles and keeps cm_resolver blocked (CR-7 item 5)', () => {
    expect(DECIDED_ROLES).toEqual(['cm_migrator', 'cm_app', 'cm_queue', 'cm_ops_readonly']);
    expect(DECIDED_ROLES as readonly string[]).not.toContain(CM_RESOLVER);
    expect(BLOCKED_ROLE).toBe('cm_resolver');
  });
  it('names BYPASSRLS for exactly the two roles the contract names', () => {
    expect([...BYPASSRLS_ROLES].sort()).toEqual(['cm_ops_readonly', 'cm_resolver']);
  });
});

describe('advisory lock registry', () => {
  it('has no duplicate (namespace, key) pair and uses the int4 range', () => {
    const keys = ADVISORY_LOCK_REGISTRY.map((l) => l.namespace + ':' + l.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const l of ADVISORY_LOCK_REGISTRY) {
      expect(l.namespace).toBeLessThan(2 ** 31);
      expect(l.key).toBeLessThan(2 ** 31);
    }
    expect(MIGRATION_RUNNER_LOCK.namespace).toBe(0x434d4d47);
  });
});

describe('RLS template (DM section 6.2)', () => {
  it('uses the accepted expression verbatim, with the load-bearing nullif', () => {
    expect(TENANT_POLICY_EXPRESSION).toBe("tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid");
  });
  it('produces ENABLE, FORCE and the tenant_isolation policy with USING and WITH CHECK', () => {
    const s = tenantIsolationStatements('content', 'item');
    expect(s).toEqual([
      'ALTER TABLE "content"."item" ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE "content"."item" FORCE ROW LEVEL SECURITY',
      `CREATE POLICY tenant_isolation ON "content"."item" USING (${TENANT_POLICY_EXPRESSION}) WITH CHECK (${TENANT_POLICY_EXPRESSION})`,
    ]);
  });
  it('refuses an identifier that is not a plain lower-case name', () => {
    expect(() => tenantIsolationStatements('content', 'x; DROP TABLE y')).toThrow();
    expect(() => tenantIsolationStatements('Content', 'item')).toThrow();
  });
});

describe('table-category registry (DM section 6.3)', () => {
  it('has the five categories', () => {
    expect([...TABLE_CATEGORIES]).toEqual(['TENANT', 'REFERENCE', 'GLOBAL-IDENTITY', 'OPERATIONAL', 'PLATFORM']);
  });
  it('registers exactly migration.history, REFERENCE, S1, no RLS, cm_app narrowed to none, no purge handler, no retention class', () => {
    expect(TABLE_REGISTRY).toEqual([
      {
        schema: 'migration',
        table: 'history',
        category: 'REFERENCE',
        classification: 'S1',
        rls: 'none',
        cmAppAccess: 'none',
        purgeHandler: 'none',
        retentionClass: 'none',
      },
    ]);
    expect(validateRegistry(TABLE_REGISTRY)).toEqual([]);
  });
  it('rejects a table registered twice, and an rls that does not match the category', () => {
    const e = TABLE_REGISTRY[0] as TableRegistryEntry;
    expect(validateRegistry([e, e])).toEqual(['migration.history: registered more than once']);
    expect(validateRegistry([{ ...e, category: 'TENANT' }])).toEqual(['migration.history: rls does not match the category']);
  });
});
