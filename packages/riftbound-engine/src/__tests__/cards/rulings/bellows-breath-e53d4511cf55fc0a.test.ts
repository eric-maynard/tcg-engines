/**
 * Ruling e53d4511cf55fc0a — Bellows Breath (SFD-080 → sfd-080-221) · [Action] · Mind · [1][mind]
 *     "[Repeat] [1][mind] (You may pay the additional cost to repeat this spell's effect.)
 *      Deal 1 to up to three units at the same location."
 *
 * Q: How does Bellows Breath work — can you choose the same unit more than once?
 * A: No. You choose zero, one, two or three DIFFERENT units, all at one and the same location, and deal each
 *    of them 1. With [Repeat] paid the effect happens twice, so the most a single unit can take is 2 (once
 *    per execution).
 * Rules: 355.12/355.13 ("up to N" = a set of distinct objects, zero is a legal choice), 355.10.a (one object
 *        cannot fill two slots of one set), 820 ([Repeat] = one item executed again, same chosen set).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";

/** P1's turn with [2] + 2 mind (base + one Repeat). P2 has three grunts at bf1 and a fourth at bf2. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Grunt A" }, "a")
    .unit(P2, "bf1", { might: 4, name: "Grunt B" }, "b")
    .unit(P2, "bf1", { might: 4, name: "Grunt C" }, "c")
    .unit(P2, "bf2", { might: 4, name: "Faraway" }, "far")
    .hand(P1, BELLOWS_BREATH, "bellows");
}

describe("Ruling e53d4511cf55fc0a — Bellows Breath hits up to three DIFFERENT units at one location", () => {
  // Expected (355.10.a / 355.12): one object cannot fill two slots of the same "up to three units" set, so
  // naming Grunt A twice is not a legal play. Actual: playSpell enumerates duplicate sets (["a","a"], even
  // ["a","b","c","a","b","c"]), the cast is accepted and Grunt A takes 2 from a single, un-repeated Bellows.
  test("ruling e53d4511cf55fc0a — the same unit cannot be named twice in one Bellows Breath set", async () => {
    const game = await board().build();
    const attempt = await game.p1.try((p) => p.cast("bellows", { targets: ["a", "a"] }));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("bellows")).toBe("hand");
    expect(game.state("a").damage).toBe(0);
  });

  test("three distinct units at the SAME location each take exactly 1", async () => {
    const game = await board().build();
    await game.p1.cast("bellows", { targets: ["a", "b", "c"] });
    await game.settle();
    expect(game.state("a").damage).toBe(1);
    expect(game.state("b").damage).toBe(1);
    expect(game.state("c").damage).toBe(1);
    expect(game.state("far").damage).toBe(0);
    expect(game.zoneOf("bellows")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // rule 355.11.b — "at the same location" restricts ONE execution's set to one location, so bf1's Grunt A
  // and bf2's Faraway cannot be named together by a single (un-Repeated) Bellows Breath.
  // RULING-CONFLICT: riftjudge e53d4511cf55fc0a reads as if the mixed set were never OFFERED; CR 820 — and
  // the green rulings 4cdede4e3549fa7a / b103ef9e7b619ede — let a [Repeat]-paid cast aim each execution at a
  // different location, so ["a","far"] IS a legal flat list once the Repeat is elected and the play's
  // flattened `targets` field lists the union over every repeat count. The engine follows the CR; what the
  // ruling governs is the CAST, asserted here: without electing the Repeat the mixed set is refused.
  test("ruling e53d4511cf55fc0a — one Bellows Breath set cannot span two locations", async () => {
    const game = await board().build();
    const attempt = await game.p1.try((p) => p.cast("bellows", { targets: ["a", "far"] }));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("bellows")).toBe("hand");
    expect(game.state("a").damage).toBe(0);
    expect(game.state("far").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 2 } }); // nothing paid, no Repeat bought
    await game.p1.cast("bellows", { repeat: 1, targets: ["a", "far"] }); // rule 820 — with the Repeat it is legal
    await game.settle();
    expect(game.state("a").damage).toBe(1);
    expect(game.state("far").damage).toBe(1);
  });

  test("fewer than three is fine: naming one unit deals 1 to it and nothing to the rest", async () => {
    const game = await board().build();
    await game.p1.cast("bellows", { targets: ["a"] });
    await game.settle();
    expect(game.state("a").damage).toBe(1);
    expect(game.state("b").damage).toBe(0);
    expect(game.state("c").damage).toBe(0);
  });

  test("nuance: with [Repeat] paid the same unit is hit once per execution — 2 damage is the maximum it can take", async () => {
    const game = await board().build();
    await game.p1.cast("bellows", { repeat: 1, targets: ["a"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // base + repeat paid up front
    await game.settle();
    expect(game.state("a").damage).toBe(2);
    expect(game.state("b").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
