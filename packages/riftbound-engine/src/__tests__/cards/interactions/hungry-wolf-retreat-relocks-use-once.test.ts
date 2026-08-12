/**
 * Interaction: TWO memories with different owners — a PLAYER/turn record vs an OBJECT record.
 *
 *   Hungry Wolf  (ven-125-166) Unit · 4 · 4 Might
 *     "[order]: Ready me and give me +1 [Might] this turn.
 *      Use only if you've chosen an enemy unit this turn and only once each turn."
 *   Rune Prison  (ogn-050-298) [Action] Spell · 2 + [calm] — "Stun a unit."
 *   Retreat      (ogn-104-298) [Reaction] Spell · 1 —
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *
 * Rules: 124 / 124.1 (a card moving to a non-board zone becomes a NEW object and every temporary
 * modification stops being tracked) · 056.1 (hand is a non-board zone) · 383.3.e.1 · 359.3.e.4
 * (an object that changed zones is no longer the thing anything had chosen) · 143.4 / 359.2.c
 * (a played unit enters exhausted) · 423.1.a.2 (Stunned clears in the end-of-turn cleanup, not
 * because of anything the Wolf does).
 *
 * Q: P1 casts Rune Prison on an enemy unit (the player-level gate is now met), activates the Wolf
 *    once, and is locked out of a second activation. P1 then Retreats the Wolf and replays it the
 *    same turn. Does the replayed Wolf get a FRESH "only once each turn" (yes — new object), while
 *    "you've chosen an enemy unit this turn" stays satisfied (yes — it never belonged to the Wolf)?
 *    And is the +1 Might from the first activation gone?
 *
 * A: object memory resets, player memory does not. Asserted explicitly in both directions.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HUNGRY_WOLF = "ven-125-166";
const RUNE_PRISON = "ogn-050-298";
const RETREAT = "ogn-104-298";

/**
 * P1's turn. The Wolf sits EXHAUSTED in P1's base so "Ready me" is observable; an enemy vanilla
 * unit stands at bf1 as the Rune Prison victim. Pools cover: Rune Prison (2 + [calm]),
 * two Wolf activations ([order] each), Retreat (1) and a full 4-energy replay of the Wolf.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { calm: 2, order: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Warden" }, "foe")
    .unit(P1, "base", HUNGRY_WOLF, "wolf", { exhausted: true })
    .hand(P1, RUNE_PRISON, "prison")
    .hand(P1, RETREAT, "retreat")
    .fillDecks({ main: 20, runes: 12 });
}

/** Step 1–2: Rune Prison an enemy unit (player gate met), then activate the Wolf once. */
async function usedOnce(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("prison", { targets: "foe" });
  await game.settle();
  await game.p1.activate("wolf", 0);
  await game.settle();
  return game;
}

