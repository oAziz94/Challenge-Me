// Deliberate violation for the architecture gate self-test: a cycle (a -> b -> a). Not imported by anything real.
export { b } from './cycle-b.mjs';
export const a = 'a';
