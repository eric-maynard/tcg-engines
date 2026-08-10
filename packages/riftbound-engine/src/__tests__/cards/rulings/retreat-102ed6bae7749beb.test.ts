/**
 * Ruling 102ed6bae7749beb — Retreat (OGN-104 → ogn-104-298) "[Reaction] Return a friendly unit to its owner's
 *   hand. Its owner channels 1 rune exhausted."  × Wind Wall (OGN-064 → ogn-064-298) "[Reaction] Counter a spell."
 *   × a Lux "when you play a spell" ability — Lady of Luminosity (ogs-021-024) "When you play a spell that
 *     costs [5] or more, draw 1." (the Lux printing in our pool), fed by Falling Comet (ogn-085-298, [5]).
 *
 * Q: Does Lux's ability trigger when the spell is countered, or when its target becomes invalid?
 * A: Invalid target (e.g. Retreat bounced it): the spell still RESOLVES (impossible instructions ignored),
 *    so it was played and Lux triggers. Countered (Wind Wall): the spell never resolves → Lux does NOT
 *    trigger.
 * Rules: 419.4.a / 419.4.a.1 (play triggers fire on completed resolution; countered ⇒ no trigger),
 *        359.3.e.10 (a spell with all-invalid targets is still considered played), 419.4.b (finalize-based
 *        "cards played" checks still count a countered spell), 425 (Counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LUX = "ogs-021-024";
const FALLING_COMET = "ogn-085-298";
const RETREAT = "ogn-104-298";
const WIND_WALL = "ogn-064-298";

/**
 * P1's turn with the Lux legend and Falling Comet ([5]) in hand, exactly 5 energy. P2 holds bf1 with a
 * Victim (7 — survives 6 damage) plus a Bystander, and has Retreat ([1]) and Wind Wall ([3][calm][calm]).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5 })
    .resources(P2, { energy: 4, power: { calm: 2 } })
    .legend(P1, LUX, "lux")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Victim" }, "victim")
    .unit(P2, "bf1", { might: 1, name: "Bystander" }, "bystander")
    .hand(P1, FALLING_COMET, "comet")
    .hand(P2, RETREAT, "retreat")
    .hand(P2, WIND_WALL, "ww");
}

async function cometOnVictim(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("comet", { targets: "victim" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "comet", controller: P1 })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

describe("Ruling 102ed6bae7749beb — Lux triggers on an invalid-target spell but not on a countered one", () => {
  test("control (no response): Comet resolves, deals 6, and Lux's trigger then draws P1 a card", async () => {
    const game = await cometOnVictim();
    const played0 = game.gameState.cardsPlayedThisTurn[P1] ?? 0;
    await game.p2.passPriority();
    expect(game.state("victim").damage).toBe(6);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lux", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.gameState.cardsPlayedThisTurn[P1] ?? 0).toBeGreaterThanOrEqual(played0);
  });

  test("ruling 102ed6bae7749beb — Retreat bounces the target in response: Comet still RESOLVES (damage ignored, Victim safe in hand) ⇒ it was played ⇒ Lux's trigger goes on the chain and P1 draws 1", async () => {
    const game = await cometOnVictim();
    await game.p2.cast("retreat", { targets: "victim" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["comet", "retreat"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Retreat resolves
    expect(game.zoneOf("victim")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["comet"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Comet resolves with an illegal target
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.state("victim").damage).toBe(0);
    expect(game.zoneOf("victim")).toBe("hand");
    // It resolved → "played" → Lux triggers.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lux", controller: P1, triggered: true })]);
    expect(game.gameState.cardsPlayedThisTurn[P1]).toBe(1);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1); // drew 1 off Lux (Comet left the hand earlier)
    expect(game.violations()).toEqual([]);
  });

  test("ruling 102ed6bae7749beb — Wind Wall counters Comet: it never resolves (no damage) ⇒ Lux does NOT trigger, no Lux item ever appears and P1 draws nothing; the finalize-based 'cards played' tally still counts it (419.4.b)", async () => {
    const game = await cometOnVictim();
    expect(game.p2.can("cast", "ww")).toBe(true);
    await game.p2.cast("ww", { targets: "comet" });
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["comet", "ww"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Wind Wall resolves: Comet is countered
    expect(game.chain().some((c) => c.cardId === "lux")).toBe(false);
    await game.settle();
    expect(game.zoneOf("comet")).toBe("trash");
    expect(game.state("victim")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual([]); // no Lux draw
    expect(game.gameState.cardsPlayedThisTurn[P1]).toBe(1); // Finalized ⇒ still "a card played" for Legion-style checks
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
