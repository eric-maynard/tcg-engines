/**
 * Reckoner's Arena — ogn-286-298 · Battlefield
 *
 *   When you hold here, activate the conquer effects of units here.
 *
 * Rules: 383.4.g / 383.4.g.1 (this card is the rule's own example — for each unit here, check its
 * conquer effect treating ONLY the "conquer" part of the condition as met and put it on the chain "as
 * if it had just triggered"), 383.2.a.1 (extra "if"/"after an attack" riders are part of the condition
 * and are NOT waived), 383.4.d.2.b / 471.2.b (the Arena's own ability is a Hold Effect of the holder,
 * chained in the Beginning Phase), 469 / 471 (activating conquer effects is not a Conquer: no point,
 * nothing recorded as conquered), 823.1.b (Hunt is BOTH a conquer and a hold effect), 355.5.a ("units
 * here" is criteria-based — nothing is chosen).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Hunt double-dips: Voracious Gromp holding the Arena gains 3 XP from Hunt's hold half AND 3 more
 *     when the Arena activates Hunt's conquer half → 6 XP from one Beginning Phase.
 *  2. "Units HERE" only: a Kai'Sa holding a different battlefield, or sitting in base, draws nothing.
 *  3. Not a Conquer: exactly 1 point (the hold), `conqueredThisTurn` stays empty, and a
 *     player-referencing "When you conquer" (legend) must stay silent.
 *  4. Sequencing: hold point → Arena trigger on the chain (P2 may respond) → on resolution Kai'Sa's
 *     effect is appended as its own triggered item → resolves → only then Channel/Draw/Main.
 *  5. Zero case: held by a vanilla unit → the ability resolves doing nothing, no prompt, no error.
 *  6. Hold-only: actually conquering the Arena fires Kai'Sa's own conquer trigger once — the Arena adds
 *     nothing on a conquer, and nothing on the opponent's turn.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ogn-286-298";
const KAISA = "ogn-039-298"; // Kai'Sa, Survivor — 4 Might · When I conquer, draw 1.
const GROMP = "unl-100-219"; // Voracious Gromp — 5 Might · [Hunt 3] (When I conquer or hold, gain 3 XP.)
const CONQUER_LEGEND = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "conquer", on: "controller" }, type: "triggered" }],
  cardType: "legend",
  domain: "fury",
  name: "Inline Warlord (When you conquer, draw 1)",
} as const;

/** End of P2's turn 2; P1 controls the live Arena. Units are added per test. */
function arena() {
  return scenario().turn(2).active(P2).battlefield("arena", { controller: P1, def: CARD, inert: false, owner: P1 }).battlefield("bf2", { controller: null });
}

describe("Reckoner's Arena (ogn-286-298)", () => {
  test("registry payload: one hold-here trigger whose effect is 'activate-conquer-effects' over ALL units here (no choice)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Reckoner's Arena" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { target: { location: "here", quantity: "all", type: "unit" }, type: "activate-conquer-effects" },
      trigger: { event: "hold" },
      type: "triggered",
    });
  });

  test("sequence: P1 holds → 1 point → the Arena's trigger is on the chain under P1; P2 gets priority; on resolution Kai'Sa's 'draw 1' is appended as its own triggered item, and no unit is ever chosen", async () => {
    const game = await arena().unit(P1, "arena", KAISA, "kaisa").build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "arena", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority(); // Arena resolves
    expect(game.decision()?.kind).not.toBe("pick"); // 355.5.a — criteria-based, nothing to choose
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kaisa", controller: P1, triggered: true })]);
    const hand0 = game.p1.hand().length;
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(hand0 + 2); // Kai'Sa's draw + the Draw Phase
  });

  test("not a Conquer: still exactly 1 point, nothing recorded as conquered, and a 'When you conquer' legend does not draw", async () => {
    const game = await arena().unit(P1, "arena", KAISA, "kaisa").legend(P1, CONQUER_LEGEND, "warlord").build();
    const hand0 = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.conqueredThisTurn?.[P1] ?? []).toEqual([]);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["arena"]);
    expect(game.p1.hand()).toHaveLength(hand0 + 2); // Kai'Sa + draw phase; the legend adds nothing
    expect(game.gameState.battlefields.arena?.controller).toBe(P1);
  });

  test("Hunt is both a hold AND a conquer effect (823.1.b): Voracious Gromp holding the Arena gains 3 + 3 = 6 XP", async () => {
    const game = await arena().unit(P1, "arena", GROMP, "gromp").build();
    expect(game.p1.xp()).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(6);
    expect(game.p1.points()).toBe(1);
  });

  test("control for the Hunt case: Gromp holding a plain battlefield gains exactly 3 XP", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("plain", { controller: P1 }).unit(P1, "plain", GROMP, "gromp").build();
    await game.advanceTurn();
    expect(game.p1.xp()).toBe(3);
  });

  test("two units here: Kai'Sa draws 1 AND Gromp gains its extra 3 XP off the same hold", async () => {
    const game = await arena().unit(P1, "arena", KAISA, "kaisa").unit(P1, "arena", GROMP, "gromp").build();
    const hand0 = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.p1.xp()).toBe(6);
    expect(game.violations()).toEqual([]);
  });

  test("'units HERE' — Kai'Sa holding a DIFFERENT battlefield while a vanilla unit holds the Arena: 2 hold points, but no Kai'Sa draw", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("arena", { controller: P1, def: CARD, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "arena", { might: 2, name: "Grunt" }, "grunt")
      .unit(P1, "bf2", KAISA, "kaisa")
      .build();
    const hand0 = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.p1.points()).toBe(2);
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // draw phase only
  });

  test("'units HERE' — Kai'Sa in the base is not at the Arena: no draw", async () => {
    const game = await arena().unit(P1, "arena", { might: 2, name: "Grunt" }, "grunt").unit(P1, "base", KAISA, "kaisa").build();
    const hand0 = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("zero case: held by a vanilla unit with no conquer effect — the ability resolves doing nothing, no prompt, straight into the Main Phase", async () => {
    const game = await arena().unit(P1, "arena", { might: 2, name: "Grunt" }, "grunt").build();
    await game.p2.endTurn();
    expect(game.chain()).toHaveLength(1);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.phase()).toBe("main");
    expect(game.chain()).toEqual([]);
    expect(game.p1.points()).toBe(1);
  });

  test("hold-only: actually CONQUERING the empty Arena with Kai'Sa fires her own trigger once (1 card) — the Arena adds nothing on a conquer", async () => {
    const game = await scenario()
      .battlefield("arena", { controller: null, def: CARD, inert: false, owner: P1 })
      .unit(P1, "base", KAISA, "kaisa")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("kaisa", "arena");
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.arena?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.chain()).toEqual([]);
  });

  test("only YOUR hold: across the opponent's turn start P1's Kai'Sa on P1's Arena draws nothing and scores nothing", async () => {
    const game = await scenario().turn(3).active(P1).battlefield("arena", { controller: P1, def: CARD, inert: false, owner: P1 }).unit(P1, "arena", KAISA, "kaisa").build();
    const hand0 = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("'you' = the holder: P2 holding P1's Arena card with P2's Kai'Sa → P2 scores and P2 draws", async () => {
    const game = await scenario().turn(3).active(P1).battlefield("arena", { controller: P2, def: CARD, inert: false, owner: P1 }).unit(P2, "arena", KAISA, "kaisa").build();
    const hand0 = game.p2.hand().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p2.hand()).toHaveLength(hand0 + 2);
    expect(game.p1.hand()).toHaveLength(0);
  });
});
