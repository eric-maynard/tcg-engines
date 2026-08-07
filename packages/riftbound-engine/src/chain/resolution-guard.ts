/**
 * rule 320 / 321: "No Cleanup happens while a Chain Item is resolving."
 *
 * Effect handlers that would otherwise end the game the instant a player's
 * score crosses the Victory Score must consult this guard: the victory check is
 * Cleanup task 1 (rule 323.1), so it may only run once the resolving item has
 * left the Chain (rule 319.5). A "You gain 1 point. Then each opponent gains 1
 * point." spell therefore never wins between its two instructions.
 *
 * The flag is a module-level counter rather than game state: resolution is
 * synchronous within one reducer, and the guard must not leak into snapshots.
 */
let depth = 0;

export function beginChainItemResolution(): void {
  depth += 1;
}

export function endChainItemResolution(): void {
  depth = Math.max(0, depth - 1);
}

/** True while a Chain Item is mid-resolution (no Cleanup may run). */
export function isResolvingChainItem(): boolean {
  return depth > 0;
}

/** Run `fn` with the no-Cleanup guard held, releasing it even if `fn` throws. */
export function withChainItemResolution<T>(fn: () => T): T {
  beginChainItemResolution();
  try {
    return fn();
  } finally {
    endChainItemResolution();
  }
}
