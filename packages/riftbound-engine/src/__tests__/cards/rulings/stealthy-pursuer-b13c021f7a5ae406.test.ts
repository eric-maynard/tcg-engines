/**
 * Ruling b13c021f7a5ae406 — Stealthy Pursuer (OGN-177 → ogn-177-298) · Unit · Chaos · 4 · 4 Might
 *   "When a friendly unit moves from my location, I may be moved with it."
 *   × Mask of Foresight (OGN-060 → ogn-060-298) · Gear · Calm · 2
 *   "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *
 * Q: I move a unit (sharing a location with Stealthy Pursuer) to a battlefield my opponent controls.
 *    Do both Mask of Foresight and Stealthy Pursuer trigger?
 * A: Pursuer triggers; Mask does not. The Pursuer's move trigger goes on the chain during cleanup and
 *    holds combat off; when it resolves the second unit arrives, so when combat begins neither unit is
 *    attacking alone. If instead you decline the "may", combat begins with one unit and Mask triggers.
 * Rules: 383.4.d (move trigger), 323.13 / 460 (combat begins only from an empty chain), 383.4.e
 *        (attack triggers checked on gaining the designation), 740.2.a ("alone").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STEALTHY_PURSUER = "ogn-177-298";
const MASK_OF_FORESIGHT = "ogn-060-298";

/** P1's turn. P1: Mask in base, Scout (3) + Pursuer in base. P2 holds bf1 with a Holder (2). */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .unit(P1, "base", STEALTHY_PURSUER, "sp");
}

describe("Ruling b13c021f7a5ae406 — Stealthy Pursuer following an attacker means nobody 'attacks alone' for Mask of Foresight", () => {
  test("Scout moves to enemy bf1: the Pursuer's move trigger is on the chain (P1's 'may'), combat has NOT begun, Mask has not triggered", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    // Combat is staged but cannot begin: an item is on the chain.
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sp", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "sp" } });
    expect(game.state("scout").might).toBe(3);
    expect(game.state("scout").combatRole).not.toBe("attacker");
  });

  test("P1 accepts: the Pursuer arrives before combat begins; both are Attackers, so Mask of Foresight does NOT trigger — Scout stays 3, Pursuer stays 4", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves → Pursuer moves → cleanup → combat begins
    expect(game.locationOf("sp")).toBe("bf1");
    expect(game.chain()).toEqual([]); // no Mask trigger was added
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("sp").combatRole).toBe("attacker");
    expect(game.state("scout").might).toBe(3);
    expect(game.state("scout").mightModifier).toBe(0);
    expect(game.state("sp").might).toBe(4);
    expect(game.state("sp").mightModifier).toBe(0);
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — P1 declines the 'may': Scout attacks alone, so Mask of Foresight triggers and Scout gets +1 (3 → 4) this turn", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.no();
    expect(game.locationOf("sp")).toBe("base");
    // Combat begins with Scout alone → Mask's trigger is put on the chain / resolves.
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("scout").might).toBe(4);
    expect(game.state("scout").mightModifier).toBe(1);
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.locationOf("sp")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
