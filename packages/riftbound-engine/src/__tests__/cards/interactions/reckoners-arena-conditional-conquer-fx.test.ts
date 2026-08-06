/**
 * Interaction: Reckoner's Arena (ogn-286-298) · Battlefield
 *     "When you hold here, activate the conquer effects of units here."
 *   × Kai'Sa, Survivor (ogn-039-298) · Champion Unit · Fury · 4 · 4 Might
 *     "[Accelerate] … When I conquer, draw 1."
 *   × Tryndamere, Barbarian (ogn-034-298) · Champion Unit · Fury · 7 + [fury][fury] · 8 Might
 *     "When I conquer after an attack, if you assigned 5 or more excess damage to enemy units, you score 1 point."
 *
 * Question: at the start of A's turn A holds Reckoner's Arena with Kai'Sa and Tryndamere there. Which
 * conquer effects get activated? Is this a Conquer? What about units of the non-holding player?
 *
 * Expected (383.4.g / 383.4.g.1 — Reckoner's Arena is the rule's own example; 383.2.a.1; 383.4.d /
 * 383.4.d.2.a; 471.2.b / 471.2.c; 383.4.c.2):
 *   Beginning Phase → A holds the Arena → A scores 1 for holding → the Arena's hold ability goes on the
 *   chain. On resolution, for each unit here A checks its conquer effect treating ONLY the "conquer"
 *   part as fulfilled: Kai'Sa ("When I conquer") → placed on the chain as if triggered → A draws 1.
 *   Tryndamere ("after an attack, if you assigned 5+ excess damage") has unmet extra conditions that
 *   are part of the trigger condition (383.2.a.1) → NOT placed on the chain → no point.
 *   This is not an actual Conquer: no control change, no conquer point, no "When you conquer"
 *   (player-referencing) triggers, nothing recorded as conquered. The hold scores exactly once.
 *   Nothing is *chosen* — "units here" is criteria-based (355.5.a), so no target prompt.
 *   Contrast: only A's units can realistically be at a battlefield A holds; the Arena's controller's
 *   units are the ones checked — an enemy unit's conquer effect there does nothing for its controller.
 *
 * Engine note: the Arena is modelled as "grant keyword TriggerConquer to a friendly unit here", which
 * the engine treats as a targeted, inert keyword grant — hence the BUG tests below.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RECKONERS_ARENA = "ogn-286-298";
const KAISA_SURVIVOR = "ogn-039-298";
const TRYNDAMERE_BARBARIAN = "ogn-034-298";

/** Inline legend for P1: "When you conquer, draw 1." — a player-referencing conquer trigger (383.4.c.2.b). */
const CONQUER_LEGEND = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "conquer", on: "controller" }, type: "triggered" }],
  cardType: "legend",
  domain: "fury",
  name: "Warlord (inline legend: When you conquer, draw 1)",
};

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * It is the end of P2's turn 2. P1 (player "A") controls Reckoner's Arena (live abilities) with
 * Kai'Sa, Survivor and Tryndamere, Barbarian standing on it, plus a "When you conquer" legend.
 * P2 ending the turn takes us into P1's Beginning Phase where the hold is scored.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("arena", { controller: P1, def: RECKONERS_ARENA, inert: false, owner: P1 })
    .unit(P1, "arena", KAISA_SURVIVOR, "kaisa")
    .unit(P1, "arena", TRYNDAMERE_BARBARIAN, "trynd")
    .legend(P1, CONQUER_LEGEND, "warlord");
}

/** P2 ends the turn; drive P1's start of turn to its open main phase, answering any stray prompt with its first option. */
async function intoP1Main(game: G) {
  await game.p2.endTurn();
  await game.settle({ policy: "first" });
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
}

