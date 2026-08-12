/**
 * Ruling 4e9377b767eb7ce2 — Vex, Apathetic (UNL-150 → unl-150-219) · Unit · [4] · 4 Might
 *   "[Deflect] When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it
 *    this turn."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [Action] · [2][chaos] · "Move a friendly unit and ready it."
 *
 * Q: If a unit is stunned, can it still be moved by a spell or ability?
 * A: Yes. Stun does exactly two things — the unit contributes no combat damage, and it cannot be stunned
 *    again. It says nothing about moving. A "can't move" restriction only exists where a card prints one,
 *    as Vex, Apathetic does in the sentence AFTER the stun.
 * Rules: 423.1 (Stun: 423.1.a.1 not re-stunnable, 423.1.b no combat damage), 137 (Move), 423.1.a.2
 *        (Stun lapses at end of turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const RIDE_THE_WIND = "ogn-173-298";

describe("Ruling 4e9377b767eb7ce2 — Stun alone never stops a unit from being moved", () => {
  test("premise: a stunned unit is simply a unit with the Stun status; nothing about it is 'can't move'", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 3, name: "Dazed" }, "dazed", { stunned: true })
      .build();
    expect(game.state("dazed")).toMatchObject({ isStunned: true, might: 3 });
    expect(game.state("dazed").keywords).not.toContain("NoMove");
  });

  test("a stunned unit can be moved by a SPELL: Ride the Wind takes it to a battlefield (and readies it) while it is still stunned", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 3, name: "Dazed" }, "dazed", { exhausted: true, stunned: true })
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.cast("rtw", { targets: "dazed" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bf1");
      await game.settle();
    }
    expect(game.locationOf("dazed")).toBe("bf1");
    expect(game.state("dazed")).toMatchObject({ isReady: true, isStunned: true });
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("a stunned unit can also just walk: a standard move to a battlefield is legal", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 3, name: "Dazed" }, "dazed", { stunned: true })
      .build();
    await game.p1.move("dazed", "bf1");
    await game.settle();
    expect(game.locationOf("dazed")).toBe("bf1");
    expect(game.state("dazed").isStunned).toBe(true);
  });

  test("contrast — Vex's own extra sentence IS a restriction: the unit she stuns on arrival cannot be moved by its controller this turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", VEX, "vex")
      .hand(P1, { cardType: "unit", energyCost: 3, might: 3, name: "Newcomer" }, "newcomer")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.play("newcomer", { to: "base" });
    await game.settle();
    expect(game.state("newcomer").isStunned).toBe(true);
    expect(game.state("newcomer").keywords).toContain("NoMove");
    expect((await game.p1.try((p) => p.move("newcomer", "bf2"))).ok).toBe(false);
    expect(game.locationOf("newcomer")).toBe("base");
  });

  test("…and that restriction is the card's, not Stun's: it lasts only 'this turn' — next turn the same unit moves freely", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", VEX, "vex")
      .hand(P1, { cardType: "unit", energyCost: 3, might: 3, name: "Newcomer" }, "newcomer")
      .build();
    await game.p1.play("newcomer", { to: "base" });
    await game.settle();
    await game.advanceTurn(); // P2's turn
    await game.advanceTurn(); // back to P1
    expect(game.state("newcomer").isStunned).toBe(false);
    expect(game.state("newcomer").keywords).not.toContain("NoMove");
    await game.p1.move("newcomer", "bf2");
    await game.settle();
    expect(game.locationOf("newcomer")).toBe("bf2");
  });
});
