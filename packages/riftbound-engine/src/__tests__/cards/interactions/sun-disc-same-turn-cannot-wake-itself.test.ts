/**
 * Interaction: Sun Disc (ogn-021-298) · Gear · Fury · 2 + [fury]
 *     "[Exhaust]: [Legion] — The next unit you play this turn enters ready. (Get the effect if you've played another card this turn.)"
 *   × Legion Rearguard (ogn-010-298) · Unit · Fury · 2 · 2 Might · "[Accelerate] (You may pay [1][fury] … enter ready.)" — declined throughout
 *   × Trifarian Gloryseeker (ogn-217-298) · Unit · Order · 2 · 2 Might · "[Legion] — When you play me, buff me."
 *
 * Rules: 812.1.b.1 / 812.1.c (Legion needs a card DIFFERENT from the bearer finalized by you this turn), 812.2, 727.1.b
 * (dependent ability Inactive until the condition is met), 727.1.c.1 (an Inactive triggered ability is not evaluated — it
 * does not trigger), 727.1.c.3 (an activated dependent ability is usable only after it becomes Active), 143.4 (units enter
 * exhausted), 805.3 (no retroactive readiness), 383.4.a.2 (play triggers go on the chain after the permanent is finalized).
 *
 * Question — Legion self-timing on P1's open turn with 6 energy + 1 fury and all three cards in hand:
 *   Line A: Sun Disc FIRST, try to exhaust it at once, then Rearguard — ready?      Expected: NO. Sun Disc alone cannot satisfy
 *           its own Legion; the activation is not even offered; Rearguard enters exhausted; only AFTER Rearguard is the
 *           activation live — too late for Rearguard.
 *   Line B: Gloryseeker FIRST — self-buff? Then Sun Disc, exhaust, Rearguard — ready?   Expected: Gloryseeker's own play does not
 *           satisfy its own Legion → no trigger at all, unbuffed 2; Sun Disc (2nd card) is Active immediately → exhaust →
 *           Rearguard (3rd) enters READY for plain 2 energy.
 *   Line C: Rearguard, Sun Disc, exhaust, Gloryseeker — ready AND buffed?             Expected: yes — enters ready via Sun Disc and
 *           its now-Active Legion trigger buffs it to 3.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const SUN_DISC = "ogn-021-298";
const LEGION_REARGUARD = "ogn-010-298";
const TRIFARIAN_GLORYSEEKER = "ogn-217-298";

/** P1's turn 2, open main phase, nothing played yet. Pool: 2+[fury] (Sun Disc) + 2 + 2 = 6 energy, 1 fury. All three cards in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { fury: 1 } })
    .hand(P1, SUN_DISC, "disc")
    .hand(P1, LEGION_REARGUARD, "rearguard")
    .hand(P1, TRIFARIAN_GLORYSEEKER, "glory");
}

async function playAndSettle(game: Game, card: string): Promise<void> {
  await game.p1.play(card); // Rearguard: no `accelerate` → the optional cost is declined
  const s = await game.settle();
  expect(s.reason).toBe("open");
}

async function exhaustDisc(game: Game): Promise<void> {
  expect(game.p1.can("activate", "disc")).toBe(true);
  await game.p1.activate("disc");
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.state("disc").isExhausted).toBe(true);
}

describe("Line A — Sun Disc first cannot wake itself", () => {
  test("Sun Disc played as the FIRST card: enters base ready as gear for 2 + [fury] (pool 4 / fury 0)…", async () => {
    const game = await board().build();
    await playAndSettle(game, "disc");
    expect(game.zoneOf("disc")).toBe("base");
    expect(game.state("disc")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 0 } });
  });

  test("…but its [Exhaust] activation is NOT offered: the only finalized card this turn is Sun Disc itself, so its Legion text is Inactive (812.1.c / 727.1.c.3)", async () => {
    const game = await board().build();
    await playAndSettle(game, "disc");
    expect(game.p1.can("activate", "disc")).toBe(false);
    expect(game.p1.legal().map((o) => o.key).filter((k) => k.startsWith("activateAbility:disc"))).toEqual([]);
    await expect(game.p1.activate("disc")).rejects.toThrow();
    expect(game.state("disc").isReady).toBe(true); // nothing was exhausted
  });

  test("Rearguard (Accelerate declined) played next enters EXHAUSTED for 2 energy (143.4) — Sun Disc never did anything for it", async () => {
    const game = await board().build();
    await playAndSettle(game, "disc");
    await playAndSettle(game, "rearguard");
    expect(game.zoneOf("rearguard")).toBe("base");
    expect(game.state("rearguard")).toMatchObject({ isExhausted: true, might: 2, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
  });

  test("only AFTER Rearguard (a different card) is finalized does Sun Disc's activation become legal — and using it now does not retroactively ready the already-entered Rearguard (805.3-style)", async () => {
    const game = await board().build();
    await playAndSettle(game, "disc");
    await playAndSettle(game, "rearguard");
    expect(game.p1.can("activate", "disc")).toBe(true);
    await exhaustDisc(game);
    expect(game.state("rearguard").isExhausted).toBe(true);
    // The pending "next unit enters ready" is still unused: the third card (Gloryseeker) would be the one to get it.
    await playAndSettle(game, "glory");
    expect(game.state("glory").isReady).toBe(true);
    expect(game.state("rearguard").isExhausted).toBe(true);
  });
});

describe("Line B — Gloryseeker first does not satisfy its own Legion; Sun Disc second is live at once", () => {
  test("Gloryseeker as the FIRST card: its Legion play-trigger is Inactive → nothing goes on the chain (727.1.c.1); it enters exhausted, UNBUFFED, 2 Might", async () => {
    const game = await board().build();
    await game.p1.play("glory");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("glory")).toMatchObject({ isBuffed: false, isExhausted: true, might: 2, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } });
  });

  test("Sun Disc played SECOND: Gloryseeker (a different card) was already finalized → the activation is offered as soon as the Disc is on the board (727.1.c.3)", async () => {
    const game = await board().build();
    await playAndSettle(game, "glory");
    await playAndSettle(game, "disc");
    expect(game.state("disc").isReady).toBe(true);
    expect(game.p1.can("activate", "disc")).toBe(true);
  });

  test("exhausting it costs nothing but the exhaust, puts one Sun Disc ability on the chain, and does NOT ready the Gloryseeker already on the board (it only affects the NEXT unit played)", async () => {
    const game = await board().build();
    await playAndSettle(game, "glory");
    await playAndSettle(game, "disc");
    const pool = game.p1.resources();
    await game.p1.activate("disc");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.p1.resources()).toEqual(pool);
    expect(game.state("disc").isExhausted).toBe(true);
    expect(game.state("glory").isExhausted).toBe(true);
  });

  test("Rearguard played THIRD (Accelerate declined) enters READY for just 2 energy — no Accelerate paid; final pool 0 energy / 0 fury (2+2+[fury]+2 spent in total)", async () => {
    const game = await board().build();
    await playAndSettle(game, "glory");
    await playAndSettle(game, "disc");
    await exhaustDisc(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    await playAndSettle(game, "rearguard");
    expect(game.state("rearguard")).toMatchObject({ isReady: true, might: 2, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    // Gloryseeker never got anything out of this line.
    expect(game.state("glory")).toMatchObject({ isBuffed: false, isExhausted: true, might: 2 });
    expect(game.violations()).toEqual([]);
  });
});

describe("Line C — Rearguard, Sun Disc, exhaust, Gloryseeker: ready AND buffed", () => {
  test("Rearguard first (declined Accelerate) enters exhausted; Sun Disc second is immediately activatable; exhaust it", async () => {
    const game = await board().build();
    await playAndSettle(game, "rearguard");
    expect(game.state("rearguard").isExhausted).toBe(true);
    await playAndSettle(game, "disc");
    expect(game.p1.can("activate", "disc")).toBe(true);
    await exhaustDisc(game);
    expect(game.state("rearguard").isExhausted).toBe(true); // not retroactive
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
  });

  test("Gloryseeker third: it is finalized READY (Sun Disc) and — Legion Active since Rearguard/Sun Disc were finalized earlier — its 'buff me' trigger goes on the chain (383.4.a.2)", async () => {
    const game = await board().build();
    await playAndSettle(game, "rearguard");
    await playAndSettle(game, "disc");
    await exhaustDisc(game);
    await game.p1.play("glory");
    expect(game.zoneOf("glory")).toBe("base");
    expect(game.state("glory").isReady).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "glory", controller: P1, triggered: true })]);
    expect(game.state("glory").isBuffed).toBe(false); // not yet — the trigger is still pending
  });

  test("the trigger resolves: Gloryseeker is ready, buffed, 3 Might; Rearguard still exhausted; pool 0 / 0; no violations", async () => {
    const game = await board().build();
    await playAndSettle(game, "rearguard");
    await playAndSettle(game, "disc");
    await exhaustDisc(game);
    await playAndSettle(game, "glory");
    expect(game.chain()).toEqual([]);
    expect(game.state("glory")).toMatchObject({ baseMight: 2, isBuffed: true, isReady: true, might: 3, zone: "base" });
    expect(game.state("rearguard")).toMatchObject({ isExhausted: true, might: 2 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.violations()).toEqual([]);
  });
});

describe("Across all lines exactly one unit ever benefits from one Sun Disc activation", () => {
  test("one activation, two units played afterwards: only the first of them enters ready; the Disc cannot be activated again while exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { fury: 1 } })
      .hand(P1, SUN_DISC, "disc")
      .hand(P1, LEGION_REARGUARD, "rearguard")
      .hand(P1, TRIFARIAN_GLORYSEEKER, "glory")
      .hand(P1, { energyCost: 2, might: 2, name: "Extra Recruit" }, "extra")
      .build();
    await playAndSettle(game, "rearguard"); // enables Legion
    await playAndSettle(game, "disc");
    await exhaustDisc(game);
    expect(game.p1.can("activate", "disc")).toBe(false);
    await playAndSettle(game, "glory");
    await playAndSettle(game, "extra");
    expect(game.state("glory").isReady).toBe(true);
    expect(game.state("extra").isExhausted).toBe(true);
    expect(game.state("rearguard").isExhausted).toBe(true);
    const readyUnits = ["rearguard", "glory", "extra"].filter((u) => game.state(u).isReady);
    expect(readyUnits).toEqual(["glory"]);
  });
});
