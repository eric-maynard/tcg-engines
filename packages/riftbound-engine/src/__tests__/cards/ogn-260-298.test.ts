/**
 * Last Breath — ogn-260-298 · Spell · Calm/Chaos · 3 energy + [C][C] · Action
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Ready a friendly unit. It deals damage equal to its Might to an enemy unit at a battlefield.
 *
 * Rules: 135.2.e.6.c — the [C] pips of a Calm/Chaos card are paid with calm and/or chaos power;
 * Action timing = your turn in an open state, or whenever you hold Focus in a showdown; damage on
 * a unit outside combat stays marked until healed (end of turn) and kills at damage ≥ Might.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-260-298";
// Exhausted via the engine's flag store only, so the spell's "ready" is observable.
const EXHAUSTED = { __flags: { exhausted: true } } as const;

function board(power: Record<string, number> = { calm: 1, chaos: 1 }, energy = 3) {
  return scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Striker" }, "ally", EXHAUSTED)
    .unit(P2, "bf1", { might: 5, name: "Field Foe" }, "foe")
    .unit(P2, "base", { might: 2, name: "Home Foe" }, "homeFoe")
    .hand(P1, CARD, "lb");
}

describe("Last Breath (ogn-260-298)", () => {
  test("costs 3 energy + 2 power payable with calm and/or chaos; not with off-domain power or 2 energy", async () => {
    const game = await board().build();
    await game.p1.cast("lb", { targets: ["ally", "foe"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, chaos: 0 } });
    expect((await board({ calm: 2 }).build()).p1.can("cast", "lb")).toBe(true);
    expect((await board({ chaos: 2 }).build()).p1.can("cast", "lb")).toBe(true);
    expect((await board({ fury: 2 }).build()).p1.can("cast", "lb")).toBe(false);
    expect((await board({ calm: 1 }).build()).p1.can("cast", "lb")).toBe(false);
    expect((await board({ calm: 1, chaos: 1 }, 2).build()).p1.can("cast", "lb")).toBe(false);
  });

  test("readies the chosen friendly unit; only friendly units are offered for that choice; spell goes to trash", async () => {
    const game = await board().build();
    const first = game.p1.option("cast", "lb")?.fields.find((f) => f.arg === "targets")?.options?.map((o) => (o as string[])[0]);
    expect(first).toEqual(["ally"]);
    expect(game.state("ally").isExhausted).toBe(true);
    await game.p1.cast("lb", { targets: ["ally", "foe"] });
    await game.settle();
    expect(game.state("ally").isReady).toBe(true);
    expect(game.zoneOf("lb")).toBe("trash");
  });

  test("the readied unit deals damage equal to its Might (4) to an enemy unit at a battlefield", async () => {
    // Expected: a second choice — an ENEMY unit AT A BATTLEFIELD (only "foe"; "homeFoe" is in a
    // base) — either as a second target at cast time or as a prompt on resolution; foe ends with 4
    // damage (5 Might, survives). Actual: only the "ready" half was parsed; no damage is ever dealt.
    const game = await board().build();
    const viaTargets = await game.p1.try((p) => p.cast("lb", { targets: ["ally", "foe"] }));
    if (!viaTargets.ok) {
      await game.p1.cast("lb", { targets: "ally" });
    }
    await game.settle();
    if (game.decision()?.kind === "pick") {
      const d = game.decision();
      expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["foe"]);
      await game.p1.pick("foe");
      await game.settle();
    }
    expect(game.state("ally").isReady).toBe(true);
    expect(game.state("foe").damage).toBe(4);
    expect(game.state("homeFoe").damage).toBe(0);
  });

  test("damage equal to Might is lethal — a 5-Might striker kills the 5-Might enemy at the battlefield", async () => {
    // Expected: foe (5 Might) takes 5 → killed → trash. Actual: no damage clause, foe untouched.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 5 }, "big", EXHAUSTED)
      .unit(P2, "bf1", { might: 5 }, "foe")
      .hand(P1, CARD, "lb")
      .build();
    const viaTargets = await game.p1.try((p) => p.cast("lb", { targets: ["big", "foe"] }));
    if (!viaTargets.ok) {
      await game.p1.cast("lb", { targets: "big" });
    }
    await game.settle({ policy: "first" });
    expect(game.zoneOf("foe")).toBe("trash");
  });

  test("[Action] timing: not playable on the opponent's turn in an open state, but playable when you hold Focus in a showdown", async () => {
    const game = await board().active(P2).battlefield("mine", { controller: P1 }).unit(P1, "mine", { might: 1 }, "bait").build();
    expect(game.p1.can("cast", "lb")).toBe(false);
    await game.p2.move("homeFoe", "mine"); // P2 attacks → showdown, P2 has Focus first
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "lb")).toBe(true);
    await game.p1.cast("lb", { targets: ["ally", "foe"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lb", controller: P1 })]);
    await game.settle();
    expect(game.state("ally").isReady).toBe(true);
  });
});