describe("Reckoner's Arena × Kai'Sa, Survivor / Tryndamere, Barbarian — 'activate the conquer effects'", () => {
  test("sequence: P1 holds the Arena at the start of its turn → scores 1 → the Arena's hold ability is on the chain under P1's control (383.4.d.2.a, 471.2.b)", async () => {
    const game = await board().build();
    expect(game.p1.points()).toBe(0);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "arena", controller: P1, triggered: true })]);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["arena"]);
  });

  test("'units here' is criteria-based, not a choice — resolving the Arena's ability never asks P1 to pick a unit (355.5.a, 383.4.g.1)", async () => {
    // Expected: both players pass → the ability resolves against every unit here with no prompt.
    // Actual: the engine opens "Choose a target for Reckoner's Arena" (kaisa | trynd).
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision() as Decision | null;
    const arenaPick = d !== null && d.kind === "pick" && d.seat === P1 && d.options.some((o) => o.card === "kaisa" || o.card === "trynd");
    expect(arenaPick).toBe(false);
  });

  test("Kai'Sa's 'When I conquer, draw 1' is activated by the Arena — P1 draws 1 on top of the draw-phase card (383.4.g.1)", async () => {
    // Expected: hand grows by 2 across the turn start (1 rules draw + 1 from Kai'Sa), deck shrinks by 2.
    // Actual: the Arena only stamps an inert "TriggerConquer" keyword on one chosen unit; Kai'Sa never draws.
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await intoP1Main(game);
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.p1.deck()).toHaveLength(deck0 - 2);
  });

  test("Kai'Sa's activated conquer effect is placed on the chain 'as if it had just triggered' — a triggered item sourced from Kai'Sa appears after the Arena's ability resolves (383.4.g.1)", async () => {
    // Expected: Arena resolves → a new triggered chain item from kaisa (controller P1). Actual: nothing is queued.
    const game = await board().build();
    await game.p2.endTurn();
    let sawKaisaItem = false;
    for (let i = 0; i < 20 && !sawKaisaItem; i++) {
      sawKaisaItem = game.chain().some((c) => c.cardId === "kaisa" && c.triggered && c.controller === P1);
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      await game.settle({ maxSteps: 1, policy: "first" });
    }
    expect(sawKaisaItem).toBe(true);
  });

  test("Tryndamere's conquer effect is NOT activated: its extra conditions ('after an attack', 5+ excess damage) are part of the trigger condition and are unmet — no bonus point (383.2.a.1, 383.4.g.1)", async () => {
    const game = await board().build();
    await intoP1Main(game);
    // Exactly the single hold point — no Tryndamere point, and the hold itself scores only once (471.2.c).
    expect(game.p1.points()).toBe(1);
    expect(game.chain().some((c) => c.cardId === "trynd")).toBe(false);
  });

  test("this is not a Conquer: control of the Arena is unchanged, nothing is recorded as conquered, no conquer point, and P1's 'When you conquer' legend does not trigger (383.4.c.2)", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await intoP1Main(game);
    expect(game.gameState.battlefields.arena?.controller).toBe(P1);
    expect(game.gameState.battlefields.arena?.contested).toBe(false);
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual([]);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["arena"]);
    expect(game.p1.points()).toBe(1);
    // The legend's player-referencing conquer trigger never fired: at most draw-phase + Kai'Sa cards were drawn.
    expect(game.p1.hand().length).toBeLessThanOrEqual(hand0 + 2);
    expect(game.chain().some((c) => c.cardId === "warlord")).toBe(false);
    expect(game.state("warlord").isExhausted).toBe(false);
  });

  test("control: the same legend DOES trigger on a real conquer (so its silence above is meaningful)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "walker")
      .legend(P1, CONQUER_LEGEND, "warlord")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("walker", "bf1");
    await game.settle({ policy: "first" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("hold scores exactly once per turn: after the whole start-of-turn settles P1 has 1 point and the Arena was scored once (471.2.c)", async () => {
    const game = await board().points(P1, 3).build();
    await intoP1Main(game);
    expect(game.p1.points()).toBe(4);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["arena"]);
  });

  test("contrast: an ENEMY Kai'Sa standing at the Arena gets nothing for its controller when P1 holds — P2 draws no card during P1's beginning phase", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("arena", { controller: P1, def: RECKONERS_ARENA, inert: false, owner: P1 })
      .unit(P1, "arena", KAISA_SURVIVOR, "kaisa")
      .unit(P2, "arena", KAISA_SURVIVOR, "theirKaisa")
      .build();
    const p2hand0 = game.p2.hand().length;
    await game.p2.endTurn();
    await game.settle({ policy: "first" });
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.hand()).toHaveLength(p2hand0);
    expect(game.p2.points()).toBe(0);
  });
});
