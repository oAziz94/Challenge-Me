// Harness smoke test (Foundation Task 2). It proves only that the pinned Vitest runner executes a TypeScript test
// under the repository configuration. It is NOT a catalogue test and is not counted as one: every FB section 14
// catalogue row is tracked as an explicit gate in gates.json, pending until the task that delivers it.
import { describe, expect, it } from 'vitest';

describe('harness smoke', () => {
  it('runs a TypeScript test on the pinned Node.js major', () => {
    expect(process.versions.node.split('.')[0]).toBe('24');
  });
});
