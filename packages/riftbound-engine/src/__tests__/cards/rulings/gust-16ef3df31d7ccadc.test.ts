/**
 * Ruling 16ef3df31d7ccadc — Gust (OGN-169 → ogn-169-298) · Spell · Chaos · 1 · [Reaction]
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Mask of Foresight (OGN-060 → ogn-060-298) · Gear "When a friendly unit attacks or defends alone, give it +1
 *     [Might] this turn."
 *
 * Q: Can I Gust the unit back before the Mask of Foresight trigger resolves?
 * A: Yes. The Mask trigger goes on the chain; the defender gets priority and may react with Gust. LIFO: Gust
 *    resolves first and returns the unit to hand; the Mask trigger then resolves with its unit gone and does
 *    nothing (mistargets).
 * Rules: 383 (triggered abilities use the chain), 340/336 (priority, LIFO), 359.3.f (referent gone → no effect).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const MASK_OF_FORESIGHT = "ogn-060-298";

/** P1's turn. P1: Mask in base, lone 3-Might Scout in base. P2 holds bf1 with a 2-Might Guard and has Gust + 1 energy. */
function board() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .hand(P2, GUST, "gust");
}

describe("Ruling 16ef3df31d7ccadc — Gust in response to Mask of Foresight's trigger bounces the unit before the +1 applies", () => {
  test("Scout attacks alone: Mask's trigger is placed on the chain (not applied yet) and the Scout is still 3 Might", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "mask", controller: P1, triggered: true });
    expect(game.state("scout").might).toBe(3);
  });

  test("with the trigger pending, P2 gets priority and Gust is a legal reaction on the (still 3-Might) Scout", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    // P1 holds priority first; passing hands it to P2 with the trigger still on the chain.
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["mask"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "scout" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["mask", "gust"]);
  });

  test("LIFO: Gust resolves first → Scout to P1's hand; Mask's trigger then resolves with no unit and does nothing; no combat happens", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("gust", { targets: "scout" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p1.hand()).toContain("scout");
    expect(game.state("guard").damage).toBe(0);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // 359.3.f: the Mask trigger's unit left the board before it resolved, so "give it +1 [Might]" is not performed
  // at all — the card in hand is a new object with no modifier, and replayed this turn it is a plain 3-Might unit.
  test("the whiffed Mask trigger has NO effect: the Gusted card in hand carries no +1 and replays this turn as a plain 3-Might unit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .gear(P1, MASK_OF_FORESIGHT, "mask")
      .unit(P1, "base", { energyCost: 2, might: 3, name: "Scout" }, "scout")
      .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.move("scout", "bf1");
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("gust", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.state("scout").mightModifier).toBe(0);
    await game.p1.play("scout");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.state("scout").might).toBe(3);
  });

  test("control: without the Gust, the trigger resolves and the lone attacker gets +1 (4 Might) for the combat", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    // Drain the chain only (stop before combat damage) to observe the +1.
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.state("scout").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
