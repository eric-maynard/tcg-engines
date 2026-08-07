/**
 * Square Up — unl-017-219 · Spell · Fury · 4 energy (no power) · no timing keyword
 *
 *   [Repeat] — Discard 1 (You may pay the additional cost to repeat this spell's effect.)
 *   Give a unit [Assault 4] this turn. (+4 [Might] while it's an attacker.)
 *
 * Rules: no [Action]/[Reaction] → a plain spell: playable only in YOUR turn's Neutral Open state
 * (507–510) — never in a showdown (even holding Focus), never onto a chain, never on the opponent's
 * turn; 807 (Assault X = +X Might only WHILE the unit holds the Attacker designation; 807.2 multiple
 * grants SUM — Cleave's 3 + Square Up's 4 = Assault 7; a repeated Square Up = Assault 8); 626 (the
 * boosted attacker survives return damage below its boosted Might); 317.2 (this-turn grant expires);
 * 820 (Repeat — Discard 1: the additional cost is a DISCARD paid as the spell is played (820.1.d,
 * 355.1.a); unpayable with no other card in hand → the repeat option must not exist; paid → the
 * discarded card is in the trash before resolution; 820.2.a the second execution may pick another unit).
 *
 * Head-judge corner cases covered below:
 *   1. Any unit is a legal target (friendly or enemy); Might at rest is unchanged (Assault is dormant).
 *   2. Real combat: 1-Might unit with Assault 4 attacks a 4 → kills it, takes 4 < 5, survives, conquers.
 *      Negative space: the same unit DEFENDING gets nothing from Assault and dies to a 2.
 *   3. Stacking with Cleave (Assault 3 + 4 = 7).
 *   4. Timing negatives: showdown with Focus, open chain, opponent's turn — all illegal.
 *   5. Repeat's cost is a discard, not energy: still exactly 4 energy; needs a card to pitch.
 *   6. Cost: 4 energy; 3 → no; no unit on board → no (355.8).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-017-219";
const CLEAVE = "ogn-004-298"; // Action, 1: Give a unit [Assault 3] this turn.
const FODDER = "ogn-175-298"; // vanilla unit — discard fodder for the Repeat cost

function board(energy = 4) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 1, name: "Rookie" }, "rookie")
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .hand(P1, CARD, "sq");
}

describe("Square Up (unl-017-219)", () => {
  test("costs exactly 4 energy; either player's unit is a legal target; grants [Assault 4] (turn) and leaves resting Might unchanged; → trash", async () => {
    const game = await board().build();
    // Single-execution choices only (multi-slot entries belong to the Repeat variants).
    const targets = (game.p1.option("cast", "sq")?.fields.find((f) => f.arg === "targets")?.options as string[][]).filter((t) => t.length === 1);
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["rookie"], ["guard"]]));
    await game.p1.cast("sq", { targets: "rookie" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sq", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("sq")).toBe("trash");
    expect(game.state("rookie").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 4 }]);
    expect(game.state("rookie").keywords).toContain("Assault");
    expect(game.state("rookie").might).toBe(1); // 807.1.c — only while an attacker
    expect(game.state("guard").grantedKeywords).toEqual([]);
  });

  test("unaffordable with 3 energy; not castable with no unit anywhere (355.8)", async () => {
    expect((await board(3).build()).p1.can("cast", "sq")).toBe(false);
    const empty = await scenario().resources(P1, { energy: 9 }).hand(P1, CARD, "sq").build();
    expect(empty.p1.can("cast", "sq")).toBe(false);
  });

  test("in combat: the 1-Might Rookie attacks as 5 — kills the 4-Might Guard, takes 4 (< 5, not lethal), stays and conquers for a point", async () => {
    const game = await board().build();
    await game.p1.cast("sq", { targets: "rookie" });
    await game.settle();
    await game.p1.move("rookie", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("rookie")).toBe("bf1");
    expect(game.state("rookie").damage).toBe(0); // healed in the combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative space — Assault does nothing on DEFENSE: the same Assault-4 Rookie holding a battlefield dies to a 2-Might attacker and deals only 1", async () => {
    // Square Up itself cannot be cast on P2's turn, so model "already granted this turn" via meta.
    const sameTurn = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Rookie" }, "rookie", { grantedKeywords: [{ duration: "turn", keyword: "Assault", value: 4 }] })
      .unit(P2, "base", { might: 2, name: "Poker" }, "poker")
      .build();
    expect(sameTurn.state("rookie").keywords).toContain("Assault");
    await sameTurn.p2.move("poker", "bf1");
    await sameTurn.settle();
    expect(sameTurn.zoneOf("rookie")).toBe("trash"); // defended at 1
    expect(sameTurn.locationOf("poker")).toBe("bf1"); // took 1 < 2
    expect(sameTurn.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("'this turn': the granted Assault is gone after the turn ends (317.2)", async () => {
    const game = await board().build();
    await game.p1.cast("sq", { targets: "rookie" });
    await game.settle();
    expect(game.state("rookie").keywords).toContain("Assault");
    await game.advanceTurn();
    expect(game.state("rookie").grantedKeywords).toEqual([]);
    expect(game.state("rookie").keywords).not.toContain("Assault");
  });

  test("stacks with Cleave (807.2): Assault 3 + Assault 4 = 7 → the 1-Might Rookie attacks as 8, kills a 7-Might wall and survives (7 < 8)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 1, name: "Rookie" }, "rookie")
      .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
      .hand(P1, CLEAVE, "cleave")
      .hand(P1, CARD, "sq")
      .build();
    await game.p1.cast("sq", { targets: "rookie" });
    await game.settle();
    await game.p1.cast("cleave", { targets: "rookie" });
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    const granted = game.state("rookie").grantedKeywords.filter((k) => k.keyword === "Assault").map((k) => k.value);
    expect(granted.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)).toBe(7);
    await game.p1.move("rookie", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("rookie")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("timing (no [Action]/[Reaction]): NOT castable in a showdown even while holding Focus, NOT onto an open chain, NOT on the opponent's turn", async () => {
    // Showdown with Focus: P1 attacks with another unit; Cleave (Action) is legal there, Square Up is not.
    const game = await board(5).unit(P1, "base", { might: 2, name: "Scout" }, "scout").hand(P1, CLEAVE, "cleave").build();
    await game.p1.move("scout", "bf1");
    const sd = game.decision() as ActionDecision;
    expect(sd).toMatchObject({ context: "showdown", seat: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(true);
    expect(game.p1.can("cast", "sq")).toBe(false);
    // Open chain on my own turn: cast Cleave first (Neutral Open → Closed); Square Up cannot follow.
    const chain = await board(5).hand(P1, CLEAVE, "cleave").build();
    await chain.p1.cast("cleave", { targets: "rookie" });
    expect((chain.decision() as ActionDecision).context).toBe("chain");
    expect(chain.p1.can("cast", "sq")).toBe(false);
    await chain.settle();
    expect(chain.p1.can("cast", "sq")).toBe(true); // Neutral Open again, 4 energy left
    // Opponent's turn.
    const opp = await board().active(P2).build();
    expect(opp.p1.can("cast", "sq")).toBe(false);
    expect((await opp.p1.try((p) => p.cast("sq", { targets: "rookie" }))).ok).toBe(false);
  });

  test("[Repeat] with one card to pitch: the repeat variant exists, costs no extra ENERGY (4 total), stays ONE chain item, and the two executions sum to Assault 8 (807.2)", async () => {
    const game = await board(4).hand(P1, FODDER, "fodder").build();
    const repeat = game.p1.option("cast", "sq")?.fields.find((f) => f.arg === "repeat");
    expect(repeat?.max).toBe(1);
    // "fodder" is queued for whichever discard prompt/field the engine raises for the Repeat cost.
    await game.p1.cast("sq", { answers: ["fodder"], repeat: 1, targets: "rookie" });
    expect(game.p1.energy()).toBe(0); // the Repeat cost is a discard, not energy
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    const total = game.state("rookie").grantedKeywords.filter((k) => k.keyword === "Assault").reduce((s, k) => s + (k.value ?? 0), 0);
    expect(total).toBe(8);
    expect(game.state("rookie").might).toBe(1);
  });

  // BUG — expected (820.1.d / 355.1.a / 422): the Repeat cost "Discard 1" is PAID as the spell is
  // played, so the pitched card is in the trash before anyone gets priority. Actual: the repeat is
  // free — the registry normalises `repeat: { discard: 1 }` to {energy 0, no power} and nothing is
  // ever discarded (fodder stays in hand).
  test("Repeat — Discard 1 puts the discarded card in the trash at play time", async () => {
    const game = await board(4).hand(P1, FODDER, "fodder").build();
    await game.p1.cast("sq", { answers: ["fodder"], repeat: 1, targets: "rookie" });
    expect(game.zoneOf("sq")).toBe("chain");
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
  });

  // BUG — expected: with Square Up as the ONLY card in hand the discard cannot be paid, so no repeat
  // variant may be offered and repeat:1 must be refused. Actual: repeat is offered (free) and accepted.
  test("Repeat is unavailable with no other card in hand to discard", async () => {
    const game = await board(4).build();
    expect(game.p1.hand()).toEqual(["sq"]);
    const repeat = game.p1.option("cast", "sq")?.fields.find((f) => f.arg === "repeat");
    expect(repeat === undefined || !(repeat.options ?? []).includes(1)).toBe(true);
    const r = await game.p1.try((p) => p.cast("sq", { repeat: 1, targets: "rookie" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("sq")).toBe("hand");
    expect(game.p1.energy()).toBe(4);
  });

  test("[Repeat] may name a DIFFERENT unit for the second execution (820.2.a): Rookie and the enemy Guard each end with exactly Assault 4", async () => {
    const game = await board(4).hand(P1, FODDER, "fodder").build();
    await game.p1.cast("sq", { answers: ["fodder"], repeat: 1, targets: ["rookie", "guard"] });
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.state("rookie").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 4 }]);
    expect(game.state("guard").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 4 }]);
    expect(game.zoneOf("sq")).toBe("trash");
  });

  test("parsed abilities: one spell ability — grant-keyword Assault 4 (turn) to a unit, Repeat cost = { discard: 1 }; card 4 energy, no power, NOT action/reaction timed", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "fury", energyCost: 4, name: "Square Up" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(["action", "reaction"]).not.toContain(def?.timing as string);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { duration: "turn", keyword: "Assault", target: { type: "unit" }, type: "grant-keyword", value: 4 },
      repeat: { discard: 1 },
      type: "spell",
    });
    expect((def?.abilities?.[0] as { timing?: string }).timing).not.toBe("reaction");
  });
});
