/**
 * Moonlight Affliction — unl-066-219 · Spell · Mind · 7 energy
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Give a unit -10 [Might] this turn.
 *
 * Head-judge checklist (trickiest situations for this card):
 *  1. -10 on a 5-Might unit makes its Might NEGATIVE (-5): treated as 0 when referenced and when
 *     dealing combat damage (143.2.b) — but an undamaged 0-Might unit does NOT die (142.4.b:
 *     lethal damage must be non-zero). One point of pre-existing damage, however, is now lethal.
 *  2. 143.2.b.1 — the real value is kept: a later +2 this turn lands on -5 → -3 (still 0), it
 *     must not "start from 0" and become 2.
 *  3. Reaction timing: playable in the Closed state on the opponent's turn in response to their
 *     spell and resolves FIRST (LIFO) — a damaged target dies before the buff under it resolves;
 *     NOT playable in the opponent's Neutral Open state (no priority), and inside a showdown only
 *     once this player holds Focus/priority.
 *  4. Combat: cast on the attacker during the showdown → it contributes 0 damage and any defender
 *     with ≥1 Might kills it; the battlefield does not change hands.
 *  5. "this turn" — the penalty ends with the turn (advanceTurn), including on an enemy unit.
 *  6. Cost 7 flat energy, any unit anywhere (friend/foe, base/battlefield) is a legal target.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-066-219";
const DISCIPLINE = "ogn-058-298"; // 2 energy Calm Reaction: Give a unit +2 Might this turn. Draw 1.

describe("Moonlight Affliction (unl-066-219)", () => {
  test("parsed ability: a Reaction spell whose only effect is modify-might -10 (turn) on a unit", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 7, timing: "reaction" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: -10, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "reaction",
      type: "spell",
    });
  });

  test("costs 7 energy; a 5-Might undamaged unit drops to 0 effective Might (real value -5) and does NOT die; spell → trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7 })
      .unit(P2, "base", { might: 5, name: "Victim" }, "victim")
      .hand(P1, CARD, "moon")
      .build();
    await game.p1.cast("moon", { targets: "victim" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("moon")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim").might).toBe(0);
    expect(game.state("victim").mightModifier).toBe(-10);
    expect(game.state("victim").damage).toBe(0);
    const poor = await scenario().resources(P1, { energy: 6 }).unit(P2, "base", { might: 5 }, "v").hand(P1, CARD, "moon").build();
    expect(poor.p1.can("cast", "moon")).toBe(false);
  });

  test("on a 12-Might unit it simply leaves 2 Might; any unit (own, enemy, base, battlefield) is a legal target", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 12, name: "Colossus" }, "colossus")
      .unit(P2, "base", { might: 3 }, "homeFoe")
      .unit(P1, "base", { might: 2 }, "mine")
      .hand(P1, CARD, "moon")
      .build();
    const targets = game.p1.option("cast", "moon")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["colossus"], ["homeFoe"], ["mine"]]));
    await game.p1.cast("moon", { targets: "colossus" });
    await game.settle();
    expect(game.state("colossus").might).toBe(2);
  });

  test("a unit already carrying 1 damage is killed once its Might falls to ≤ 0 (143.2.a: non-zero damage ≥ Might)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Scratched" }, "scratched", { damage: 1 })
      .hand(P1, CARD, "moon")
      .build();
    await game.p1.cast("moon", { targets: "scratched" });
    await game.settle();
    expect(game.zoneOf("scratched")).toBe("trash");
  });

  test("143.2.b.1 — the negative value is real: -10 then +2 this turn on a 5-Might unit is still 0 effective (modifier -8), not 2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9 })
      .unit(P1, "base", { might: 5, name: "Ally" }, "ally")
      .hand(P1, CARD, "moon")
      .hand(P1, DISCIPLINE, "disc")
      .build();
    await game.p1.cast("moon", { targets: "ally" });
    await game.settle();
    await game.p1.cast("disc", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").mightModifier).toBe(-8);
    expect(game.state("ally").might).toBe(0);
    expect(game.zoneOf("ally")).toBe("base");
  });

  test("'this turn': the -10 wears off when the turn ends — an enemy unit is back to full Might on its owner's turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7 })
      .unit(P2, "base", { might: 5, name: "Victim" }, "victim")
      .hand(P1, CARD, "moon")
      .build();
    await game.p1.cast("moon", { targets: "victim" });
    await game.settle();
    expect(game.state("victim").might).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("victim").might).toBe(5);
    expect(game.state("victim").mightModifier).toBe(0);
    expect(game.zoneOf("victim")).toBe("base");
  });

  test("Reaction: NOT playable in the opponent's Neutral Open state (only the turn player has priority)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 7 })
      .unit(P2, "base", { might: 5 }, "victim")
      .hand(P1, CARD, "moon")
      .build();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("cast", "moon")).toBe(false);
    const r = await game.p1.try((p) => p.cast("moon", { targets: "victim" }));
    expect(r.ok).toBe(false);
  });

  test("Reaction on the opponent's turn: responds to their buff spell and resolves first — the damaged target dies under the still-pending buff", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 7 })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Bruiser" }, "bruiser", { damage: 1 })
      .hand(P2, DISCIPLINE, "disc")
      .hand(P1, CARD, "moon")
      .build();
    await game.p2.cast("disc", { targets: "bruiser" });
    expect(game.p1.can("cast", "moon")).toBe(false); // P2 (caster) still holds priority
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "moon")).toBe(true);
    await game.p1.cast("moon", { targets: "bruiser" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["disc", "moon"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Moonlight resolves: 4-10 → -6 with 1 damage → killed on cleanup
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.chain().map((i) => i.cardId)).toEqual(["disc"]);
    const p2Hand = game.p2.hand().length;
    await game.settle(); // Discipline resolves: its target is illegal (left the board) but "Draw 1" still happens (Void Seeker ruling)
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.p2.hand().length).toBe(p2Hand + 1);
    expect(game.violations()).toEqual([]);
  });

  test("in a combat showdown: cast on the 5-Might attacker once P1 has Focus → it deals 0, the 3-Might defender kills it and keeps the battlefield", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 7 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Defender" }, "def")
      .unit(P2, "base", { might: 5, name: "Attacker" }, "atk")
      .hand(P1, CARD, "moon")
      .build();
    await game.p2.move("atk", "bf1");
    expect(game.actingSeat()).toBe(P2); // attacker holds Focus first
    expect(game.p1.can("cast", "moon")).toBe(false);
    await game.p2.passFocus();
    expect(game.p1.can("cast", "moon")).toBe(true);
    await game.p1.cast("moon", { targets: "atk" });
    await game.settle(); // spell resolves, showdown closes, combat damage: 0 vs 3
    expect(game.zoneOf("moon")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.state("def").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("in combat on the DEFENDER: a 3-Might defender at -7 deals 0 and dies to the 2-Might attacker, who conquers", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Poker" }, "poker")
      .hand(P1, CARD, "moon")
      .build();
    await game.p1.move("poker", "bf1");
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("moon", { targets: "wall" });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("poker")).toBe("battlefield-bf1");
    expect(game.state("poker").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
