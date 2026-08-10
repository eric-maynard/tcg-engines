/**
 * Zenith Blade — ogn-262-298 · Spell · Calm/Order · 3 energy + [C][C] · Action
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy
 *   unit's battlefield. (A stunned unit doesn't deal combat damage this turn.)
 *
 * Rules: 806 Action, 423 Stun (binary; no combat damage contribution — 423.1.b; cleared at
 * end of turn — 423.1.a.2), 135.2.e.6.c ([C] on a two-domain card = calm OR order power),
 * "you may" = optional instruction; the destination is fixed ("that enemy unit's battlefield").
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-262-298";

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1, order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 4 }, "foe")
    .unit(P2, "base", { might: 4 }, "home")
    .unit(P1, "base", { might: 2 }, "ally")
    .hand(P1, CARD, "zb");
}

/** Cast on [foe, ally]; if the engine asks where to put the ally, send it to bf1. */
async function castAndResolve(game: Game) {
  await game.p1.cast("zb", { targets: ["foe", "ally"] });
  const stop = await game.settle();
  if (stop.reason === "unanswered") {
    await game.p1.pick("battlefield-bf1");
    await game.settle();
  }
}

describe("Zenith Blade (ogn-262-298)", () => {
  test("costs 3 energy + 2 power of its domains (calm/order); spell goes to trash; unaffordable with 1 power or 2 energy", async () => {
    const game = await board().build();
    await castAndResolve(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, order: 0 } });
    expect(game.zoneOf("zb")).toBe("trash");
    const onePower = await board().resources(P1, { energy: 3, power: { calm: 1, order: 0 } }).build();
    expect(onePower.p1.can("cast", "zb")).toBe(false);
    const lowEnergy = await board().resources(P1, { energy: 2, power: { calm: 1, order: 1 } }).build();
    expect(lowEnergy.p1.can("cast", "zb")).toBe(false);
  });

  test("stuns the chosen ENEMY unit AT A BATTLEFIELD — enemy units in base and friendly units are not offered for the stun", async () => {
    const game = await board().build();
    const tuples = (game.p1.option("cast", "zb")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
    const stunChoices = new Set(tuples.map((t) => t[0]));
    expect([...stunChoices]).toEqual(["foe"]);
    await castAndResolve(game);
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.state("home").isStunned).toBe(false);
    expect(game.state("ally").isStunned).toBe(false);
  });

  test("the friendly unit is moved to the stunned unit's battlefield (not exhausted — it was moved by an effect)", async () => {
    // The arrival contests bf1 and stages a showdown (323.9 / 460), so the
    // board is inspected on arrival — before that combat is fought out.
    const game = await board().build();
    await game.p1.cast("zb", { targets: ["foe", "ally"] });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    await game.p1.pick("battlefield-bf1");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.state("ally").isExhausted).toBe(false);
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  });

  test("the destination is fixed — only 'that enemy unit's battlefield' (bf1), never another battlefield", async () => {
    // The destination menu must hold exactly bf1; bf2 is never offered.
    // Checked on arrival — settling past this point fights the showdown the
    // arrival stages (323.9), which recalls the losing attacker to base.
    const game = await board().build();
    await game.p1.cast("zb", { targets: ["foe", "ally"] });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toEqual(["battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    expect(game.locationOf("ally")).toBe("bf1");
  });

  // rule 355.4 / 355.10 / 355.8 (ruling 61cc92b5da603de0) — the "may" governs only whether the MOVE
  // happens; the friendly unit is still a target named as the spell is played, so with no friendly
  // unit on the board Zenith Blade has no legal target set and cannot be played at all.
  test("'You may move' still TARGETS the friendly unit — with no friendly unit at all the spell is unplayable", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1, order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4 }, "foe")
      .hand(P1, CARD, "zb")
      .build();
    expect(game.p1.can("cast", "zb")).toBe(false);
    const r = await game.p1.try((p) => p.cast("zb", { targets: "foe" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("zb")).toBe("hand");
    expect(game.state("foe").isStunned).toBe(false);
  });

  test("a stunned defender deals no combat damage — the 2-Might ally attacks the stunned 4-Might foe and survives (423.1.b)", async () => {
    // Expected: foe contributes 0 combat damage, so the ally lives (recalled to base; foe holds bf1).
    // Actual: the stunned foe still deals 4 and the ally is killed.
    const game = await board().build();
    await castAndResolve(game);
    if (game.p1.can("startShowdown")) {
      await game.p1.choose("startShowdown:bf1");
    }
    await game.settle();
    expect(game.zoneOf("ally")).not.toBe("trash");
    expect(game.state("ally").damage).toBe(0);
    expect(game.zoneOf("foe")).toBe("battlefield-bf1"); // 2 < 4, survives
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("[Action]: not playable on the opponent's turn outside a showdown; playable when P1 has Focus in a showdown", async () => {
    const idle = await board().active(P2).build();
    expect(idle.p1.can("cast", "zb")).toBe(false);
    const g2 = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { calm: 1, order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "def")
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "base", { might: 5 }, "atk")
      .hand(P1, CARD, "zb")
      .build();
    expect(g2.turnPlayer()).toBe(P2);
    await g2.p2.move("atk", "bf1");
    await g2.p2.passFocus();
    expect(g2.p1.can("cast", "zb")).toBe(true);
    await g2.p1.cast("zb", { targets: ["atk", "ally"] });
    expect(g2.p1.resources()).toEqual({ energy: 0, power: { calm: 0, order: 0 } });
    await g2.p1.passPriority();
    await g2.p2.passPriority(); // spell resolves inside the showdown
    if (g2.decision()?.kind === "pick") {
      await g2.p1.pick("battlefield-bf1");
    }
    expect(g2.state("atk").isStunned).toBe(true);
    expect(g2.locationOf("ally")).toBe("bf1"); // joined the defence
    expect(g2.zoneOf("zb")).toBe("trash");
  });

  test("'this turn' — the stun is cleared at end of turn (423.1.a.2)", async () => {
    // Expected: after P1's turn ends the foe is no longer stunned. Actual: the flag persists.
    const game = await board().build();
    await castAndResolve(game);
    if (game.p1.can("startShowdown")) {
      await game.p1.choose("startShowdown:bf1"); // let the pending combat at bf1 play out
    }
    await game.settle();
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.state("foe").isStunned).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("foe").isStunned).toBe(false);
  });
});
