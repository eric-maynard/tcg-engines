/**
 * Ki Barrier — ven-126-166 · Spell · Order · 2 energy + [order] · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Choose a unit. Prevent the next 7 damage that would be dealt to it this turn.
 *   (Opponents can assign it extra combat damage to kill it.)
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. Prevent Value is a NUMBER (437.1.b.1.a), not "All": 8 in one packet → 1 lands; 3 then 3 → both
 *     fully prevented with 1 left over (437.3.b); exactly 7 → 0 and the shield is spent (437.3.a).
 *  2. ANY damage counts — spell, ability or combat. 437.5.a: in combat the opponent may (and to kill it,
 *     must) assign Might+7; a 5-Might attacker into a shielded 3-Might defender deals nothing and bounces,
 *     a 10-Might attacker kills it.
 *  3. 437.4 — fully prevented damage "was not dealt at all": Disintegrate's "if this kills it, draw 1"
 *     and any "when I'm dealt damage" hooks get nothing.
 *  4. [Reaction] timing (813): legal on the opponent's turn only once you hold priority (their spell on
 *     the chain, they passed) or Focus; LIFO means the shield is up before their spell resolves.
 *  5. "this turn": an unused / partly used shield expires in the Expiration Step; next turn's damage lands.
 *  6. "Choose a unit" — either side's; with no unit anywhere the spell has no target and cannot be cast.
 *     Cost 2 + [order]: calm/body power does not pay a mono-Order pip.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-126-166";
const FINAL_SPARK = "ogs-022-024"; // 8: Deal 8 to a unit.
const HEXTECH_RAY = "ogn-009-298"; // 1: Deal 3 to a unit at a battlefield.
const DISINTEGRATE = "ogn-005-298"; // 4: Deal 3 to a unit at a battlefield. If this kills it, draw 1.

/** P2's turn with plenty of energy and burn in hand; P1 holds Ki Barrier (2 + order) and a 3-Might Guard at bf1. */
function oppTurn() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 20 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P1, CARD, "kb");
}

/** P1's own turn: cast Ki Barrier on `guard` up front and settle. */
async function shieldedOnOwnTurn(extra?: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) {
  let b = scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 20 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P1, CARD, "kb");
  if (extra) b = extra(b);
  const game = await b.build();
  await game.p1.cast("kb", { targets: "guard" });
  await game.settle();
  return game;
}

