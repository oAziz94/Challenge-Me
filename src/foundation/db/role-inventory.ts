// Database roles (DM section 6.4; ADR-012 "Database roles"; Foundation brief section 9).
//
// `cm_resolver` is NOT created by task 3. Its creation is blocked by CR-7 item 5 and by the managed-PostgreSQL / provider /
// bootstrap decision, and no creation mechanism is assumed (Foundation brief section 20 task 3). It is named here only so that
// tests can assert its absence; no code path may create it.

export const CM_MIGRATOR = 'cm_migrator';
export const CM_APP = 'cm_app';
export const CM_QUEUE = 'cm_queue';
export const CM_OPS_READONLY = 'cm_ops_readonly';
export const CM_RESOLVER = 'cm_resolver';

/** The four roles whose existence and attributes task 3 establishes and asserts. */
export const DECIDED_ROLES = [CM_MIGRATOR, CM_APP, CM_QUEUE, CM_OPS_READONLY] as const;

/** BYPASSRLS appears only on the two roles the contract names (Foundation brief section 9, "Roles"). */
export const BYPASSRLS_ROLES = [CM_OPS_READONLY, CM_RESOLVER] as const;

/** Blocked by CR-7 item 5 and the managed-PostgreSQL / bootstrap decision. Never created by task 3. */
export const BLOCKED_ROLE = CM_RESOLVER;
