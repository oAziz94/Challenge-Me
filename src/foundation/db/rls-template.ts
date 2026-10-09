// The TENANT-table RLS template (DM section 6.2, DECIDED, ADR-012). Verbatim shape; only the identifiers vary.
//
// The nullif is load-bearing: after a transaction-local setting ends PostgreSQL returns an empty string for the custom setting,
// so the comparison yields NULL and no rows (fail closed).
//
// Task 3 delivers only the template and its catalogue assertion. TenantTransaction (the only place that sets app.tenant_id)
// belongs to task 4 and is not implemented here.

export const TENANT_POLICY_NAME = 'tenant_isolation';

/** The accepted policy expression, used for both USING and WITH CHECK. */
export const TENANT_POLICY_EXPRESSION = "tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid";

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function quoteIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error('invalid identifier for the RLS template');
  return '"' + name + '"';
}

/** The three statements of the template for one TENANT table, schema-qualified. */
export function tenantIsolationStatements(schema: string, table: string): string[] {
  const qualified = quoteIdentifier(schema) + '.' + quoteIdentifier(table);
  return [
    `ALTER TABLE ${qualified} ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE ${qualified} FORCE ROW LEVEL SECURITY`,
    `CREATE POLICY ${TENANT_POLICY_NAME} ON ${qualified} USING (${TENANT_POLICY_EXPRESSION}) WITH CHECK (${TENANT_POLICY_EXPRESSION})`,
  ];
}
