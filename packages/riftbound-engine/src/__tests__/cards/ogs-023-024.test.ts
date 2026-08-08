/**
 * Might of Demacia - Starter — ogs-023-024 · Legend (Garen) · Body/Order
 *
 *   When you conquer, if you have 4+ units at that battlefield, draw 2.
 *
 * Rules: 383.4.c.2.b ("When you conquer" triggers when YOU gain control and score the conquer point),
 * 383.2.a.1 (an "if" immediately after the condition is PART OF THE TRIGGER CONDITION: checked when
 * the conquer happens, never re-checked on resolution), 466.5.d / 348.2.a (after combat the surviving
 * side establishes control → conquer), 469.1 vs 469.2 (hold ≠ conquer), 740.1.a ("you have … units" =
 * units you control; tokens are units), 107.4.c (a Legend's text is live from the Legend Zone).
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. Threshold: exactly 4 draws, 3 does not; 5+ still draws exactly 2 (not per unit).
 *  2. Counted AFTER combat: four 1-Might attackers into a 1-Might defender lose one body to the
 *     defender's damage → conquer with 3 → nothing; five attackers → 4 survive → draw 2.
 *  3. Trigger-condition "if" (383.2.a.1): the opponent Gusting one of the four back to hand in
 *     response to the trigger does NOT stop the draw.
 *  4. "at THAT battlefield": friends elsewhere (base / another battlefield) don't count.
 *  5. Tokens are units; only YOUR conquers; holding with 4+ units is not a conquer.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogs-023-024";
const GUST = "ogn-169-298"; // Chaos [Reaction], 1 energy: return a unit at a battlefield with 3 Might or less to its owner's hand
const RECRUIT_TOKEN = "ogn-273-298"; // 1-Might Recruit unit token

/** P1 (legend: Might of Demacia) with `n` ready 1-Might units in base; bf1 empty & uncontrolled unless `defenderMight` given (then P2 holds it). */
function board(n: number, defenderMight?: number) {
  const b = scenario().legend(P1, CARD, "mod");
  if (defenderMight === undefined) {
    b.battlefield("bf1", { controller: null });
  } else {
    b.battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: defenderMight, name: "Defender" }, "def");
  }
  b.battlefield("bf2", { controller: P1 });
  for (let i = 0; i < n; i++) {
    b.unit(P1, "base", { might: 1, name: `Soldier ${i}` }, `s${i}`);
  }
  return b;
}

const squad = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);

/** Move the units in and settle to the open main phase (showdown/combat auto-resolved, triggers passed through). */
async function march(game: Game, units: string[], to = "bf1"): Promise<void> {
  await game.p1.move(units, to);
  await game.settle();
  expect((await game.settle()).reason).toBe("open");
}

