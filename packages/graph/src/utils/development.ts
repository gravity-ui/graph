/**
 * Browser bundlers substitute NODE_ENV even when there is no global process; native Node may leave its value unset.
 * Check availability once, then keep the literal NODE_ENV comparison at each call site so consumer bundlers drop
 * the diagnostic branch before collecting its dependencies. Bare browser ESM skips the check.
 */
export const HAS_NODE_ENV = (() => {
  try {
    return typeof process.env.NODE_ENV === "string" || typeof process !== "undefined";
  } catch {
    return false;
  }
})();
