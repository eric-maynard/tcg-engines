/**
 * Ruling 2c37714270f231e9 — Vex, Apathetic (unl-150-219) × Baron Nashor (unl-147-219)
 *   Vex: "[Deflect] When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn."
 *   Baron: "As you play me, add the Baron Pit … I enter there. I can't be chosen by enemy spells and abilities. …"
 *
 * Q: Can Vex's trigger stun Baron Nashor when Baron is played, given Baron can't be CHOSEN by enemy abilities?
 * A: Yes. Vex's ability programmatically selects "the unit just played" — nobody chooses it, so it is not a
 *    target and Baron's protection (which only stops being chosen) does not apply. Baron is stunned and
 *    can't be moved that turn.
 * Rules: 355.10.d (automatically-determined objects are not chosen/targets), 757 / 355.9.b (can't be chosen).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const BARON = "unl-147-219";

describe("Ruling 2c37714270f231e9 — Vex, Apathetic stuns Baron Nashor on play despite 'can't be chosen'", () => {
  test("P2 plays Baron while P1's Vex is at a battlefield: Vex's trigger fires and Baron ends up stunned with a no-move restriction", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 10, power: { chaos: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", VEX, "vex")
      .hand(P2, BARON, "baron")
      .build();

    await game.p2.play("baron");
    // Baron is on the board (in the Pit) and carries his "can't be chosen" protection.
    expect(game.zoneOf("baron")).not.toBe("hand");
    expect(game.state("baron").keywords).toContain("Untargetable");
    await game.settle();

    // No choose-target prompt was ever needed: the line settles into P2's open main phase.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.state("baron").isStunned).toBe(true);
    expect(game.state("baron").grantedKeywords.map((k) => k.keyword)).toContain("NoMove");
    // Vex herself is untouched.
    expect(game.state("vex").isStunned).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("control: with Vex in base (not at a battlefield) her trigger does not fire and Baron is not stunned", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 10, power: { chaos: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", VEX, "vex")
      .hand(P2, BARON, "baron")
      .build();

    await game.p2.play("baron");
    await game.settle();
    expect(game.state("baron").isStunned).toBe(false);
    expect(game.state("baron").grantedKeywords.map((k) => k.keyword)).not.toContain("NoMove");
  });
});
