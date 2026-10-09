// Schema inventory of the Foundation database baseline (Foundation brief section 9 "Schemas to create", [A-2];
// DM section 4 and 22; STACK-ADR-003 section 5).
//
// Three groups are kept apart on purpose:
//   - the fourteen module schemas (DM section 4);
//   - `audit` (DM section 22), separate from the module schemas;
//   - `migration`, Foundation migration infrastructure (STACK-ADR-003 section 5): not a module schema, not the
//     `foundation` resolver schema, created by bootstrap and never by the runner or by a migration file.
// The `foundation` resolver schema (functions only, [CR-3-F1]) is created by task 4a, not by task 3, and is deliberately
// absent from every list below.

export const MODULE_SCHEMAS = [
  'identity',
  'roster',
  'tenancy',
  'privacy',
  'content',
  'challenge',
  'assessment',
  'evaluation',
  'learning',
  'review',
  'comms',
  'ai',
  'codeexec',
  'reporting',
] as const;

export const AUDIT_SCHEMA = 'audit' as const;
export const MIGRATION_SCHEMA = 'migration' as const;

/** The schemas the first migration creates: the fourteen module schemas plus `audit`. */
export const MIGRATION_CREATED_SCHEMAS = [...MODULE_SCHEMAS, AUDIT_SCHEMA] as const;

/** Every schema Task 3 leaves in the database (the migration-created ones plus `migration`, which bootstrap creates). */
export const TASK3_SCHEMAS = [...MIGRATION_CREATED_SCHEMAS, MIGRATION_SCHEMA] as const;

/**
 * What a migration file may be attributed to: one module schema or Foundation (STACK-ADR-001 4.4 A.7; STACK-ADR-003 section 7).
 * `audit` and the other Foundation-owned schemas are Foundation work, hence `foundation`.
 */
export const MIGRATION_ATTRIBUTIONS = [...MODULE_SCHEMAS, 'foundation'] as const;
