/* Foundation Task 2 architecture baseline (STACK-ADR-001 4.8 layer 1). dependency-cruiser runs as the architecture job.
 * Only rules that need no module layout are enabled here; module-boundary, SDK-outside-adapters and database-constructor
 * rules are delivered by the task that creates the layout they describe (FB section 20 task 11) and are tracked as
 * pending gates in scripts/governance/ci-gates/gates.json. */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Dependency direction follows AGENTS section 4; cycles are forbidden (STACK-ADR-001 4.8 layer 1).',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-unresolvable',
      severity: 'error',
      comment: 'Every import must resolve.',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
