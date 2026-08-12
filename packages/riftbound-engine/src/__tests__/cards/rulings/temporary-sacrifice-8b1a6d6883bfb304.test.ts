/**
 * Ruling 8b1a6d6883bfb304 — (general [Temporary]) can the doomed unit be spent in response to its own death?
 *   Stand-ins: a Sprite unit token (unl-t07 · 3 Might · [Temporary] "Kill me at the start of your Beginning
 *   Phase, before scoring") and Deathgrip (SFD-163 → sfd-163-221) · [2][order] [Reaction] "Kill a friendly
 *   unit. If you do, give +[Might] equal to its Might to another friendly unit this turn. Draw 1."
 *
 * Q: Can you sacrifice a unit in response to its own [Temporary] death trigger?
 * A: Yes. [Temporary] is a triggered ability: at the start of your Beginning Phase it goes on the chain and
 *    the turn is Closed, so you may answer it with [Reaction]-speed effects and spend that very unit. Your
 *    Reaction resolves first (LIFO), the unit is already gone when the [Temporary] item resolves, and the
 *    kill instruction simply finds nothing.
 * Rules: 816 ([Temporary] is a start-of-Beginning-Phase kill trigger), 383.3 (a triggered ability uses the
 *        chain, so it can be responded to), 309.1 / 813 (Reaction speed in a Closed State), 340.1 (LIFO),
 *        359.3.e.5 (an instruction with no legal object is ignored), 186.1 (the token then ceases to exist).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_TOKEN = "unl-t07";
const DEATHGRIP = "sfd-163-221";

/** End of P2's turn 2. P1 holds bf1 with the doomed Sprite plus a 2-Might Ally, four Order runes and Deathgrip. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SPRITE_TOKEN, "sprite")
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
    .runes(P1, "order", 4)
    .hand(P1, DEATHGRIP, "grip");
}

/** P2 ends the turn → P1's Beginning Phase opens with the [Temporary] trigger on the chain. */
async function atTemporaryTrigger(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sprite").keywords).toContain("Temporary");
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  return game;
}

/** [2][order]: two runes tapped for energy, one recycled for Order power. */
async function payForDeathgrip(game: Game): Promise<void> {
  await game.p1.tapRunes(2);
  await game.p1.recycleRune(undefined, "order");
  expect(game.p1.energy()).toBe(2);
  expect(game.p1.power("order")).toBe(1);
}

describe("Ruling 8b1a6d6883bfb304 — the [Temporary] death is a chain item, so the unit can be spent in response", () => {
  test("the trigger is on the chain with the Sprite still alive, and the state is Closed — a [Reaction] is legal here", async () => {
    const game = await atTemporaryTrigger();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true })]);
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await payForDeathgrip(game);
    expect(game.p1.can("cast", "grip")).toBe(true);
  });

  test("Deathgrip kills the Sprite in response: it resolves first, so the value is banked before [Temporary] would have taken it for free", async () => {
    const game = await atTemporaryTrigger();
    await payForDeathgrip(game);
    const handBefore = game.p1.hand().length;
    await game.p1.cast("grip", { targets: "sprite" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sprite", "grip"]); // the Reaction sits on top
    await game.settle();
    // the Sprite died to Deathgrip, not to its own trigger — and being a token it ceases to exist
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.state("ally").might).toBe(5); // +3, the dead Sprite's Might
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1 + 1); // Deathgrip left, Deathgrip drew, Draw Step drew
    expect(game.zoneOf("grip")).toBe("trash");
  });

  test("the [Temporary] item still resolves — with nothing left to kill it does nothing, and the Ally holds bf1 for the point", async () => {
    const game = await atTemporaryTrigger();
    await payForDeathgrip(game);
    const points = game.p1.points();
    await game.p1.cast("grip", { targets: "sprite" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.phase()).toBe("main");
    expect(game.p1.units("bf1")).toEqual(["ally"]);
    expect(game.state("ally").zone).toBe("battlefield-bf1"); // the Ally was never touched by the trigger
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(points + 1);
    expect(game.violations()).toEqual([]);
  });

  test("declining the window instead: the trigger resolves and kills the Sprite itself, and nothing is drawn or buffed", async () => {
    const game = await atTemporaryTrigger();
    const handBefore = game.p1.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.state("ally").might).toBe(2);
    expect(game.p1.hand()).toHaveLength(handBefore + 1); // only the Draw Step
    expect(game.p1.hand()).toContain("grip"); // never played
  });
});
