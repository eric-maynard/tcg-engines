/**
 * Ruling 7412d5518d32facb — Facebreaker (OGN-220 → ogn-220-298) · Spell · Order · [2] · [Hidden] [Action]
 *   "Stun a friendly unit and an enemy unit at the same battlefield. (They don't deal combat damage this turn.)"
 *
 * Q: Both units in a combat are stunned by Facebreaker and so deal no damage. How does the combat resolve?
 * A: The damage step happens and deals nothing; both survive. Combat Cleanup runs, and every attacking unit still
 *    alive is recalled to base. So a tiny unit can wall off a huge attacker with neither taking a scratch — and
 *    the defender keeps the battlefield.
 * Rules: 461.7 (Combat Cleanup recalls surviving attackers), 465.2 (stunned units deal no combat damage),
 *        446 (the defender keeps control when the attacker does not win).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FACEBREAKER = "ogn-220-298";

/** P1's turn, [2] for Facebreaker. P2 defends bf1 with a big body; P1 sends a small attacker in. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Colossus" }, "colossus")
    .unit(P1, "base", { might: 2, name: "Gnat" }, "gnat")
    .hand(P1, FACEBREAKER, "fb");
}

describe("Ruling 7412d5518d32facb — a combat where both sides are stunned: no damage, attacker recalled", () => {
  test("Facebreaker stuns one friendly and one enemy AT THE SAME battlefield — here, both combatants", async () => {
    const game = await board().build();
    await game.p1.move("gnat", "bf1");
    await game.p1.cast("fb", { targets: ["gnat", "colossus"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("gnat").isStunned).toBe(true);
    expect(game.state("colossus").isStunned).toBe(true);
    expect(game.zoneOf("fb")).toBe("trash");
  });

  test("the damage step deals nothing — a 2-Might attacker survives a 7-Might defender and vice versa", async () => {
    const game = await board().build();
    await game.p1.move("gnat", "bf1");
    await game.p1.cast("fb", { targets: ["gnat", "colossus"] });
    await game.settle();
    expect(game.state("gnat").damage).toBe(0);
    expect(game.state("colossus").damage).toBe(0);
    expect(game.zoneOf("colossus")).toBe("battlefield-bf1");
  });

  test("Combat Cleanup then recalls the surviving attacker: the Gnat is back in base and P2 keeps bf1", async () => {
    const game = await board().build();
    await game.p1.move("gnat", "bf1");
    await game.p1.cast("fb", { targets: ["gnat", "colossus"] });
    await game.settle();
    expect(game.zoneOf("gnat")).toBe("base");
    expect(game.locationOf("gnat")).toBe("base");
    expect(game.state("gnat").combatRole).toBeNull();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control — without Facebreaker the same combat kills the Gnat outright", async () => {
    const game = await board().build();
    await game.p1.move("gnat", "bf1");
    await game.settle();
    expect(game.zoneOf("gnat")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
