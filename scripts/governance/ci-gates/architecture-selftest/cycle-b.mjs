// Deliberate violation for the architecture gate self-test: a cycle (b -> a -> b).
export { a } from './cycle-a.mjs';
export const b = 'b';
