/**
 * Ruling 158ae96b12908bbb — Twisted Fate, Gambler (OGN-200 → ogn-200-298) · Champion Unit · Chaos · 4 · 4 Might
 *   "When I attack, reveal the top rune of your rune deck, then recycle it. Do one of the following based on its
 *    domain: [fury] — Deal 2 to an enemy unit here and 1 to all other enemy units here. [mind] — Draw 1.
 *    [order] — Stun an enemy unit."
 *   × Chaos Rune (OGN-166 → ogn-166-298), Order Rune (OGN-214 → ogn-214-298)
 *
 * Q: What if the revealed rune is Chaos?
 * A: The rune is still revealed and recycled, but the card lists effects only for Fury, Mind and Order — a Chaos
 *    rune matches none of them, so the ability finishes with no further effect.
 * Rules: 424.1 (reveal), 403 (recycle → bottom of the rune deck), 055 (do as much as you can — an unmatched branch
 *        does nothing), 376/383 (the attack trigger still goes on the chain and resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TWISTED_FATE = "ogn-200-298";
const CHAOS_RUNE = "ogn-166-298";
const ORDER_RUNE = "ogn-214-298";
const MIND_RUNE = "ogn-089-298";

/**
 * P1's turn. Twisted Fate ready in P1's base; P2 holds bf1 with a 2-Might Guard and has a 3-Might Homebody in base.
 * P1's rune deck (top first) = `runes`; no filler runes so the order is fully known.
 */
function board(runes: string[]) {
  return scenario()
    .fillDecks({ main: 10, runes: 0 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", TWISTED_FATE, "tf")
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Homebody" }, "home")
    .runeDeck(P1, runes);
}

const runeNames = (game: Game) => game.p1.runeDeck().map((r) => game.state(r).name);

/** TF attacks bf1: his trigger goes on the chain; both pass so it resolves (before any combat damage). */
async function attackAndResolveTrigger(game: Game): Promise<string> {
  const topRune = game.p1.runeDeck()[0] as string;
  await game.p1.move("tf", "bf1");
  expect(game.state("tf").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tf", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return topRune;
}

describe("Ruling 158ae96b12908bbb — Twisted Fate, Gambler reveals a Chaos rune: revealed, recycled, and nothing else", () => {
  test("Chaos on top: the trigger resolves — the Chaos rune is publicly revealed and recycled to the BOTTOM of the rune deck — and then no branch applies: no damage, no draw, no stun, no prompt", async () => {
    const game = await board([CHAOS_RUNE, ORDER_RUNE, MIND_RUNE]).build();
    expect(runeNames(game)).toEqual(["Chaos Rune", "Order Rune", "Mind Rune"]);
    const hand0 = game.p1.hand().length;
    const chaosId = await attackAndResolveTrigger(game);
    // Resolved and gone from the chain with nothing asked of anyone: straight back to the showdown.
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown" });
    // Revealed (424.1) …
    expect(game.gameState.publicReveals?.at(-1)).toMatchObject({ cardIds: [chaosId], playerId: P1 });
    // … then recycled: Order is the new top, Chaos sits at the bottom; nothing was channeled.
    expect(runeNames(game)).toEqual(["Order Rune", "Mind Rune", "Chaos Rune"]);
    expect(game.zoneOf(chaosId)).toBe("runeDeck");
    expect(game.p1.runes()).toEqual([]);
    // No [fury] damage, no [mind] draw, no [order] stun.
    expect(game.state("guard")).toMatchObject({ damage: 0, isStunned: false });
    expect(game.state("home")).toMatchObject({ damage: 0, isStunned: false });
    expect(game.state("tf").damage).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.violations()).toEqual([]);
  });

  test("the combat then simply proceeds on the board as it is: TF (4) kills the un-stunned Guard (2) and conquers bf1", async () => {
    const game = await board([CHAOS_RUNE, ORDER_RUNE, MIND_RUNE]).build();
    await attackAndResolveTrigger(game);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("tf")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(runeNames(game)).toEqual(["Order Rune", "Mind Rune", "Chaos Rune"]); // still recycled exactly once
  });

  test("contrast: with the ORDER rune on top the same attack does produce an effect — P1 picks an enemy unit to stun (Guard | Homebody), and the Order rune is likewise recycled to the bottom", async () => {
    const game = await board([ORDER_RUNE, CHAOS_RUNE, MIND_RUNE]).build();
    await attackAndResolveTrigger(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["guard", "home"]);
    await game.p1.pick("guard");
    expect(game.state("guard").isStunned).toBe(true);
    expect(runeNames(game)).toEqual(["Chaos Rune", "Mind Rune", "Order Rune"]);
  });
});
