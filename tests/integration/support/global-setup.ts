// Starts PostgreSQL 18 for the integration project and performs the cluster-level (provider-plane) role bootstrap.
//
// Default: a PostgreSQL 18 Testcontainers container (STACK-ADR-001 4.7). The container exists only for this run and holds only
// a random superuser password generated here.
// CI and machines without Docker: CM_TEST_POSTGRES=external uses the PostgreSQL 18 server named by PGHOST / PGPORT / PGUSER /
// PGPASSWORD (the job-local service container of STACK-ADR-002 6.6). The server major is asserted to be 18 either way.
//
// Roles created: cm_migrator, cm_app, cm_queue, cm_ops_readonly. cm_resolver is NOT created: it is blocked by CR-7 item 5 and
// the managed-PostgreSQL / bootstrap decision (Foundation brief section 20 task 3). This is test bootstrap only; it is not
// the production bootstrap mechanism, which is deliberately undecided (STACK-ADR-003 section 11).

import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import type { TestProject } from 'vitest/node';
import type { CmPostgres } from './provided.ts';

// Same image and digest as the CI service container (.github/workflows/ci.yml, STACK-ADR-001 4.14).
export const POSTGRES_IMAGE = 'postgres:18.6@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336';

const secret = (): string => randomBytes(24).toString('hex');

async function bootstrapRoles(admin: Client, pw: CmPostgres['passwords']): Promise<void> {
  const v = await admin.query<{ n: string }>('SELECT current_setting($1) AS n', ['server_version_num']);
  if (!/^18[0-9]{4}$/.test(v.rows[0]?.n ?? '')) throw new Error('integration tests require PostgreSQL major 18');
  const attrs = 'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION';
  const roles: [string, string][] = [
    ['cm_migrator', `LOGIN ${attrs} NOBYPASSRLS PASSWORD ${admin.escapeLiteral(pw.cm_migrator)}`],
    ['cm_app', `LOGIN ${attrs} NOBYPASSRLS PASSWORD ${admin.escapeLiteral(pw.cm_app)}`],
    ['cm_queue', `LOGIN ${attrs} NOBYPASSRLS PASSWORD ${admin.escapeLiteral(pw.cm_queue)}`],
    // Break-glass read role: BYPASSRLS, never used to log in by these tests.
    ['cm_ops_readonly', `NOLOGIN ${attrs} BYPASSRLS`],
  ];
  for (const [name, options] of roles) {
    const exists = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [name]);
    await admin.query(`${exists.rows.length > 0 ? 'ALTER' : 'CREATE'} ROLE ${name} ${options}`);
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const passwords = { cm_migrator: secret(), cm_app: secret(), cm_queue: secret() };
  let container: StartedTestContainer | undefined;
  let endpoint: CmPostgres;

  if (process.env.CM_TEST_POSTGRES === 'external') {
    const pwd = process.env.PGPASSWORD;
    endpoint = {
      host: process.env.PGHOST ?? 'localhost',
      port: Number(process.env.PGPORT ?? '5432'),
      adminUser: process.env.PGUSER ?? 'postgres',
      adminPassword: pwd === undefined || pwd === '' ? undefined : pwd,
      passwords,
    };
  } else {
    const adminPassword = secret();
    container = await new GenericContainer(POSTGRES_IMAGE)
      .withEnvironment({ POSTGRES_USER: 'postgres', POSTGRES_PASSWORD: adminPassword })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .withStartupTimeout(120000)
      .start();
    endpoint = { host: container.getHost(), port: container.getMappedPort(5432), adminUser: 'postgres', adminPassword, passwords };
  }

  const admin = new Client({
    host: endpoint.host,
    port: endpoint.port,
    user: endpoint.adminUser,
    password: endpoint.adminPassword,
    database: 'postgres',
  });
  await admin.connect();
  try {
    await bootstrapRoles(admin, passwords);
  } finally {
    await admin.end();
  }
  project.provide('cmPostgres', endpoint);

  return async () => {
    await container?.stop();
  };
}
