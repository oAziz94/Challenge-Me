import { defineConfig } from 'vitest/config';

// One Vitest project per catalogue job (STACK-ADR-001 4.7). Locations follow the indicative layout of 4.8:
// unit tests next to the code under src/, architecture and integration tests under tests/.
// The harness smoke test lives under scripts/governance/ci-gates/harness/ and belongs to the "unit" project only to
// prove that the runner executes; it is not a catalogue row.
export default defineConfig({
  test: {
    // A project that finds no test file fails (never a silent pass); see the gate catalogue for pending rows.
    passWithNoTests: false,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts', 'scripts/governance/ci-gates/harness/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'architecture',
          include: ['tests/architecture/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
        },
      },
    ],
  },
});
