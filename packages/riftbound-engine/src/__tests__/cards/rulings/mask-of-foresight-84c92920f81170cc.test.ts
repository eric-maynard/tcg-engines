/**
 * Ruling 84c92920f81170cc — Mask of Foresight (OGN-060 → ogn-060-298) × Yasuo, Remorseful (OGN-076 → ogn-076-298)
 *   Mask: "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *   Yasuo (6): "When I attack, deal damage equal to my Might to an enemy unit here."
 *
 * Q: Opponent has Mask + one unit at a battlefield; I attack with Yasuo. Does their unit get Mask's +1 before
 *    Yasuo's damage? Is that different from Shield?
 * A: Yasuo's attack trigger goes on the chain first, then the defender's Mask trigger; LIFO → Mask resolves first
 *    (+1), then Yasuo's damage, then combat. Shield is different: it is a passive that is on the moment the unit
 *    is a defender and never uses the chain. After the triggers resolve the attacker gets priority/focus.
 * Rules: 383.4.e/f + 383.5 (attacker's triggers placed before defender's), 332 (LIFO), 727 (Shield is passive).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const YASUO = "ogn-076-298";

/** P1's turn: Yasuo (6) ready in base. P2 holds bf1 with a lone 6-Might Guard and Mask of Foresight in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .gear(P2, MASK_OF_FORESIGHT, "mask")
    .unit(P2, "bf1", { might: 6, name: "Guard" }, "guard")
    .unit(P1, "base", YASUO, "yasuo");
}

describe("Ruling 84c92920f81170cc — Yasuo's attack trigger goes on the chain before the defender's Mask trigger, so Mask resolves first", () => {
  test("initial chain order: Yasuo's trigger (attacker, P1) is placed first, Mask's (defender, P2) on top of it", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    // Yasuo's target is chosen at finalization (only one enemy unit here → may be auto-locked).
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("guard");
    }
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    const chain = game.chain();
    expect(chain.map((c) => c.cardId)).toEqual(["yasuo", "mask"]);
    expect(chain[0]).toMatchObject({ controller: P1, triggered: true });
    expect(chain[1]).toMatchObject({ controller: P2, triggered: true });
    expect(game.state("guard").might).toBe(6); // nothing resolved yet
  });

  test("LIFO: Mask resolves first (Guard 6 → 7), THEN Yasuo deals 6 — the Guard survives with 6 damage; then the attacker holds Focus", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("guard");
    }
    // one round of passes resolves the top item (Mask)
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]);
    expect(game.state("guard").might).toBe(7);
    expect(game.state("guard").damage).toBe(0);
    // next round resolves Yasuo's damage
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(6);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1"); // 6 < 7 — survived thanks to Mask resolving first
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // attacker gets Focus
  });

  test("contrast — Shield: a [Shield 1] 6-Might defender is 7 the moment it defends with NO chain item of its own; Yasuo's 6 damage likewise fails to kill it", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { keywords: ["Shield"], might: 6, name: "Shielded Guard", abilities: [{ keyword: "Shield", type: "keyword", value: 1 }] }, "sg")
      .unit(P1, "base", YASUO, "yasuo")
      .build();
    await game.p1.move("yasuo", "bf1");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("sg");
    }
    expect(game.state("sg").combatRole).toBe("defender");
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]); // only Yasuo — Shield does not use the chain
    expect(game.state("sg").might).toBe(7); // already active
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("sg").damage).toBe(6);
    expect(game.zoneOf("sg")).toBe("battlefield-bf1");
  });
});
