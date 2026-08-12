/**
 * Ruling 2fae8664b03ad5ef — (no specific card) where a recalled unit lands.
 *   Exercised with Zhonya's Hourglass (OGN-077 → ogn-077-298) "If a friendly unit would die, kill
 *   this instead. Heal that unit, exhaust it, and recall it." and Possession (OGN-203 → ogn-203-298)
 *   "[Action] Choose an enemy unit at a battlefield. Take control of it and recall it."
 *
 * Q: When a unit recalls after moving from one battlefield to another, does it go back to base or to
 *    the battlefield it came from?
 * A: Always to base. It makes no difference that the unit moved in from another battlefield earlier
 *    the same turn; a recall is not a move and has one destination — base (the recalling player's
 *    base when control changed hands first).
 * Rules: 149 (Recall = send to base, not a move), 323.6 (the emptied battlefield's control lapses).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const POSSESSION = "ogn-203-298"; // 8 Energy + [chaos][chaos][chaos]

/** Base-speed "Deal 9 to a unit." — enough to kill anything on these boards. */
const SMITE = {
  abilities: [{ effect: { amount: 9, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Smite",
  rulesText: "Deal 9 to a unit.",
  timing: "standard",
} as const;

describe("Ruling 2fae8664b03ad5ef — a recall always sends the unit to base, never back to the battlefield it came from", () => {
  test("a [Ganking] unit that walked bf1 → bf2 this turn and is then recalled lands in BASE", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2")
      .unit(P1, "bf1", { keywords: ["Ganking"], might: 3, name: "Runner" }, "runner")
      .unit(P1, "bf1", { might: 1, name: "Anchor" }, "anchor")
      .gear(P1, ZHONYAS, "hourglass")
      .hand(P1, SMITE, "smite")
      .build();
    await game.p1.gank("runner", "bf2");
    await game.settle();
    expect(game.locationOf("runner")).toBe("bf2"); // it really did change battlefields this turn
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);

    await game.p1.cast("smite", { targets: "runner" });
    await game.settle();
    // Zhonya's replaced the death: the gear died, the Runner was healed, exhausted and recalled.
    expect(game.zoneOf("hourglass")).toBe("trash");
    expect(game.locationOf("runner")).toBe("base"); // NOT bf1, NOT bf2
    expect(game.state("runner").damage).toBe(0);
    expect(game.state("runner").isExhausted).toBe(true);
    // The recall is not a move: bf2 is simply empty again and its control lapses.
    expect(game.p1.units("bf2")).toEqual([]);
    expect(game.gameState.battlefields.bf2?.controller).toBeFalsy();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // the Anchor still holds bf1
    expect(game.violations()).toEqual([]);
  });

  test("a unit that never left its first battlefield recalls to base just the same", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .gear(P1, ZHONYAS, "hourglass")
      .hand(P1, SMITE, "smite")
      .build();
    await game.p1.cast("smite", { targets: "guard" });
    await game.settle();
    expect(game.locationOf("guard")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBeFalsy();
  });

  test("Possession's recall sends the stolen unit to its NEW controller's base, not back to the battlefield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { chaos: 3 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Thrall" }, "thrall")
      .unit(P2, "bf1", { might: 1, name: "Anchor" }, "anchor")
      .hand(P1, POSSESSION, "possession")
      .build();
    await game.p1.cast("possession", { targets: "thrall" });
    await game.settle();
    expect(game.state("thrall").controller).toBe(P1);
    expect(game.locationOf("thrall")).toBe("base");
    expect(game.p1.units("base")).toContain("thrall");
    expect(game.locationOf("anchor")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });
});
