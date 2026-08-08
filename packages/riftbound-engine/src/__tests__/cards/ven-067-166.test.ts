/**
 * Bottled Constellation — ven-067-166 · Gear · Mind · 10 energy + [mind][mind]
 *
 *   At the start of your Main Phase, you may kill 3 other friendly units and/or gear to score 1 point.
 *
 * Head-judge notes — the tricky situations for this card:
 *   1. Timing: "start of your Main Phase" is AFTER Awaken/Beginning(scoring)/Channel/Draw (515→516) — the
 *      turn player has already channelled 2 and drawn 1, and rune pools were just emptied (316.3). Only the
 *      controller's own Main Phase counts; nothing happens on the opponent's turn.
 *   2. "kill 3 … TO score" is a cost inside the instruction (355.10.c.1): all three must be killable or the
 *      option cannot be taken at all — 2 others (the Constellation is not "other" than itself) or a board
 *      full of ENEMY permanents gives no point. Nothing is targeted, so it is all-or-nothing on resolution.
 *   3. "units and/or gear": any mix — 3 units, 3 gear, 2+1 — and with 4+ candidates the controller picks
 *      which three; the rest survive.
 *   4. "you may": declining costs nothing and kills nothing.
 *   5. The point is NOT a Conquer/Hold point → the Final-Point restriction (471.1.b) does not apply
 *      (471.1.a.1): at 7/8 this wins the game on the spot.
 *   6. Cost to get it down at all: exactly 10 energy + 2 mind.
 *   7. Registry: the trigger parses (main-phase / controller / optional) but the effect must be a real
 *      kill-3-then-score, not an unparsed `raw` blob.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-067-166";

/** P2 is about to end turn 2; P1 has the Constellation plus units A, B and gear Trinket (exactly 3 others). */
function threeOthers() {
  return scenario()
    .turn(2)
    .active(P2)
    .gear(P1, CARD, "bottle")
    .unit(P1, "base", { might: 1, name: "A" }, "a")
    .unit(P1, "base", { might: 1, name: "B" }, "b")
    .gear(P1, { name: "Trinket" }, "trinket")
    .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
    .gear(P2, { name: "Their Trinket" }, "theirTrinket");
}

/** After yes(): feed any "which 3" prompt(s) from `wanted`, then settle. */
async function sacrifice(game: Game, wanted: string[]): Promise<void> {
  const left = [...wanted];
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (!d || d.seat !== P1 || d.kind !== "pick") {
      break;
    }
    const keys = d.options.map((o) => o.card ?? o.key).filter((k) => left.includes(k));
    const take = keys.slice(0, Math.max(1, Math.min(d.max, keys.length)));
    await game.p1.pick(...take);
    for (const k of take) {
      left.splice(left.indexOf(k), 1);
    }
  }
  await game.settle();
}

