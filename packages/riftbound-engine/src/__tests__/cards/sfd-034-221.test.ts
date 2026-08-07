/**
 * Feral Strength — sfd-034-221 · Spell · Calm · 2 energy (no power)
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   [Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)
 *   Give a unit +2 [Might] this turn.
 *
 * Rules: 813 (Reaction: playable in Closed states on any player's turn; inherits Action's showdown
 * permission), 820 (Repeat: optional additional cost paid while playing; instructions execute one
 * extra time; 820.1.c.3 each instance payable once; 820.2.a the extra execution may choose a
 * different target; 820.3.a still ONE spell on the chain), 355.8 (a target must exist to play),
 * 317.2.b/c (Expiration Step: units heal BEFORE "this turn" effects expire — simultaneously),
 * 206 (printed cost is what other effects see).
 *
 * Head-judge corner cases considered:
 *   - Reaction in an opponent's chain: P2's Hextech Ray (deal 3) at my 3-Might unit; Feral
 *     Strength resolves first (LIFO) so the unit is 5 Might when the 3 damage lands → survives;
 *     and it must ALSO survive the end of turn (heal precedes expiry).
 *   - Repeat paid on the same unit: +4 total, exactly one chain item, 4 energy charged.
 *   - Repeat with two different units (820.2.a): +2 each — the engine binds one target set.
 *   - repeat: 2 is never legal (one Repeat instance), and Repeat needs 4 energy total.
 *   - it is a Might modification, not a buff (isBuffed stays false); it may target ENEMY units.
 *   - no unit anywhere → not castable (355.8); expiry across advanceTurn; showdown use as the
 *     defending player flips a losing combat.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-034-221";
const HEXTECH_RAY = "ogn-009-298"; // [Action] 1 energy + [fury]: Deal 3 to a unit at a battlefield

function board(energy = 2) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 1, name: "Other" }, "other")
    .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
    .hand(P1, CARD, "fs");
}

describe("Feral Strength (sfd-034-221)", () => {
  test("costs 2 energy; gives the chosen unit +2 Might this turn (a modifier, not a buff); goes to trash", async () => {
    const game = await board(2).build();
    await game.p1.cast("fs", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("fs")).toBe("chain");
    await game.settle();
    expect(game.state("ally").might).toBe(4);
    expect(game.state("ally").baseMight).toBe(2);
    expect(game.state("ally").isBuffed).toBe(false);
    expect(game.state("other").might).toBe(1);
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("'a unit': friendly AND enemy units are legal targets; an enemy can be pumped", async () => {
    const game = await board(2).build();
    const targets = game.p1.option("cast", "fs")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["ally"], ["other"], ["foe"]]));
    await game.p1.cast("fs", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(6);
  });

  test("unaffordable with 1 energy; not castable at all with no unit on the board (rule 355.8)", async () => {
    const poor = await board(1).build();
    expect(poor.p1.can("cast", "fs")).toBe(false);
    const empty = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "fs").build();
    expect(empty.p1.can("cast", "fs")).toBe(false);
  });

  test("'this turn': the +2 is gone after the turn ends", async () => {
    const game = await board(2).build();
    await game.p1.cast("fs", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2);
    expect(game.state("ally").mightModifier).toBe(0);
  });

  test("[Repeat] [2]: paying 4 total executes the effect twice on the same unit (+4), still one chain item (820.3.a)", async () => {
    const game = await board(4).build();
    const repeatField = game.p1.option("cast", "fs")?.fields.find((f) => f.arg === "repeat");
    expect(repeatField?.max).toBe(1);
    await game.p1.cast("fs", { repeat: 1, targets: "ally" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "fs", controller: P1, triggered: false });
    await game.settle();
    expect(game.state("ally").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2); // both executions expire together
  });

  test("[Repeat] is optional and needs 4 energy in total; a second Repeat instance is never offered (820.1.c.3)", async () => {
    const three = await board(3).build();
    expect(three.p1.option("cast", "fs")?.fields.some((f) => f.arg === "repeat")).toBe(false);
    const r = await three.p1.try((p) => p.cast("fs", { repeat: 1, targets: "ally" }));
    expect(r.ok).toBe(false);
    expect(three.zoneOf("fs")).toBe("hand");
    await three.p1.cast("fs", { targets: "ally" });
    expect(three.p1.energy()).toBe(1);
    const rich = await board(8).build();
    const twice = await rich.p1.try((p) => p.cast("fs", { repeat: 2, targets: "ally" }));
    expect(twice.ok).toBe(false);
    expect(rich.zoneOf("fs")).toBe("hand");
  });

  test("[Repeat] may choose a DIFFERENT unit for the extra execution (820.2.a) — +2 to each of two units", async () => {
    // Expected: with Repeat paid the caster makes two independent target choices, e.g. ally and
    // other, each getting +2. Actual: the engine enumerates a single target set for the repeated
    // spell, so a two-unit cast is rejected as ILLEGAL_ARGS.
    const game = await board(4).build();
    await game.p1.cast("fs", { repeat: 1, targets: ["ally", "other"] });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("ally").might).toBe(4);
    expect(game.state("other").might).toBe(3);
  });

  test("[Reaction] on the opponent's turn: answers P2's Hextech Ray; resolves first (LIFO) so the 3-Might unit is 5 Might when 3 damage lands and survives", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .hand(P2, HEXTECH_RAY, "ray")
      .hand(P1, CARD, "fs")
      .build();
    // 316.5.b: in P2's Neutral Open state only the turn player may act — Reaction needs a chain/showdown.
    expect(game.p1.can("cast", "fs")).toBe(false);
    await game.p2.cast("ray", { targets: "holder" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.actingSeat()).toBe(P1);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    await game.p1.cast("fs", { targets: "holder" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "fs"]);
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.state("holder").might).toBe(5);
    expect(game.state("holder").damage).toBe(3);
    // Expiration Step: heal (317.2.b) precedes 'this turn' expiry (317.2.c) → still alive next turn.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.state("holder").might).toBe(3);
  });

  test("after the Expiration Step the surviving unit reads damage 0 (317.2.b)", async () => {
    // Expected: heal-all at end of turn clears every damage record, so next turn Holder is an
    // undamaged 3-Might unit. Actual: meta.damage is reset but the mirrored __counters.damage
    // stays 3, so the unit still reports 3 damage (and would accumulate on the next hit).
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .hand(P2, HEXTECH_RAY, "ray")
      .hand(P1, CARD, "fs")
      .build();
    await game.p2.cast("ray", { targets: "holder" });
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    await game.p1.cast("fs", { targets: "holder" });
    await game.settle();
    expect(game.state("holder").damage).toBe(3);
    await game.advanceTurn();
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.state("holder").damage).toBe(0);
  });

  test("negative space: without the Reaction the same Hextech Ray kills the 3-Might unit", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    await game.p2.cast("ray", { targets: "holder" });
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
  });

  test("in a showdown as the defending player: +2 on the 3-Might defender makes the 4-Might attacker lose", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Defender" }, "def")
      .unit(P2, "base", { might: 4, name: "Attacker" }, "atk")
      .hand(P1, CARD, "fs")
      .build();
    await game.p2.move("atk", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("fs", { targets: "def" });
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash"); // 5 ≥ 4 kills the attacker
    expect(game.zoneOf("def")).toBe("battlefield-bf1"); // 4 damage < 5 Might
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("parsed abilities: one reaction-timed spell ability with Repeat [2] and a +2 might-this-turn effect on a unit", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "calm", energyCost: 2, timing: "reaction" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      repeat: { energy: 2 },
      timing: "reaction",
      type: "spell",
    });
  });
});