describe("Hungry Wolf × Rune Prison × Retreat — object memory resets, player memory does not", () => {
  test("Step 1 gate: before P1 has chosen an enemy unit this turn the [order] ability is not activatable at all", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "wolf")).toBe(false);
    const attempt = await game.p1.try((p) => p.activate("wolf", 0));
    expect(attempt.ok).toBe(false);

    // Casting Rune Prison at an ENEMY unit is P1 choosing an enemy unit this turn (a
    // player-scoped, turn-scoped fact recorded against P1, not against any unit).
    await game.p1.cast("prison", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.p1.can("activate", "wolf")).toBe(true);
  });

  test("Step 2: the first activation readies the Wolf and gives it +1 Might this turn", async () => {
    const game = await usedOnce();
    expect(game.state("wolf").isExhausted).toBe(false);
    expect(game.state("wolf").might).toBe(5); // printed 4 + 1 this turn
    expect(game.violations()).toEqual([]);
  });

  test("Step 3 (NO side): a SECOND activation this turn is illegal — the once-each-turn slot on THIS Wolf is spent", async () => {
    const game = await usedOnce();
    expect(game.p1.can("activate", "wolf")).toBe(false);
    const again = await game.p1.try((p) => p.activate("wolf", 0));
    expect(again.ok).toBe(false);
  });

  test("Step 4: Retreat sends the Wolf to its owner's hand — a non-board zone (056.1), so the +1 Might and its ready/exhausted state are gone (124.1) and the owner channels 1 rune exhausted", async () => {
    const game = await usedOnce();
    const runesBefore = game.p1.runes().length;
    await game.p1.cast("retreat", { targets: "wolf" });
    await game.settle();

    expect(game.zoneOf("wolf")).toBe("hand");
    // 124.1 — nothing about the old object is tracked: no Might modifier travels to the hand.
    expect(game.state("wolf").mightModifier).toBe(0);
    expect(game.state("wolf").isExhausted).toBe(false);
    // "Its owner channels 1 rune exhausted."
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: true })).toHaveLength(runesBefore);
  });

  test("Step 5: replaying the Wolf costs its printed 4 and it enters the board EXHAUSTED (143.4 / 359.2.c) with printed Might", async () => {
    const game = await usedOnce();
    await game.p1.cast("retreat", { targets: "wolf" });
    await game.settle();
    const energyBefore = game.p1.energy();

    await game.p1.play("wolf", { to: "base" });
    await game.settle();
    expect(game.zoneOf("wolf")).toBe("base");
    expect(game.p1.energy()).toBe(energyBefore - 4);
    expect(game.state("wolf").isExhausted).toBe(true);
    expect(game.state("wolf").might).toBe(4);
  });

  // Expected (124 / 124.1): the once-each-turn allowance is an OBJECT ledger; the Wolf that comes
  // back out of hand is a new object and has never used its ability, so [order] is legal again.
  // Actual: the allowance is stored as `turnEventCounts["activate|<cardId>|0"]` and the identity
  // reset (`leave-board.ts resetObjectState` → `forgetPerCardTallies`) only drops keys carrying the
  // `|c:<cardId>` marker, so the activate key survives the bounce and the replayed Wolf stays
  // locked out. The player-scoped gate is fine — only the object ledger leaks.
  test("BUG: the replayed Wolf keeps the spent 'only once each turn' lock — the once-each-turn tally is an object ledger and must reset with the object's identity (124 / 124.1), while P1's 'chosen an enemy unit this turn' record correctly survives", async () => {
    const game = await usedOnce();
    await game.p1.cast("retreat", { targets: "wolf" });
    await game.settle();
    await game.p1.play("wolf", { to: "base" });
    await game.settle();
    expect(game.state("wolf").isExhausted).toBe(true);

    // BOTH gates must pass: the OBJECT ledger reset with the identity change (124/124.1), the
    // PLAYER ledger did not (it is P1's turn record, and 359.3.e.4 only says the Wolf is no
    // longer the object anything had chosen — the enemy Warden is what P1 chose).
    expect(game.p1.can("activate", "wolf")).toBe(true);
    await game.p1.activate("wolf", 0);
    await game.settle();
    expect(game.state("wolf").isExhausted).toBe(false); // undoes the entry exhaustion
    expect(game.state("wolf").might).toBe(5);
  });

  test("the asymmetry, stated directly: the player record survives the Wolf's identity change even though no Wolf ever carried it", async () => {
    const game = await usedOnce();
    // Retreat the Wolf and DON'T replay it: the enemy-choice record is a fact about P1, so any
    // other copy of the Wolf P1 puts on the board this turn is immediately usable.
    const fresh = await board().hand(P1, HUNGRY_WOLF, "wolf2").build();
    await fresh.p1.cast("prison", { targets: "foe" });
    await fresh.settle();
    await fresh.p1.activate("wolf", 0); // spends the FIRST Wolf's once-each-turn slot
    await fresh.settle();
    expect(fresh.p1.can("activate", "wolf")).toBe(false);

    await fresh.p1.play("wolf2", { to: "base" });
    await fresh.settle();
    // A different object: its own slot is untouched, and the player gate is still met.
    expect(fresh.p1.can("activate", "wolf2")).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("the enemy unit's Stunned status is untouched by any of it — it clears in end-of-turn cleanup (423.1.a.2), not because of the Wolf", async () => {
    const game = await usedOnce();
    expect(game.state("foe").isStunned).toBe(true);
    await game.p1.cast("retreat", { targets: "wolf" });
    await game.settle();
    expect(game.state("foe").isStunned).toBe(true);
    await game.p1.play("wolf", { to: "base" });
    await game.settle();
    expect(game.state("foe").isStunned).toBe(true);

    await game.advanceTurn();
    expect(game.state("foe").isStunned).toBe(false);
  });
});
