/**
 * Ruling 5990ea30a6f0068b — [Repeat]
 *   Feral Strength (sfd-034-221) · Spell · [Reaction] · [2] · "[Repeat] [2] — Give a unit +2 [Might] this turn."
 *   Square Up (unl-017-219) · Spell · [4] · "[Repeat] — Discard 1 — Give a unit [Assault 4] this turn."
 *
 * Q: Can I keep repeating a spell until I run out of runes?
 * A: No. Each individual instance of [Repeat] on a spell can be paid for only ONCE — a mountain of runes
 *    (or of discardable cards) buys nothing more. The decision is made when you play the spell from hand;
 *    you cannot add repetitions afterwards or while it resolves.
 * Rules: 820.1.c.3 (each [Repeat] instance may be paid once), 820.1.d / 355.1.a (the additional cost is
 *        paid as the spell is played), 820.2 (the extra execution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FERAL_STRENGTH = "sfd-034-221";
const SQUARE_UP = "unl-017-219";
const FODDER = "ogn-175-298"; // Shipyard Skulker — discard fodder

describe("Ruling 5990ea30a6f0068b — one payment per [Repeat] instance", () => {
  test("with 2 energy the repeat is not even offered; with 4 it is offered exactly ONCE (max 1)", async () => {
    const poor = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, FERAL_STRENGTH, "fs")
      .build();
    expect(poor.p1.option("cast", "fs")?.fields.some((f) => f.arg === "repeat")).toBe(false);
    const rich = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, FERAL_STRENGTH, "fs")
      .build();
    expect(rich.p1.option("cast", "fs")?.fields.find((f) => f.arg === "repeat")?.max).toBe(1);
  });

  test("a huge pool buys no more repetitions: with 20 energy the offer is still max 1 and repeat: 2 / 3 are refused", async () => {
    const game = await scenario()
      .resources(P1, { energy: 20 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, FERAL_STRENGTH, "fs")
      .build();
    expect(game.p1.option("cast", "fs")?.fields.find((f) => f.arg === "repeat")?.max).toBe(1);
    expect((await game.p1.try((p) => p.cast("fs", { repeat: 2, targets: "ally" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("fs", { repeat: 3, targets: "ally" }))).ok).toBe(false);
    expect(game.zoneOf("fs")).toBe("hand");
    expect(game.p1.energy()).toBe(20); // nothing was charged by the refused attempts
  });

  test("the one legal repetition executes the effect twice and costs exactly 2 + 2 — the rest of the pool is untouched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 20 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, FERAL_STRENGTH, "fs")
      .build();
    await game.p1.cast("fs", { repeat: 1, targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(6); // 2 + 2 + 2
    expect(game.p1.energy()).toBe(16);
    expect(game.zoneOf("fs")).toBe("trash");
  });

  test("the choice is made when the spell is PLAYED: once it is on the chain nothing more can be paid, and no repeat question is asked as it resolves", async () => {
    const game = await scenario()
      .resources(P1, { energy: 20 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, FERAL_STRENGTH, "fs")
      .build();
    await game.p1.cast("fs", { targets: "ally" }); // played WITHOUT the repeat
    expect(game.chain().map((i) => i.cardId)).toEqual(["fs"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.legal().some((o) => o.card === "fs")).toBe(false); // no way to add it now
    await game.settle();
    expect(game.state("ally").might).toBe(4); // one execution only
    expect(game.p1.energy()).toBe(18);
    expect(game.violations()).toEqual([]);
  });

  test("the same cap holds for a non-energy [Repeat] cost: a hand full of discard fodder still buys one repetition", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 1, name: "Rookie" }, "rookie")
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .hand(P1, SQUARE_UP, "sq")
      .hand(P1, FODDER, "f1")
      .hand(P1, FODDER, "f2")
      .hand(P1, FODDER, "f3")
      .build();
    expect(game.p1.option("cast", "sq")?.fields.find((f) => f.arg === "repeat")?.max).toBe(1);
    expect((await game.p1.try((p) => p.cast("sq", { answers: ["f1", "f2"], repeat: 2, targets: "rookie" }))).ok).toBe(false);
    await game.p1.cast("sq", { answers: ["f1"], repeat: 1, targets: "rookie" });
    await game.settle();
    // exactly TWO grants — one per execution, and no more (807.2: they sum to Assault 8)
    expect(game.state("rookie").grantedKeywords).toEqual([
      { duration: "turn", keyword: "Assault", value: 4 },
      { duration: "turn", keyword: "Assault", value: 4 },
    ]);
    expect(game.p1.hand().sort()).toEqual(["f2", "f3"]);
    expect(game.violations()).toEqual([]);
  });
});
