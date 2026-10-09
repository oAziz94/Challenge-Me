// Advisory-lock namespace registry (STACK-ADR-003 section 10: "the lock key value and namespace are an implementation detail
// and must not collide with application advisory locks (none exist yet; Foundation registers them when they do)").
//
// Locks here use the two-integer form pg_advisory_lock(int, int). PostgreSQL keeps the (int, int) key space separate from the
// single-bigint key space, so a future application lock taken in the bigint form cannot collide with these. Every
// future advisory lock in the code base registers its (namespace, key) pair here; the unit test over this file rejects a
// duplicate pair.

/** ASCII "CMMG" - the migration runner namespace. */
export const MIGRATION_RUNNER_LOCK = { namespace: 0x434d4d47, key: 1 } as const;

export const ADVISORY_LOCK_REGISTRY = [MIGRATION_RUNNER_LOCK] as const;
