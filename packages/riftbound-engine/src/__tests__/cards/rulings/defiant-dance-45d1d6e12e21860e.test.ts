/**
 * Ruling 45d1d6e12e21860e — Defiant Dance (SFD-196 → sfd-196-221)
 *   "[Reaction] Give a unit +2 [Might] this turn and another unit -2 [Might] this turn."
 *   × Deathgrip (sfd-163-221) "[Reaction] Kill a friendly unit. If you do, give +[Might] equal to its
 *     Might to another friendly unit this turn."
 *
 * Q: I target an enemy unit with Defiant Dance and my opponent reacts by killing it — do I still get
 *    the +2 on my own unit?
 * A: Yes. Only the instruction aimed at the now-illegal target fails; the spell still resolves and the
 *    other target gets its half. (Symmetrically, losing the +2 target leaves the -2 intact.)
 * Rules: 359.3.e.5 (a target illegal at resolution is unaffected), 359.3.e.8 (the rest still executes).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFIANT_DANCE = "sfd-196-221";
const DEATHGRIP = "sfd-163-221";

/** P1's 3-Might Ally in base; P2's 3-Might Foe and 3-Might Spare at bf1, with a Deathgrip in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .unit(P2, "bf1", { might: 3, name: "Spare" }, "spare")
    .hand(P1, DEFIANT_DANCE, "dance")
    .hand(P2, DEATHGRIP, "grip");
}

describe("Ruling 45d1d6e12e21860e — Defiant Dance keeps the half whose target is still legal", () => {
  test("the -2 target is killed in response ⇒ the friendly unit still gets its +2", async () => {
    const game = await board().build();

    await game.p1.cast("dance", { targets: ["ally", "foe"] }); // +2 Ally, -2 Foe
    await game.p1.passPriority();
    await game.p2.cast("grip", { targets: "foe", answers: ["spare"] }); // kill Foe

    // Intermediate: Deathgrip resolves first; Foe is gone while Defiant Dance is still on the Chain.
    while (game.chain().length > 1) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["dance"]);

    await game.settle();
    expect(game.state("ally").might).toBe(5); // 3 + 2 — the surviving half executed
    expect(game.zoneOf("dance")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("mirror case: the +2 target is killed instead ⇒ the enemy unit still takes its -2", async () => {
    const game = await board()
      .unit(P2, "bf1", { might: 3, name: "Pawn" }, "pawn")
      .build();

    // P1 gives +2 to a unit P2 can kill (Pawn is P2's, but Defiant Dance's targets are not
    // controller-restricted), and -2 to Foe.
    await game.p1.cast("dance", { targets: ["pawn", "foe"] });
    await game.p1.passPriority();
    await game.p2.cast("grip", { targets: "pawn", answers: ["spare"] }); // kill the +2 target
    while (game.chain().length > 1) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("pawn")).toBe("trash");

    await game.settle();
    expect(game.state("foe").might).toBe(1); // 3 - 2 — the other half still executed
    expect(game.zoneOf("dance")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control: undisturbed, Defiant Dance applies both halves", async () => {
    const game = await board().build();
    await game.p1.cast("dance", { targets: ["ally", "foe"] });
    await game.settle();
    expect(game.state("ally").might).toBe(5);
    expect(game.state("foe").might).toBe(1);
  });
});
