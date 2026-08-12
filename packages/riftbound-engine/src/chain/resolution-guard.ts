/**
 * WHEN a Cleanup may perform its steps — rules 318-323.
 *
 * Rule 319 lists when a Cleanup becomes an Outstanding Task: a Pending Item is
 * added to the Chain (319.3), an item is Finalized (319.4) or removed from it
 * (319.5), Game Objects enter or leave the Board (319.6), a Move completes
 * (319.8). Rule 321 is the ONLY thing that holds one off — "while Chain Items
 * are Resolving, a Cleanup cannot occur" — and rule 321.1 says the Cleanup that
 * qualified during that Resolution stays Outstanding and is performed the moment
 * the resolution ends.
 *
 * A CLOSED STATE IS NOT A DEFERRAL. Rule 309.1 makes a Closed State nothing more
 * than "a Chain exists", and rule 320.1 describes a Cleanup running with items on
 * the Chain ("New Pending Items can be added, but Finalized Items cannot be
 * executed"). So a queued-but-unresolved trigger does not stop a Cleanup from
 * performing its steps; only the steps rule 323 itself conditions on an Open
 * State sit out — 323.6 (control lapse), 323.12 / 323.13 (opening a Showdown /
 * Combat) — which `operations/battlefield-control.ts#cleanupStateKind` models.
 * Everything else, notably 323.7's recall of unattached non-Unit Gear at a
 * Battlefield, runs regardless.
 *
 * The two tests that pin this pair of readings against each other:
 *  - `rulings/eye-of-the-herald-fb0ba503d6b40afd` 4a — Gust's resolution is over,
 *    so its Outstanding Cleanup runs and recalls the loose Eye to base even
 *    though the Eye's move trigger is still waiting on the Chain.
 *  - `interactions/brutalizer-breach-rearms-this-turn` — same shape: the detached
 *    Brutalizer sits at the host's last location (435.4.b) only until the Cleanup
 *    that follows the Breach's resolution, which recalls it (435.4.a / 149.3 /
 *    457.1 / 323.7) before the queued [Weaponmaster] item resolves.
 * What rule 321 buys is that no Cleanup cuts INTO a resolution — not that a
 * pending trigger freezes the board.
 *
 * The boundary is the SYNCHRONOUS resolution. `deferredSpellSettle` (the parked
 * "and then trash it" step, rule 359.3.d) is deliberately NOT part of it: a card
 * that may be replayed out of its own effect keeps that settle parked across
 * whole resolutions that have already finished (sfd-134-221 Dancing Grenade's
 * dance), so reading it here would freeze the Cleanup — and with it the lethal
 * check — long past the resolution 321 is about. `operations/points.ts` still
 * consults it for the victory check alone, where postponing is the point.
 *
 * The counter is module-level rather than game state: resolution is synchronous
 * within one reducer, and the guard must not leak into snapshots.
 */
let depth = 0;

/** rule 321.1 — a Cleanup qualified while a Chain Item was Resolving. */
let outstandingCleanup = false;

export function beginChainItemResolution(): void {
  depth += 1;
}

export function endChainItemResolution(): void {
  depth = Math.max(0, depth - 1);
}

/** True while a Chain Item is mid-resolution: no Cleanup may occur (rule 321). */
export function isResolvingChainItem(): boolean {
  return depth > 0;
}

/** rule 321.1 — record the Cleanup a resolution in progress just deferred. */
export function noteOutstandingCleanup(): void {
  outstandingCleanup = true;
}

/**
 * rule 321.1 — consume the deferred Cleanup: the resolution has ended, so it may
 * now be performed. Returns whether one was actually owed.
 */
export function takeOutstandingCleanup(): boolean {
  const owed = outstandingCleanup;
  outstandingCleanup = false;
  return owed;
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
