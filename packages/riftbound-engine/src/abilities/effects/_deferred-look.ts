/**
 * rule 369.1 (ogn-194-298 Nocturne) — a look that woke an "as you look at or
 * reveal me" replacement parks its own reveal-and-pick prompt in
 * `deferredLookChoice` so the replacement is answered first. Install the parked
 * prompt once that trigger's chain has drained and nothing else is pending.
 *
 * Lives in its own module so the dispatcher and the pending-choice move can
 * call it without importing the effect handlers (import cycle).
 */
export function installDeferredLookChoice(draft: unknown): void {
  const d = draft as {
    deferredLookChoice?: unknown;
    interaction?: { chain?: { items?: readonly unknown[] } };
    pendingChoice?: unknown;
  };
  if (
    d.deferredLookChoice &&
    !d.pendingChoice &&
    (d.interaction?.chain?.items?.length ?? 0) === 0
  ) {
    d.pendingChoice = d.deferredLookChoice;
    d.deferredLookChoice = undefined;
  }
}
