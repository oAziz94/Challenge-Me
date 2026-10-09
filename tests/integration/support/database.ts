// Per-test-file disposable database (test/container bootstrap; STACK-ADR-003 section 5 and 10; STACK-ADR-001 4.4 test-harness
// privileges). The superuser appears only in this file, only for provider-plane bootstrap and for fixtures that deliberately
// reproduce an out-of-band condition. Migrations run as cm_migrator; runtime-role tests connect as the runtime roles.
//
// Three things are kept apart here and in the tests:
//   - test/container bootstrap: createTestDatabase() (roles are created once by global-setup);
//   - the migration runner: src/foundation/migrations;
//   - migration SQL: migrations/.

import { randomBytes } from 'node:crypto';
import { Client, type ClientConfig } from 'pg';
import { inject } from 'vitest';

export type Login = 'admin' | 'cm_migrator' | 'cm_app' | 'cm_queue';

export interface TestDatabase {
  readonly name: string;
  /** Opens a session and asserts the connected role (STACK-ADR-001 4.7). The caller closes it. */
  connect(login: Login): Promise<Client>;
  /** Connection settings for a role (the runner opens its own session from the cm_migrator settings). */
  config(login: Login): ClientConfig;
  drop(): Promise<void>;
}

export interface CreateOptions {
  /** false leaves schema `migration` uncreated, to test the runner preflight. */
  readonly migrationSchema?: boolean;
  /** Owner of schema `migration` when it is created; default cm_migrator. Used to test the preflight owner check. */
  readonly migrationSchemaOwner?: string;
}

export async function createTestDatabase(options: CreateOptions = {}): Promise<TestDatabase> {
  const pg = inject('cmPostgres');
  const name = 'cm_test_' + randomBytes(6).toString('hex');
  const base = { host: pg.host, port: pg.port };
  const adminConfig = (database: string): ClientConfig => ({ ...base, user: pg.adminUser, password: pg.adminPassword, database });

  const root = new Client(adminConfig('postgres'));
  await root.connect();
  try {
    await root.query(`CREATE DATABASE ${name}`);
  } finally {
    await root.end();
  }

  const admin = new Client(adminConfig(name));
  await admin.connect();
  try {
    // Provider-plane bootstrap (test/container only): the schema-creation right cm_migrator needs, and schema `migration`
    // created with AUTHORIZATION cm_migrator plus the section 6 grants that can exist before the table does.
    await admin.query(`GRANT CREATE ON DATABASE ${name} TO cm_migrator`);
    if (options.migrationSchema !== false) {
      await admin.query(`CREATE SCHEMA migration AUTHORIZATION ${options.migrationSchemaOwner ?? 'cm_migrator'}`);
      await admin.query('GRANT USAGE ON SCHEMA migration TO cm_ops_readonly');
      await admin.query('ALTER DEFAULT PRIVILEGES FOR ROLE cm_migrator IN SCHEMA migration GRANT SELECT ON TABLES TO cm_ops_readonly');
    }
  } finally {
    await admin.end();
  }

  const config = (login: Login): ClientConfig =>
    login === 'admin' ? adminConfig(name) : { ...base, user: login, password: pg.passwords[login], database: name };

  return {
    name,
    config,
    async connect(login) {
      const client = new Client(config(login));
      client.on('error', () => undefined);
      await client.connect();
      const r = await client.query<{ u: string }>('SELECT current_user AS u');
      const expected = login === 'admin' ? pg.adminUser : login;
      if (r.rows[0]?.u !== expected) {
        await client.end();
        throw new Error('connected as an unexpected role');
      }
      return client;
    },
    async drop() {
      const c = new Client(adminConfig('postgres'));
      await c.connect();
      try {
        await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await c.end();
      }
    },
  };
}