describe("Ki Barrier (ven-126-166)", () => {
  test("card data: 2-cost Order Reaction spell with one [order] pip", async () => {
    const game = await scenario().hand(P1, CARD, "kb").build();
    expect(game.state("kb")).toMatchObject({ cardType: "spell", energyCost: 2, name: "Ki Barrier" });
    expect(game.state("kb").powerCost).toEqual(["order"]);
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def?.timing).toBe("reaction");
    const spell = ((def?.abilities ?? []) as Record<string, unknown>[]).find((a) => a.type === "spell");
    expect(spell).toMatchObject({ effect: { duration: "turn", type: "prevent-damage" }, timing: "reaction", type: "spell" });
  });

  test("parsed prevent-damage effect drops both the chosen-unit target and the Prevent Value 7", async () => {
    // Expected: effect { type: prevent-damage, amount: 7, duration: turn, target: { type: unit } }.
    // Actual: { type: prevent-damage, duration: turn } — no amount, no target (so it shields nothing).
    const def = (await loadDefaultCardPool()).get(CARD);
    const spell = ((def?.abilities ?? []) as { type: string; effect?: unknown }[]).find((a) => a.type === "spell");
    expect(spell?.effect).toMatchObject({ amount: 7, duration: "turn", target: { type: "unit" }, type: "prevent-damage" });
  });

  test("cost + timing on your own turn: castable in an open main phase for exactly 2 energy + 1 order; calm power or 1 energy cannot pay", async () => {
    const ok = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).unit(P1, "base", { might: 2 }, "u").hand(P1, CARD, "kb").build();
    expect(ok.p1.can("cast", "kb")).toBe(true);
    // targeted form once "Choose a unit" is parsed; untargeted form is what the engine offers today
    if (!(await ok.p1.try((p) => p.cast("kb", { targets: "u" }))).ok) {
      await ok.p1.cast("kb");
    }
    expect(ok.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(ok.chain()).toEqual([expect.objectContaining({ cardId: "kb", controller: P1, triggered: false })]);
    await ok.settle();
    expect(ok.zoneOf("kb")).toBe("trash");
    const calm = await scenario().resources(P1, { energy: 2, power: { calm: 1 } }).unit(P1, "base", { might: 2 }, "u").hand(P1, CARD, "kb").build();
    expect(calm.p1.can("cast", "kb")).toBe(false);
    const short = await scenario().resources(P1, { energy: 1, power: { order: 1 } }).unit(P1, "base", { might: 2 }, "u").hand(P1, CARD, "kb").build();
    expect(short.p1.can("cast", "kb")).toBe(false);
  });

  test("[Reaction] window on the opponent's turn: not in their open main phase, yes once their Final Spark is on the chain and they pass priority", async () => {
    const game = await oppTurn().hand(P2, FINAL_SPARK, "spark").build();
    expect(game.p1.can("cast", "kb")).toBe(false);
    await game.p2.cast("spark", { targets: "guard" });
    expect(game.p1.can("cast", "kb")).toBe(false); // P2 still holds priority over its own spell
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "kb")).toBe(true);
  });

  test("'Choose a unit' — the cast must take a unit target (either side's) and is not castable with no unit on the board", async () => {
    // Expected: targets field offering guard + the enemy unit; empty board → can("cast") false.
    // Actual: no targets field at all; the spell is castable onto nothing.
    const game = await oppTurn().active(P1).unit(P2, "base", { might: 2, name: "Theirs" }, "theirs").build();
    const targets = game.p1.option("cast", "kb")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["guard"], ["theirs"]]));
    const empty = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).hand(P1, CARD, "kb").build();
    expect(empty.p1.can("cast", "kb")).toBe(false);
  });

  test("in response to Final Spark (8) on a 3-Might unit — LIFO puts the shield up first, 7 is prevented, exactly 1 lands and the unit lives", async () => {
    // Expected: guard.damage == 1, still at bf1, both spells in trash. Actual: no shield → guard dies.
    const game = await oppTurn().hand(P2, FINAL_SPARK, "spark").build();
    await game.p2.cast("spark", { targets: "guard" });
    await game.p2.passPriority();
    await game.p1.cast("kb", { targets: "guard" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["spark", "kb"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(1);
    expect(game.zoneOf("kb")).toBe("trash");
    expect(game.zoneOf("spark")).toBe("trash");
  });

  test("the Prevent Value is tracked down (437.3): Hextech Ray 3 → 0 dealt (4 left), a second Ray 3 → 0 dealt (1 left), a third Ray → 2 lands", async () => {
    const game = await shieldedOnOwnTurn((b) => b.resources(P1, { energy: 5, power: { fury: 3, order: 1 } }).hand(P1, HEXTECH_RAY, "ray1").hand(P1, HEXTECH_RAY, "ray2").hand(P1, HEXTECH_RAY, "ray3"));
    await game.p1.cast("ray1", { targets: "guard" });
    await game.settle();
    expect(game.state("guard").damage).toBe(0);
    await game.p1.cast("ray2", { targets: "guard" });
    await game.settle();
    expect(game.state("guard").damage).toBe(0);
    await game.p1.cast("ray3", { targets: "guard" });
    await game.settle();
    expect(game.state("guard").damage).toBe(2);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
  });

  test("437.4 — a fully prevented Disintegrate (3 of the 7) 'was not dealt': the unit is unhurt and P2 draws nothing", async () => {
    const game = await oppTurn().hand(P2, DISINTEGRATE, "dis").build();
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("dis", { targets: "guard" });
    await game.p2.passPriority();
    await game.p1.cast("kb", { targets: "guard" });
    await game.settle();
    expect(game.state("guard").damage).toBe(0);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1);
  });

  test("combat (437.5.a) — a shielded 3-Might defender vs a 5-Might attacker: 5 − 7 → nothing dealt, defender survives and kills nobody… attacker (takes 3 < 5) is recalled, bf1 stays P1's", async () => {
    // "this turn" (517.2.b) — the shield must go up on the defending turn, as a [Reaction] once P2 passes Focus.
    const game = await oppTurn().unit(P2, "base", { might: 5, name: "Raider" }, "raider").build();
    await game.p2.move("raider", "bf1");
    await game.p2.do("passShowdownFocus", {});
    await game.p1.cast("kb", { targets: "guard" });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(0);
    expect(game.locationOf("raider")).toBe("base"); // 466.1.a.2: attackers recalled while a defender remains
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("negative space: the same 5-into-3 attack with NO Ki Barrier kills the Guard and P2 conquers", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("'extra combat damage to kill it' — a 10-Might attacker assigning all 10 to the shielded 3-Might Guard deals 3 after prevention and kills it", async () => {
    const game = await oppTurn().unit(P2, "base", { might: 10, name: "Colossus" }, "colossus").build();
    await game.p2.move("colossus", "bf1");
    await game.p2.do("passShowdownFocus", {});
    await game.p1.cast("kb", { targets: "guard" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("colossus")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("'this turn' — an unused shield expires at end of turn; next turn P2's Hextech Ray deals its full 3 and kills the 3-Might Guard", async () => {
    // Expected: the numeric shield is cleared in the Expiration Step (517.2.b). (Today the shield is
    // never even installed; once it is, damagePreventionShield also has no end-of-turn cleanup.)
    const game = await shieldedOnOwnTurn((b) => b.hand(P2, HEXTECH_RAY, "ray"));
    expect(game.state("guard").meta.damagePreventionShield).toBe(7);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 1, power: { fury: 1 } }); // rune pools emptied over the turn boundary
    await game.p2.cast("ray", { targets: "guard" });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
  });

  test("an ENEMY unit is a legal choice — shielding P2's 2-Might unit makes P1's own Hextech Ray bounce off it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1, order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Theirs" }, "theirs")
      .hand(P1, CARD, "kb")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p1.cast("kb", { targets: "theirs" });
    await game.settle();
    await game.p1.cast("ray", { targets: "theirs" });
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("battlefield-bf1");
    expect(game.state("theirs").damage).toBe(0);
  });
});
