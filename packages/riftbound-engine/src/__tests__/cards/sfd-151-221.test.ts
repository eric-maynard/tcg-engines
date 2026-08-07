/**
 * Bonds of Strength — sfd-151-221 · Spell · Order · 2 energy (no power) · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   [Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)
 *   Give two friendly units each +1 [Might] this turn.
 *
 * Rules: 813 (Reaction timing — Closed states / showdowns on anyone's turn, but NOT the opponent's
 * Neutral Open state); 355.8 (two distinct FRIENDLY units are targets chosen at play time; enemies
 * never qualify); 359.3.e.8 (if one of several targets becomes unavailable the instruction still
 * runs on the rest); 317.2 ("this turn" expires in the Expiration Step); 820 (Repeat [2]: optional
 * additional cost, 4 total, one chain item, effect executed twice; 820.2.a the second execution
 * may pick a different pair); 626 (combat sums Might per side — two pumped defenders matter).
 *
 * Head-judge corner cases covered below:
 *   1. Target menu = unordered pairs of MY units only (3 friendlies → 3 pairs); a pair containing an
 *      enemy, or a single unit, is refused.
 *   2. It is a Might modification, not a buff: isBuffed stays false and it stacks with a real buff.
 *   3. One of the two targets is killed in response → the survivor still gets +1.
 *   4. Repeat on the same pair → +2 each, exactly one chain item, 4 energy; repeat needs 4 (3 → refused,
 *      nothing spent); repeat:2 never legal.
 *   5. Repeat naming a different second pair (820.2.a).
 *   6. Defender's Reaction inside the opponent's combat showdown: 2+2 defenders vs a 5 attacker lose
 *      without it, win (6 ≥ 5) with it; and the +1s are gone next turn.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-151-221";
const KILL_SHOT = {
  abilities: [{ effect: { amount: 9, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Kill Shot",
  timing: "reaction",
};

function board(energy = 2) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 1, name: "Ann" }, "a")
    .unit(P1, "bf1", { might: 2, name: "Bo" }, "b")
    .unit(P1, "base", { might: 3, name: "Cy" }, "c")
    .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
    .hand(P1, CARD, "bonds");
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;
const pairs = (game: Built) =>
  ((game.p1.option("cast", "bonds")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][]).map((p) => [...p].sort().join("+"));

describe("Bonds of Strength (sfd-151-221)", () => {
  test("costs exactly 2 energy; both chosen friendly units get +1 Might (base or battlefield), the third and the enemy do not; spell → trash", async () => {
    const game = await board().build();
    await game.p1.cast("bonds", { targets: ["a", "b"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bonds", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.state("a")).toMatchObject({ baseMight: 1, might: 2 });
    expect(game.state("b")).toMatchObject({ baseMight: 2, might: 3 });
    expect(game.state("c").might).toBe(3);
    expect(game.state("foe").might).toBe(4);
    expect(game.zoneOf("bonds")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("targets are unordered PAIRS of friendly units: {a,b},{a,c},{b,c}; an enemy in the pair or a lone unit is refused and nothing is spent", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "bonds")?.fields.find((f) => f.arg === "targets");
    expect(field?.max).toBe(2);
    expect(new Set(pairs(game))).toEqual(new Set(["a+b", "a+c", "b+c"]));
    const withFoe = await game.p1.try((p) => p.cast("bonds", { targets: ["a", "foe"] }));
    expect(withFoe.ok).toBe(false);
    const single = await game.p1.try((p) => p.cast("bonds", { targets: "a" }));
    expect(single.ok).toBe(false);
    expect(game.zoneOf("bonds")).toBe("hand");
    expect(game.p1.energy()).toBe(2);
  });

  test("unaffordable with 1 energy; not castable with no friendly unit on the board (355.8)", async () => {
    expect((await board(1).build()).p1.can("cast", "bonds")).toBe(false);
    const none = await scenario().resources(P1, { energy: 4 }).unit(P2, "base", { might: 2 }, "x").unit(P2, "base", { might: 2 }, "y").hand(P1, CARD, "bonds").build();
    expect(none.p1.can("cast", "bonds")).toBe(false);
  });

  test("a Might modification, not a buff: isBuffed stays false, and it stacks on top of an existing buff (4 buffed → 5 → 6)", async () => {
    const game = await board().unit(P1, "base", { might: 4, name: "Buffed" }, "buffed", { buffed: true }).build();
    expect(game.state("buffed").might).toBe(5);
    await game.p1.cast("bonds", { targets: ["buffed", "a"] });
    await game.settle();
    expect(game.state("buffed")).toMatchObject({ isBuffed: true, might: 6 });
    expect(game.state("a")).toMatchObject({ isBuffed: false, might: 2 });
  });

  test("'this turn': both +1s expire at end of turn (317.2)", async () => {
    const game = await board().build();
    await game.p1.cast("bonds", { targets: ["a", "c"] });
    await game.settle();
    expect(game.state("c").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("a").might).toBe(1);
    expect(game.state("c").might).toBe(3);
    expect(game.state("c").mightModifier).toBe(0);
  });

  test("one target killed in response (359.3.e.8): P2's Kill Shot removes Ann first (LIFO); Cy still gets +1", async () => {
    const game = await board().hand(P2, KILL_SHOT, "shot").build();
    await game.p1.cast("bonds", { targets: ["a", "c"] });
    await game.p1.passPriority();
    await game.p2.cast("shot", { targets: "a" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["bonds", "shot"]);
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.state("c").might).toBe(4);
    expect(game.zoneOf("bonds")).toBe("trash");
  });

  test("[Repeat] [2] on the SAME pair: 4 energy total, one chain item (820.3.a), each unit +2; all of it expires together", async () => {
    const game = await board(4).build();
    expect(game.p1.option("cast", "bonds")?.fields.find((f) => f.arg === "repeat")?.max).toBe(1);
    await game.p1.cast("bonds", { repeat: 1, targets: ["a", "b"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.state("a").might).toBe(3);
    expect(game.state("b").might).toBe(4);
    expect(game.state("c").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("a").might).toBe(1);
    expect(game.state("b").might).toBe(2);
  });

  test("[Repeat] is optional and needs 4: with 3 energy the repeat variant is refused (nothing spent) and the plain cast still works; repeat:2 is never legal (820.1.c.3)", async () => {
    const three = await board(3).build();
    const r = await three.p1.try((p) => p.cast("bonds", { repeat: 1, targets: ["a", "b"] }));
    expect(r.ok).toBe(false);
    expect(three.p1.energy()).toBe(3);
    await three.p1.cast("bonds", { targets: ["a", "b"] });
    expect(three.p1.energy()).toBe(1);
    const rich = await board(9).build();
    expect((await rich.p1.try((p) => p.cast("bonds", { repeat: 2, targets: ["a", "b"] }))).ok).toBe(false);
    expect(rich.zoneOf("bonds")).toBe("hand");
  });

  // BUG — expected (820.2.a): the extra execution makes its own choices, so the caster may name pair
  // {a,b} for the first execution and {b,c} for the second (a +1, b +2, c +1). Actual: only one
  // pair can be bound to the repeated cast — a four-slot target list is rejected as ILLEGAL_ARGS.
  test("Repeat allows a DIFFERENT pair for the second execution (820.2.a); engine binds a single pair", async () => {
    const game = await board(4).build();
    await game.p1.cast("bonds", { repeat: 1, targets: ["a", "b", "b", "c"] });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("a").might).toBe(2);
    expect(game.state("b").might).toBe(4);
    expect(game.state("c").might).toBe(4);
  });

  test("[Reaction] timing: NOT in the opponent's Neutral Open state; legal onto their chain, resolving first (LIFO)", async () => {
    const game = await board().active(P2).resources(P2, { energy: 0 }).hand(P2, KILL_SHOT, "shot").build();
    expect(game.p1.can("cast", "bonds")).toBe(false);
    await game.p2.cast("shot", { targets: "foe" }); // P2 opens a chain (aimed at their own unit — irrelevant)
    await game.p2.passPriority();
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.can("cast", "bonds")).toBe(true);
    await game.p1.cast("bonds", { targets: ["b", "c"] });
    expect(game.chain().map((i) => i.cardId)).toEqual(["shot", "bonds"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().map((i) => i.cardId)).toEqual(["shot"]);
    expect(game.state("b").might).toBe(3);
    expect(game.state("c").might).toBe(4);
  });

  test("defender's Reaction in the opponent's combat: 2+2 defenders each +1 (= 6) kill the 5-Might attacker and keep the battlefield; without it they lose", async () => {
    const mk = () =>
      scenario()
        .active(P2)
        .resources(P1, { energy: 2 })
        .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", { might: 2, name: "Left" }, "left")
        .unit(P1, "bf1", { might: 2, name: "Right" }, "right")
        .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
        .hand(P1, CARD, "bonds");
    // Negative space first: no reaction → 5 damage kills both 2s (attacker assigns), defenders deal 4 < 5.
    const plain = await mk().build();
    await plain.p2.move("raider", "bf1");
    await plain.settle();
    expect(plain.zoneOf("left")).toBe("trash");
    expect(plain.zoneOf("right")).toBe("trash");
    expect(plain.locationOf("raider")).toBe("bf1");
    expect(plain.gameState.battlefields.bf1?.controller).toBe(P2);
    // With Bonds of Strength once Focus passes to the defender.
    const game = await mk().build();
    await game.p2.move("raider", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "bonds")).toBe(false); // attacker holds Focus first
    await game.p2.passFocus();
    expect(game.p1.can("cast", "bonds")).toBe(true);
    await game.p1.cast("bonds", { targets: ["left", "right"] });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 3 + 3 = 6 ≥ 5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // 5 damage from the attacker can kill at most one 3-Might defender (3 lethal + 2 short).
    const survivors = ["left", "right"].filter((u) => game.zoneOf(u) === "battlefield-bf1");
    expect(survivors.length).toBeGreaterThanOrEqual(1);
    await game.advanceTurn(); // P2 ends → P1's turn: the +1 is gone on whoever survived
    for (const u of survivors) {
      expect(game.state(u).might).toBe(2);
    }
  });

  test("parsed abilities: one reaction-timed spell ability — +1 might this turn to TWO friendly units, Repeat [2]; card cost 2, no power", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "order", energyCost: 2, name: "Bonds of Strength", timing: "reaction" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: 1, duration: "turn", target: { controller: "friendly", quantity: 2, type: "unit" }, type: "modify-might" },
      repeat: { energy: 2 },
      timing: "reaction",
      type: "spell",
    });
  });
});
