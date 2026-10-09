// Values the global setup provides to every integration test file (in memory only; nothing is written to disk).
import 'vitest';

export interface CmPostgres {
  readonly host: string;
  readonly port: number;
  /** The container (or CI service) superuser. Used only for provider-plane bootstrap and for fixtures (STACK-ADR-001 4.7). */
  readonly adminUser: string;
  readonly adminPassword: string | undefined;
  /** Random per run; generated at start-up, never committed. */
  readonly passwords: { readonly cm_migrator: string; readonly cm_app: string; readonly cm_queue: string };
}

declare module 'vitest' {
  export interface ProvidedContext {
    cmPostgres: CmPostgres;
  }
}