describe("Bottled Constellation (ven-067-166)", () => {
  // Expected: triggered · main-phase · controller · optional, with an effect that kills 3 other friendly
  // units/gear and then scores 1. Actual: trigger OK, effect is `{ type: "raw", text: … }`.
  test("registry payload — 10 + [mind][mind] gear whose main-phase trigger carries a real kill-3 → score-1 effect (not raw)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "mind", energyCost: 10, name: "Bottled Constellation", powerCost: ["mind", "mind"] });
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as { type: string; optional?: boolean; trigger: unknown; effect: { type: string } };
    expect(ability).toMatchObject({ optional: true, trigger: { event: "main-phase", on: "controller" }, type: "triggered" });
    expect(ability.effect.type).not.toBe("raw");
    const json = JSON.stringify(ability.effect);
    expect(json).toContain('"kill"');
    expect(json).toContain('"score"');
    expect(json).toContain("3");
  });

  test("cost: exactly 10 energy + 2 mind puts it into the base; 9 energy or a single mind → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 10, power: { mind: 2 } }).hand(P1, CARD, "bottle").build();
    expect(game.p1.can("play", "bottle")).toBe(true);
    await game.p1.play("bottle");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("bottle")).toBe("base");
    expect(game.p1.gear()).toContain("bottle");
    const nine = await scenario().resources(P1, { energy: 9, power: { mind: 3 } }).hand(P1, CARD, "bottle").build();
    expect(nine.p1.can("play", "bottle")).toBe(false);
    const oneMind = await scenario().resources(P1, { energy: 12, power: { mind: 1, calm: 3 } }).hand(P1, CARD, "bottle").build();
    expect(oneMind.p1.can("play", "bottle")).toBe(false);
  });

  test("timing: as MY Main Phase opens (after channel 2 + draw 1, pools emptied) the trigger sits on the chain and I am asked 'you may'", async () => {
    const game = await threeOthers().build();
    const hand0 = game.p1.hand().length;
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bottle", controller: P1, name: "Bottled Constellation", triggered: true })]);
    await game.settle(); // both pass → resolves into the opt-in question
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.p1.points()).toBe(0); // nothing yet
  });

  // Expected: yes → A, B and Trinket (the only three "other" friendly permanents) are killed → P1 scores 1;
  // the Constellation and P2's permanents survive. Actual: yes does nothing (raw effect) — no kills, no point.
  test("accept with exactly 3 others (2 units + 1 gear) → all three die, Constellation stays, +1 point", async () => {
    const game = await threeOthers().build();
    await game.p2.endTurn();
    await game.settle();
    await game.p1.yes();
    await sacrifice(game, ["a", "b", "trinket"]);
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("trinket")).toBe("trash");
    expect(game.zoneOf("bottle")).toBe("base");
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.zoneOf("theirTrinket")).toBe("base");
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'you may' — declining kills nothing, scores nothing, and leaves me in my open Main Phase", async () => {
    const game = await threeOthers().build();
    await game.p2.endTurn();
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("a")).toBe("base");
    expect(game.zoneOf("b")).toBe("base");
    expect(game.zoneOf("trinket")).toBe("base");
    expect(game.p1.points()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // Expected: with only 2 OTHER friendly permanents (the Constellation itself is not "other"; P2's unit and gear
  // are not friendly) the cost is unpayable → either no question at all or one that cannot be accepted, and no
  // way to reach a point. Actual: a plain accept-able yes/no is offered.
  test("only 2 other friendly permanents (enemy ones don't count, nor itself) → the option cannot be taken", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .gear(P1, CARD, "bottle")
      .unit(P1, "base", { might: 1, name: "A" }, "a")
      .gear(P1, { name: "Trinket" }, "trinket")
      .unit(P2, "base", { might: 2, name: "T1" }, "t1")
      .unit(P2, "base", { might: 2, name: "T2" }, "t2")
      .gear(P2, { name: "Their Trinket" }, "theirTrinket")
      .build();
    await game.p2.endTurn();
    await game.settle();
    const d = game.decision();
    const acceptable = d?.kind === "yes-no" && d.seat === P1 && d.canAccept !== false;
    expect(acceptable).toBe(false);
    await game.settle({ policy: "first" }); // take whatever is offered
    expect(game.p1.points()).toBe(0);
    expect(game.zoneOf("a")).toBe("base");
    expect(game.zoneOf("t1")).toBe("base");
  });

  // Expected: 4 candidates (units A, B + gear Trinket, Bauble) → I choose which three (here B, Trinket, Bauble:
  // 1 unit + 2 gear is a legal mix) → A survives, +1 point. Actual: nothing happens on yes.
  test("with 4 candidates I pick the three (any unit/gear mix); the fourth survives; +1 point", async () => {
    const game = await threeOthers().gear(P1, { name: "Bauble" }, "bauble").build();
    await game.p2.endTurn();
    await game.settle();
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // a real choice exists now
    await sacrifice(game, ["b", "trinket", "bauble"]);
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("trinket")).toBe("trash");
    expect(game.zoneOf("bauble")).toBe("trash");
    expect(game.zoneOf("a")).toBe("base");
    expect(game.p1.points()).toBe(1);
  });

  test("only YOUR Main Phase: across the opponent's turn start nothing triggers, nothing dies, nobody is asked anything", async () => {
    const game = await threeOthers().turn(3).active(P1).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("a")).toBe("base");
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  // Expected (471.1.a.1): a non-Conquer point ignores the Final-Point restriction — at 7/8, accepting wins the
  // game immediately even though P1 controls no battlefield. Actual: yes does nothing.
  test("at 7/8 the bottled point is the winning point (not a Conquer → 471.1.b does not apply)", async () => {
    const game = await threeOthers().victoryScore(8).points(P1, 7).battlefield("bf1", { controller: P2 }).battlefield("bf2", { controller: P2 }).build();
    await game.p2.endTurn();
    await game.settle();
    await game.p1.yes();
    await sacrifice(game, ["a", "b", "trinket"]);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("the trigger is a chain item the opponent may answer: P2 holds priority after I pass, before the question is put", async () => {
    const game = await threeOthers().build();
    await game.p2.endTurn();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toHaveLength(1);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });
});