describe("Might of Demacia - Starter (ogs-023-024)", () => {
  test("registry payload: one 'When you conquer' trigger, condition has-at-least 4 friendly units at the trigger battlefield, effect draw 2", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Garen", domain: ["body", "order"], name: "Might of Demacia - Starter" });
    expect(def?.abilities).toEqual([
      {
        condition: { count: 4, target: { controller: "friendly", location: "trigger-battlefield", type: "unit" }, type: "has-at-least" },
        effect: { amount: 2, type: "draw" },
        trigger: { event: "conquer", on: "controller" },
        type: "triggered",
      },
    ]);
  });

  test("core line, step by step: four units take empty bf1 → conquer point → the legend's trigger sits on the chain (nothing drawn yet) → both pass → P1 draws exactly 2", async () => {
    const game = await board(4).build();
    expect(game.p1.hand()).toHaveLength(0);
    await game.p1.move(squad(4), "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mod", controller: P1, triggered: true, type: "ability" })]);
    expect(game.p1.hand()).toHaveLength(0);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p2.hand()).toHaveLength(0);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("threshold, one short: THREE units conquer → the point is scored but the trigger never hits the chain and nothing is drawn", async () => {
    const game = await board(3).build();
    await game.p1.move(squad(3), "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.p1.points()).toBe(1);
    expect(game.chain().some((i) => i.cardId === "mod")).toBe(false);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("'4+' with six units still draws exactly 2 (once per conquer, not per unit)", async () => {
    const game = await board(6).build();
    await march(game, squad(6));
    expect(game.p1.units("bf1")).toHaveLength(6);
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("counted after combat — four 1-Might attackers into a 1-Might defender: the defender's 1 damage kills one attacker, three conquer → no draw", async () => {
    const game = await board(4, 1).build();
    await march(game, squad(4));
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.units("bf1")).toHaveLength(3);
    expect(game.p1.trash()).toHaveLength(1);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("counted after combat — five attackers into the same defender: four survive the conquer → draw 2", async () => {
    const game = await board(5, 1).build();
    await march(game, squad(5));
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.p1.units("bf1")).toHaveLength(4);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("383.2.a.1 — the 'if' is part of the trigger condition: P2 Gusts one of the four back to hand in response, the trigger still resolves and P1 draws 2 (hand = bounced unit + 2)", async () => {
    const game = await board(4).resources(P2, { energy: 1, power: { chaos: 1 } }).hand(P2, GUST, "gust").build();
    await game.p1.move(squad(4), "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.chain().map((i) => i.cardId)).toEqual(["mod"]);
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "s0" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["mod", "gust"]);
    await game.settle();
    expect(game.zoneOf("s0")).toBe("hand");
    expect(game.p1.units("bf1")).toHaveLength(3); // below 4 at resolution — irrelevant
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.p1.hand()).toContain("s0");
  });

  test("'at THAT battlefield': three conquer bf1 while a fourth friend stays home in base → 4 units on the board, none drawn", async () => {
    const game = await board(4).build();
    await march(game, squad(3));
    expect(game.p1.units()).toHaveLength(4);
    expect(game.p1.units("bf1")).toHaveLength(3);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(0);
  });

  // BUG — expected: only units at the CONQUERED battlefield count ("at that battlefield"). Actual: the condition counts
  // friendly units at ANY battlefield (a friend parked at bf2 makes 3 + 1 = 4 and P1 draws 2); units in base are
  // correctly ignored (previous test).
  test.failing("BUG: 'at THAT battlefield' — a fourth friendly unit at a DIFFERENT battlefield (bf2) must not count: three conquer bf1 → no draw", async () => {
    const game = await board(3).unit(P1, "bf2", { might: 2, name: "Elsewhere" }, "elsewhere").build();
    await march(game, squad(3));
    expect(game.p1.units("bf1")).toHaveLength(3);
    expect(game.p1.units("bf2")).toHaveLength(1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("tokens are units: three soldiers + a Recruit token conquer together → draw 2", async () => {
    const game = await board(3).unit(P1, "base", RECRUIT_TOKEN, "recruit").build();
    expect(game.state("recruit")).toMatchObject({ isToken: true, might: 1 });
    await march(game, [...squad(3), "recruit"]);
    expect(game.p1.units("bf1")).toHaveLength(4);
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("only YOUR conquers: P2 conquering with four units on P2's turn draws nobody anything", async () => {
    const b = scenario().active(P2).legend(P1, CARD, "mod").battlefield("bf1", { controller: null });
    for (let i = 0; i < 4; i++) {
      b.unit(P2, "base", { might: 1, name: `Foe ${i}` }, `f${i}`);
    }
    const game = await b.build();
    await game.p2.move(["f0", "f1", "f2", "f3"], "bf1");
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p2.hand()).toHaveLength(0);
  });

  test("holding is not conquering (469.2): starting my turn in control of bf1 with four units there scores the hold point but draws only the draw-phase card", async () => {
    const b = scenario().turn(2).active(P2).legend(P1, CARD, "mod").battlefield("bf1", { controller: P1 });
    for (let i = 0; i < 4; i++) {
      b.unit(P1, "bf1", { might: 1, name: `Soldier ${i}` }, `s${i}`);
    }
    const game = await b.build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(1);
  });

  // BUG — same root cause as above: the second conquer counts the four still standing at bf1 (4 + 3 at battlefields)
  // and draws again. Expected: bf3 was conquered with three units → no second draw.
  test.failing("BUG: a second conquer the same turn is judged on ITS battlefield: four take bf1 (draw 2), then three fresh units take empty bf3 → still just the 2 cards, 2 points", async () => {
    const game = await board(7).battlefield("bf3", { controller: null }).build();
    await march(game, squad(4), "bf1");
    expect(game.p1.hand()).toHaveLength(2);
    await march(game, ["s4", "s5", "s6"], "bf3");
    expect(game.gameState.battlefields.bf3?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.p1.hand()).toHaveLength(2);
  });
});
