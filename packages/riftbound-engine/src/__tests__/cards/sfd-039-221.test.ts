/**
 * Royal Entourage — sfd-039-221 · Unit · Calm · 3 energy + [calm] · 4 might
 *
 *   When you play me, ready or exhaust a legend.
 *
 * Head-judge notes (the tricky cases covered below):
 *  - "a legend" (355.9.a.4 / 355.10.a): EITHER player's legend is a legal choice; nothing on the
 *    board that is not a legend (units, champions, gear) may be offered.
 *  - Mode + target: "ready OR exhaust" is a modal choice; readying an already-ready legend is a
 *    legal no-op (no crash, nothing else changes).
 *  - Real payoff: readying YOUR OWN legend after using its [Exhaust] ability lets you use it a
 *    second time the same turn (Blind Monk: "[1], [Exhaust]: Buff a friendly unit").
 *  - Real disruption: exhausting the OPPONENT's legend only lasts until their Awaken Phase
 *    (315.1.b / 415.3.a readies everything they control) — checked across advanceTurn().
 *  - "When you play me" is a triggered ability that uses the chain (the unit itself does not);
 *    a Royal Entourage that starts on the board never triggers.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-039-221";
const BLIND_MONK = "ogn-257-298"; // legend: [1], [Exhaust]: Buff a friendly unit.
const LOOSE_CANNON = "ogn-251-298"; // legend with only a triggered ability

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .legend(P1, BLIND_MONK, "monk")
    .legend(P2, LOOSE_CANNON, "loose")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, CARD, "re");
}

describe("Royal Entourage (sfd-039-221)", () => {
  test("cost: pays 3 energy + 1 calm; a 4-might unit that enters the base exhausted", async () => {
    const game = await board().build();
    await game.p1.play("re");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("re")).toBe("base");
    expect(game.state("re").might).toBe(4);
    expect(game.state("re").isExhausted).toBe(true);
  });

  test("cost: not playable with 3 energy but no calm power, nor with the power but only 2 energy", async () => {
    const noPower = await scenario().resources(P1, { energy: 3 }).legend(P1, BLIND_MONK, "monk").hand(P1, CARD, "re").build();
    expect(noPower.p1.can("play", "re")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 2, power: { calm: 1 } }).legend(P1, BLIND_MONK, "monk").hand(P1, CARD, "re").build();
    expect(noEnergy.p1.can("play", "re")).toBe(false);
  });

  test("the play trigger goes on the chain as a triggered ability of Royal Entourage; both players get priority", async () => {
    const game = await board().build();
    await game.p1.play("re");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "re", controller: P1, triggered: true })]);
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // opponent may respond before it resolves
    expect(game.chain()).toHaveLength(1);
  });

  test("mode 'exhaust' + target: only LEGENDS (both players') are offered — never units", async () => {
    const game = await board().build();
    await game.p1.play("re");
    await game.settle();
    const mode = game.decision() as PickDecision;
    expect(mode.kind).toBe("pick");
    expect(mode.options.map((o) => o.label)).toEqual(["ready (mode 0)", "exhaust (mode 1)"]);
    await game.p1.chooseMode(1);
    const target = game.decision() as PickDecision;
    expect(target.seat).toBe(P1);
    expect(target.options.map((o) => o.card).sort()).toEqual(["loose", "monk"]);
    await game.p1.pick("loose");
    expect(game.state("loose").isExhausted).toBe(true);
    expect(game.state("monk").isExhausted).toBe(false);
    expect(game.chain()).toHaveLength(0);
  });

  test("exhausting the opponent's legend lasts only until their Awaken Phase readies it (315.1.b)", async () => {
    const game = await board().build();
    await game.p1.play("re");
    await game.settle();
    await game.p1.chooseMode(1);
    await game.p1.pick("loose");
    expect(game.state("loose").isExhausted).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("loose").isExhausted).toBe(false);
  });

  test("mode 'ready' on your own spent legend: Blind Monk can be activated a second time this turn", async () => {
    const game = await board().resources(P1, { energy: 5, power: { calm: 1 } }).unit(P1, "base", { might: 2, name: "Acolyte" }, "acolyte").build();
    await game.p1.activate("monk", 0, { targets: "acolyte" });
    await game.settle();
    expect(game.state("monk").isExhausted).toBe(true);
    expect(game.state("acolyte").isBuffed).toBe(true);
    expect(game.p1.can("activate", "monk")).toBe(false); // [Exhaust] cost unpayable
    await game.p1.play("re");
    await game.settle();
    await game.p1.chooseMode(0);
    await game.p1.pick("monk");
    expect(game.state("monk").isExhausted).toBe(false);
    // Second activation: Royal Entourage itself (unbuffed) is now a legal buff recipient.
    await game.p1.activate("monk", 0, { targets: "re" });
    await game.settle();
    expect(game.p1.energy()).toBe(0); // 5 - 1 (monk) - 3 (RE) - 1 (monk)
    expect(game.state("re").isBuffed).toBe(true);
    expect(game.state("re").might).toBe(5);
  });

  test("readying an already-ready legend is a legal no-op (no other object changes state)", async () => {
    const game = await board().build();
    await game.p1.play("re");
    await game.settle();
    await game.p1.chooseMode(0);
    await game.p1.pick("loose");
    expect(game.state("loose").isExhausted).toBe(false);
    expect(game.state("monk").isExhausted).toBe(false);
    expect(game.state("bystander").isExhausted).toBe(false);
    expect(game.decision()?.kind).toBe("action");
    expect(game.violations()).toEqual([]);
  });

  test("with a single legend in the game the target is forced; the mode is still asked", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .legend(P2, BLIND_MONK, "theirs")
      .hand(P1, CARD, "re")
      .build();
    await game.p1.play("re");
    await game.settle();
    expect((game.decision() as PickDecision).semantics).toBe("mode");
    await game.p1.chooseMode(1);
    await game.settle();
    expect(game.state("theirs").isExhausted).toBe(true);
    expect(game.decision()?.kind).toBe("action");
  });

  test("negative: a Royal Entourage that starts on the board (not played) never triggers", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .legend(P1, BLIND_MONK, "monk")
      .unit(P1, "base", CARD, "re")
      .battlefield("bf1", { controller: null })
      .build();
    await game.p1.move("re", "bf1"); // moving is not playing
    await game.settle();
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("monk").isExhausted).toBe(false);
  });

  test("parsed abilities: one play-self trigger whose effect is a choice of ready-legend / exhaust-legend", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 3, might: 4, powerCost: ["calm"] });
    expect(def?.abilities).toEqual([
      {
        effect: {
          options: [
            { effect: { target: { type: "legend" }, type: "ready" } },
            { effect: { target: { type: "legend" }, type: "exhaust" } },
          ],
          type: "choice",
        },
        trigger: { event: "play-self" },
        type: "triggered",
      },
    ]);
  });
});
