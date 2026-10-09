// The table-category registry (DM section 6.3 "CI test: every table appears in exactly one category"; ADR-012 "global-table
// registry"). The registry form is an implementation detail ([ID]; Foundation brief section 9): a typed, machine-checkable list.
//
// Task 3 registers exactly the tables Task 3 delivers: migration.history (STACK-ADR-003 section 5). Later tasks and the
// owning module briefs add their own entries; the gate fails on any table that is not registered.

import { MIGRATION_SCHEMA } from './schema-inventory.ts';

export const TABLE_CATEGORIES = ['TENANT', 'REFERENCE', 'GLOBAL-IDENTITY', 'OPERATIONAL', 'PLATFORM'] as const;
export type TableCategory = (typeof TABLE_CATEGORIES)[number];

export const SENSITIVITY_CLASSES = ['S0', 'S1', 'S2', 'S3', 'S4'] as const;
export type SensitivityClass = (typeof SENSITIVITY_CLASSES)[number];

/** The RLS the category requires (DM section 6.3). */
export type RlsRequirement = 'forced-tenant-isolation' | 'user-visibility' | 'none';

export interface TableRegistryEntry {
  readonly schema: string;
  readonly table: string;
  readonly category: TableCategory;
  /** Classification code (S0-S4). */
  readonly classification: SensitivityClass;
  readonly rls: RlsRequirement;
  /**
   * `category-profile`: cm_app gets at most the category profile (DM section 6.3).
   * `none`: an approved narrowing - cm_app has no access of any kind (STACK-ADR-003 section 5).
   */
  readonly cmAppAccess: 'category-profile' | 'none';
  /** Purge handler name, or `none` when the table holds no personal data. */
  readonly purgeHandler: string;
  /** DM retention class, or `none` when no DM retention class applies. */
  readonly retentionClass: string;
}

export const RLS_BY_CATEGORY: Readonly<Record<TableCategory, RlsRequirement>> = {
  TENANT: 'forced-tenant-isolation',
  REFERENCE: 'none',
  'GLOBAL-IDENTITY': 'user-visibility',
  OPERATIONAL: 'none',
  PLATFORM: 'none',
};

export const TABLE_REGISTRY: readonly TableRegistryEntry[] = [
  {
    schema: MIGRATION_SCHEMA,
    table: 'history',
    category: 'REFERENCE',
    classification: 'S1',
    rls: 'none',
    cmAppAccess: 'none',
    purgeHandler: 'none',
    retentionClass: 'none',
  },
];

/** Internal consistency of a registry (no database): unique entries, known categories, RLS matching the category. */
export function validateRegistry(registry: readonly TableRegistryEntry[]): string[] {
  const violations: string[] = [];
  const seen = new Set<string>();
  for (const e of registry) {
    const name = `${e.schema}.${e.table}`;
    if (seen.has(name)) violations.push(`${name}: registered more than once`);
    seen.add(name);
    if (!(TABLE_CATEGORIES as readonly string[]).includes(e.category)) violations.push(`${name}: unknown category`);
    if (!(SENSITIVITY_CLASSES as readonly string[]).includes(e.classification)) violations.push(`${name}: unknown classification`);
    if (RLS_BY_CATEGORY[e.category] !== e.rls) violations.push(`${name}: rls does not match the category`);
  }
  return violations;
}
