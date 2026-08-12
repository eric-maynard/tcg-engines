/**
 * Ruling eaabcf1df935da5c — Defiant Dance (SFD-196 → sfd-196-221)
 *   "[Reaction] Give a unit +2 [Might] this turn and another unit -2 [Might] this turn."
 *
 * Q: The enemy unit I chose for the -2 dies to a reaction on top of my Defiant Dance — may I pick a
 *    different unit for the -2?
 * A: No. Both objects are chosen as the spell is played and are locked in. If the -2's object is no
 *    longer there at resolution that instruction simply does nothing — it is never re-aimed. The +2
 *    on the other chosen unit still happens.
 * Rules: 355.12 (all objects chosen as the card is played), 359.3.e.5 (an illegal object at resolution
 *        means that instruction does nothing — no new choice).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFIANT_DANCE = "sfd-196-221";
/** P1's Reaction: deal 3 to a unit — used to kill the -2 victim while Defiant Dance waits. */
const ZAP = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Zap",
  timing: "reaction",
} as const;

/** P1: one ally. P2: `victim` (the -2 pick, 2 Might) and `bystander` (never chosen). */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Dancer" }, "ally")
    .unit(P2, "bf1", { might: 2, name: "Victim" }, "victim")
    .unit(P2, "bf1", { might: 5, name: "Bystander" }, "bystander")
    .hand(P1, DEFIANT_DANCE, "dance")
    .hand(P1, ZAP, "zap");
}

describe("Ruling eaabcf1df935da5c — Defiant Dance's -2 cannot be re-aimed when its chosen unit dies first", () => {
  test("control: with nobody interfering the +2 and the -2 both land on the units chosen as it was cast", async () => {
    const game = await board().build();
    await game.p1.cast("dance", { targets: ["ally", "victim"] });
    expect(game.chain()[0]).toMatchObject({ cardId: "dance", targets: ["ally", "victim"] });
    await game.settle();
    expect(game.state("ally").might).toBe(5);
    expect(game.state("victim").mightModifier).toBe(-2);
    expect(game.state("bystander").might).toBe(5);
    expect(game.state("bystander").mightModifier).toBe(0);
  });

  test("the victim is killed in response: no re-target is ever offered, the -2 just fizzles, and the +2 still resolves", async () => {
    const game = await board().build();
    await game.p1.cast("dance", { targets: ["ally", "victim"] });
    await game.p1.cast("zap", { targets: "victim" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dance", "zap"]);

    // Let Zap resolve (LIFO) — the victim dies while Defiant Dance is still waiting below it.
    while (game.chain().length > 1) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["dance"]);

    // Now Defiant Dance resolves. No pick is raised for a replacement -2 victim.
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });

    expect(game.state("ally").might).toBe(5); // the +2 half resolved normally
    expect(game.state("bystander").might).toBe(5); // never chosen ⇒ never given -2
    expect(game.state("bystander").mightModifier).toBe(0);
    expect(game.zoneOf("dance")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
