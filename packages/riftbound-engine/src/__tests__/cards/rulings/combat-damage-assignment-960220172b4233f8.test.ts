/**
 * Ruling 960220172b4233f8 — (no specific card) combat damage with several units on each side.
 *
 * Q: How is combat damage distributed when multiple units attack and multiple units defend?
 * A: Sum each side's Might; then ASSIGN, starting with the attacker, unit by unit — lethal in full to
 *    one before any goes to the next, no more than the lethal minimum until nothing is left to assign
 *    to, and [Tank] units first. Assigning is not dealing: once both sides have assigned, all of it is
 *    DEALT simultaneously, and only then are lethal-damage units killed. Stunned units add 0 to their
 *    side's total but can still be assigned damage.
 * Rules: 465.2.a/b (sum Might), 465.2.c (attacker assigns first), 465.2.c.1/1.a (assigning ≠ dealing;
 *        all dealt simultaneously), 465.2.c.3 (lethal in full before the next unit), 465.2.c.4 (no
 *        excess while another unit lacks lethal), 465.2.c.6 ([Tank] must be assigned first),
 *        142 (lethal damage), 818 ([Stun] — 0 Might).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** Answer whichever `distribute` prompts come up, using the supplied plans in order. */
async function answerDistributions(game: Game, plans: Record<string, number>[]): Promise<void> {
  for (const plan of plans) {
    const d = game.decision();
    if (d?.kind !== "distribute") {
      break;
    }
    await game.seat(d.seat).distribute(plan);
  }
}

describe("Ruling 960220172b4233f8 — assignment is sequential and lethal-first; dealing is simultaneous", () => {
  test("attacker assigns first: 7 Might across two 3-Might defenders must cover lethal on both, only the last taking the spare point", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Guard A" }, "guardA")
      .unit(P2, "bf1", { might: 3, name: "Guard B" }, "guardB")
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .unit(P1, "base", { might: 4, name: "Brute" }, "brute")
      .build();
    await game.p1.move(["raider", "brute"], "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    // The ATTACKER assigns first (465.2.c).
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 7 });
    // 3 + 3 is forced; the 7th point may only pile on whichever unit was served last (465.2.c.4).
    expect((await game.p1.try((p) => p.distribute({ guardA: 1, guardB: 6 }))).ok).toBe(false);
    await game.p1.distribute({ guardA: 4, guardB: 3 });
    // Then the DEFENDER assigns its 6.
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2, total: 6 });
    await game.p2.distribute({ brute: 3, raider: 3 });
    await game.settle();
    expect(game.zoneOf("guardA")).toBe("trash");
    expect(game.zoneOf("guardB")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("dealing is simultaneous: defenders that die still deal their full damage to the attackers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Guard A" }, "guardA")
      .unit(P2, "bf1", { might: 3, name: "Guard B" }, "guardB")
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .unit(P1, "base", { might: 4, name: "Brute" }, "brute")
      .build();
    await game.p1.move(["raider", "brute"], "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await answerDistributions(game, [{ guardA: 4, guardB: 3 }, { brute: 3, raider: 3 }]);
    await game.settle();
    expect(game.zoneOf("guardA")).toBe("trash");
    expect(game.zoneOf("guardB")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash"); // 3 dealt to a 3-Might attacker, simultaneously
    expect(game.zoneOf("brute")).toBe("battlefield-bf1"); // 3 of 4 — survives, and heals in Combat Cleanup
    expect(game.state("brute").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("[Tank] must be assigned lethal before any non-Tank defender", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { keywords: ["Tank"], might: 3, name: "Tanky" }, "tanky")
      .unit(P2, "bf1", { might: 2, name: "Squishy A" }, "squishyA")
      .unit(P2, "bf1", { might: 2, name: "Squishy B" }, "squishyB")
      .unit(P1, "base", { might: 5, name: "Brute" }, "brute")
      .build();
    await game.p1.move("brute", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 5 });
    // Skipping the Tank is illegal even though 2 + 2 would be lethal on both Squishies.
    expect((await game.p1.try((p) => p.distribute({ squishyA: 2, squishyB: 2, tanky: 1 }))).ok).toBe(false);
    // Legal: the Tank first, in full; the remainder is then the assigner's choice between the Squishies.
    await game.p1.distribute({ squishyA: 2, tanky: 3 });
    await game.settle();
    expect(game.zoneOf("tanky")).toBe("trash");
    expect(game.zoneOf("squishyA")).toBe("trash");
    expect(game.zoneOf("squishyB")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("when only ONE legal assignment exists the [Tank] rule simply forces it — nothing is asked and the Tank still dies first", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { keywords: ["Tank"], might: 3, name: "Tanky" }, "tanky")
      .unit(P2, "bf1", { might: 2, name: "Squishy" }, "squishy")
      .unit(P1, "base", { might: 4, name: "Brute" }, "brute")
      .build();
    await game.p1.move("brute", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    // 3 to the Tank then 1 to the Squishy is the only assignment obeying 465.2.c.3 + 465.2.c.6.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action" });
    expect(game.zoneOf("tanky")).toBe("trash");
    expect(game.zoneOf("squishy")).toBe("battlefield-bf1"); // took 1 of 2, healed in Combat Cleanup
    expect(game.violations()).toEqual([]);
  });

  test("a stunned defender contributes 0 Might to its side's total yet is still a legal recipient of damage", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Sleeper" }, "sleeper", { stunned: true })
      .unit(P1, "base", { might: 5, name: "Brute" }, "brute")
      .build();
    expect(game.state("sleeper").isStunned).toBe(true);
    await game.p1.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("sleeper")).toBe("trash"); // took the attacker's 5
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.state("brute").damage).toBe(0); // the stunned unit dealt nothing back
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
