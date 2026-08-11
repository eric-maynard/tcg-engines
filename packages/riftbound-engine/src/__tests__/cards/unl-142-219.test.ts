/**
 * Heedless Resurrection — unl-142-219 · Spell · Chaos · 2 energy + [chaos] · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   As an additional cost to play this, kill a friendly unit.
 *   Play a unit from your trash that costs no more Energy and no more Power than the killed unit,
 *   ignoring its cost.
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. The kill is a MANDATORY additional cost (356.2.a.1): paid while finalizing (357), before anyone
 *      can respond; no friendly unit → the spell cannot be played at all. The killed unit really dies —
 *      its Deathknell triggers.
 *   2. Reaction (813): playable in a Closed State on the opponent's turn — the signature line is answering
 *      an enemy kill spell by sacrificing its target (their spell then has nothing to hit) — but NOT during
 *      the opponent's Open main phase with an empty chain.
 *   3. Eligibility is two independent caps read off the killed unit: Energy ≤ its Energy AND number of
 *      Power pips ≤ its Power (a 2-energy/1-power card is NOT "no more Power" than a 4-energy/0-power kill).
 *   4. "from YOUR trash" (never the opponent's); the trash is public so this is a target chosen when the
 *      spell is finalized (355.5/355.10.a) — i.e. BEFORE the cost kill (357): the sacrificed unit itself is
 *      not a candidate. No unit in your trash → no legal target → cannot be played (355.8).
 *   5. "ignoring its cost" (356.1.b.1): only 2 + [chaos] ever leaves the pool; the resurrected unit is a
 *      normal play otherwise (enters your base exhausted).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-142-219";
const WATCHFUL_SENTRY = "ogn-096-298"; // 2 energy, 1 might: [Deathknell] — Draw 1.
const FINAL_SPARK = "ogs-022-024"; // 8 energy [Action]: Deal 8 to a unit.

const THREE_P = { cardType: "unit", energyCost: 3, might: 3, name: "Three-and-Chaos", powerCost: ["chaos"] } as const;
const FIVE = { cardType: "unit", energyCost: 5, might: 5, name: "Five Drop" } as const;
const TWO = { cardType: "unit", energyCost: 2, might: 2, name: "Two Drop" } as const;
const TWO_PP = { cardType: "unit", energyCost: 2, might: 4, name: "Two-and-Two-Power", powerCost: ["chaos", "chaos"] } as const;

/** P1: Victim (3 energy + 1 chaos, on board) and Cheap (1); trash: 3+P, 5, 2, 2+PP; P2's trash has a 1-drop. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .unit(P1, "base", { ...THREE_P, name: "Victim" }, "victim")
    .unit(P1, "base", { energyCost: 1, might: 1, name: "Cheap" }, "cheap")
    .trash(P1, THREE_P, "threep")
    .trash(P1, FIVE, "five")
    .trash(P1, TWO, "two")
    .trash(P1, TWO_PP, "twopp")
    .trash(P2, { cardType: "unit", energyCost: 1, might: 1, name: "Their One" }, "theirs")
    .hand(P1, CARD, "hr");
}

describe("Heedless Resurrection (unl-142-219)", () => {
  test("registry payload: Reaction spell, cost 2 + [chaos], mandatory additionalCost kill-friendly-unit, effect play a unit from trash", async () => {
    await scenario().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "chaos", energyCost: 2, name: "Heedless Resurrection", powerCost: ["chaos"], timing: "reaction" });
    expect(def?.abilities).toEqual([
      {
        additionalCost: { kill: { controller: "friendly", type: "unit" } },
        effect: { from: "trash", target: { type: "unit" }, type: "play" },
        timing: "reaction",
        type: "spell",
      },
    ]);
  });

  test("cost: 2 energy + 1 chaos AND a friendly unit killed on finalize (before anyone can respond); the spell ends in the trash", async () => {
    const game = await board().build();
    const sac = game.p1.option("cast", "hr")?.fields.find((f) => f.arg === "sacrifice")?.options;
    // Only MY units are sacrifice candidates — and of those only Victim: killing Cheap (1 energy, no
    // Power) would cap the resurrection below every unit in the trash (357.3, see the last test).
    expect(sac).toEqual(["victim"]);
    await game.p1.play("hr", { sacrifice: "victim", targets: "two" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("victim")).toBe("trash"); // paid as a cost, already gone while hr sits on the chain
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hr", controller: P1, triggered: false })]);
    await game.settle({ policy: "first" });
    expect(game.zoneOf("hr")).toBe("trash");
    expect(game.zoneOf("cheap")).toBe("base");
  });

  test("unaffordable: 1 energy + chaos, or 2 energy without a chaos power → not playable", async () => {
    const lowEnergy = await board().resources(P1, { energy: 1, power: { chaos: 1 } }).build();
    expect(lowEnergy.p1.can("cast", "hr")).toBe(false);
    const wrongPower = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .unit(P1, "base", TWO, "victim")
      .trash(P1, TWO, "two")
      .hand(P1, CARD, "hr")
      .build();
    expect(wrongPower.p1.can("cast", "hr")).toBe(false);
  });

  test("the additional cost is mandatory: with no friendly unit on the board the spell cannot be played (356.2.a.1)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .unit(P2, "base", TWO, "enemy")
      .trash(P1, TWO, "two")
      .hand(P1, CARD, "hr")
      .build();
    expect(game.p1.can("cast", "hr")).toBe(false);
    const r = await game.p1.try((p) => p.play("hr", { sacrifice: "enemy" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("enemy")).toBe("base");
  });

  test("no unit in your trash → no legal target → cannot be played, so nothing gets sacrificed for nothing (355.8)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
      .trash(P2, TWO, "theirs") // the opponent's trash does not count
      .hand(P1, CARD, "hr")
      .build();
    expect(game.p1.can("cast", "hr")).toBe(false);
    expect(game.zoneOf("sentry")).toBe("base");
  });

  test("the cost kill is a real death: sacrificing Watchful Sentry puts its Deathknell on the chain above the spell and draws 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
      .trash(P1, TWO, "two")
      .hand(P1, CARD, "hr")
      .build();
    const hand0 = game.p1.hand().length; // includes hr
    await game.p1.play("hr", { sacrifice: "sentry" });
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["hr", "sentry"]); // Deathknell added after (resolves first)
    await game.settle({ policy: "first" });
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
  });

  test("Reaction timing: NOT playable in the opponent's open main phase, but playable in response to their spell — sacrificing its target leaves Final Spark nothing to hit", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 8 })
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
      .unit(P1, "base", { energyCost: 4, might: 4, name: "Keeper" }, "keeper")
      .trash(P1, TWO, "two")
      .hand(P2, FINAL_SPARK, "spark")
      .hand(P1, CARD, "hr")
      .build();
    expect(game.p1.can("cast", "hr")).toBe(false); // Open State on P2's turn: no permission (813.1.c.1)
    await game.p2.cast("spark", { targets: "sentry" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "hr")).toBe(true); // Closed State: Reaction permission
    await game.p1.play("hr", { sacrifice: "sentry" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["spark", "hr", "sentry"]);
    expect(game.zoneOf("sentry")).toBe("trash");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("spark")).toBe("trash");
    expect(game.p2.energy()).toBe(0); // they paid 8 for nothing
    expect(game.state("keeper").damage).toBe(0); // the spark did not retarget
    expect(game.zoneOf("keeper")).toBe("base");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("resolves by playing the chosen eligible unit from your trash to your base, ignoring its cost (356.1.b.1)", async () => {
    // After killing Victim (3 + chaos), Two Drop — named as the spell was played (355.5) — enters the base
    // (exhausted, a normal play) and the pool stays at 0/0: nothing beyond 2 + [chaos] was paid.
    const game = await board().build();
    await game.p1.play("hr", { sacrifice: "victim", targets: "two" });
    await game.settle();
    expect(game.zoneOf("two")).toBe("base");
    expect(game.state("two").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("five")).toBe("trash");
    expect(game.zoneOf("hr")).toBe("trash");
  });

  test("eligibility — killing a 3-energy/1-power unit offers exactly the ≤3-energy AND ≤1-power units in MY trash (not Five, not the 2-power card, not P2's, not the sacrificed unit)", async () => {
    // Offered set: threep (3,[chaos]) and two (2,[]). Excluded: five (5 energy > 3), twopp (2 power > 1),
    // theirs (opponent's trash), victim (chosen as the cost AFTER targets are locked — 355.5 before 357).
    // rule 355.5 / 355.10.a: the trash is public, so the choice is made as the spell is PLAYED.
    const game = await board().build();
    const offered = game.p1.option("cast", "hr")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect([...new Set(offered.flat() as string[])].sort()).toEqual(["threep", "two"]);
    await expect(game.p1.play("hr", { sacrifice: "victim", targets: "five" })).rejects.toThrow();
    expect(game.zoneOf("hr")).toBe("hand");
  });

  test("'no more Power' is its own cap — killing a 1-energy/0-power unit with only a 2-power 2-drop and a 5-drop in trash leaves no legal play, so the spell is not castable off that sacrifice (357.3)", async () => {
    // Expected: Cheap (1 energy, 0 power) can only resurrect ≤1-energy/0-power units; none exist, and Victim is
    // the only sacrifice that enables a target → the sacrifice menu offers Victim alone (355.16 / 357.3).
    // Actual: any unit in the trash makes every friendly unit a legal sacrifice.
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .unit(P1, "base", { ...THREE_P, name: "Victim" }, "victim")
      .unit(P1, "base", { energyCost: 1, might: 1, name: "Cheap" }, "cheap")
      .trash(P1, FIVE, "five")
      .trash(P1, TWO_PP, "twopp")
      .trash(P1, TWO, "two")
      .hand(P1, CARD, "hr")
      .build();
    const sac = game.p1.option("cast", "hr")?.fields.find((f) => f.arg === "sacrifice")?.options;
    expect(sac).toEqual(["victim"]);
  });
});
