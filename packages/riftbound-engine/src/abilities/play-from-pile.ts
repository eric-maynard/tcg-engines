/**
 * rule 355.10.a / 355.5.b — the trash is a PUBLIC zone, so "play a <card> from
 * your trash" names its card as a TARGET: it is chosen as the spell is played
 * or as the trigger is FINALIZED (383.3.b), never as the instruction resolves.
 * Once named it is locked (359.3.e.7): an opponent who removes that card from
 * the pile in response makes the play instruction do nothing — its controller
 * is not offered a replacement.
 *
 * A descriptor that names `location: "trash"` is what routes the choice through
 * the chain resolver's finalization planning; this module is the matching read
 * on the resolution side, so the play handler knows a binding it sees came from
 * that named card and must not be replaced.
 */

interface PlayEffectLike {
  readonly type?: unknown;
  readonly from?: unknown;
  readonly target?: unknown;
}

/** True when this `play` effect names its card in the trash itself — a locked target, not a resolution-time pick. */
export function playNamesPublicPile(effect: unknown): boolean {
  const eff = effect as PlayEffectLike | undefined;
  if (eff?.type !== "play" || eff.from !== "trash" || typeof eff.target !== "object" || eff.target === null) {
    return false;
  }
  return (eff.target as { location?: unknown }).location === "trash";
}
