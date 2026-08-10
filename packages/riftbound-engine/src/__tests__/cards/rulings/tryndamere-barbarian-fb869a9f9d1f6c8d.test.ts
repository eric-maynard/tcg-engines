/**
 * Ruling fb869a9f9d1f6c8d — Tryndamere, Barbarian (OGN-034 → ogn-034-298) · Unit · Fury · 7+[fury][fury] · 8 Might
 *   "When I conquer after an attack, if you assigned 5 or more excess damage to enemy units, you score 1 point."
 *   × Sprite (OGN-274 → ogn-274-298) · 3-Might token unit "[Temporary]" (the opponent's units on the OTHER battlefield)
 *
 * Q: I'm on 5 points, attack with TWO Tryndameres assigning 5+ excess damage; my opponent still holds another
 *    battlefield (2 Sprites). Do I win on the conquer (5 → 8)?
 * A: Yes. Conquer point: 5 → 6 (the "must have scored every battlefield" restriction only bites at 7+). Then each
 *    Tryndamere's trigger scores 1: 6 → 7 → 8. Points from triggered abilities are not the Conquer point, so the
 *    final-point restriction doesn't apply to them. 8 ≥ victory score ⇒ you win.
 * Rules: 466.1 / 471.1.b (final-point restriction applies to Conquer scoring only), 467 / 323.1 (8+ points wins).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRYNDAMERE = "ogn-034-298";
const SPRITE = "ogn-274-298";

/**
 * P1's turn, P1 on 5 points (victory at 8). P2 holds bf1 with a 3-Might Guard and bf2 with two Sprites. P1: two ready
 * Tryndameres in base (16 Might into a 3-Might defender ⇒ 13 excess).
 */
function board(p1Points = 5) {
  return scenario()
    .victoryScore(8)
    .points(P1, p1Points)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "bf2", SPRITE, "sprite1")
    .unit(P2, "bf2", SPRITE, "sprite2")
    .unit(P1, "base", TRYNDAMERE, "trynd1")
    .unit(P1, "base", TRYNDAMERE, "trynd2");
}

/** Both Tryndameres attack bf1; pass Focus; combat resolves (Guard dies, conquer). Stops with the triggers on the chain. */
async function conquerWithBoth(p1Points = 5): Promise<Game> {
  const game = await board(p1Points).build();
  await game.p1.move(["trynd1", "trynd2"], "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "distribute" && d.seat === P1) {
      await game.p1.distribute({ guard: d.total }); // all 16 on the lone Guard: 13 excess
    } else if (d?.kind === "distribute" && d.seat === P2) {
      await game.p2.distribute({ trynd1: d.total }); // the Guard's 3, irrelevant
    } else if (d?.kind === "order") {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling fb869a9f9d1f6c8d — conquer point + two Tryndamere triggers take P1 from 5 to 8 and the win", () => {
  test("the conquer itself scores normally at 5 → 6 (no final-point restriction below 7) and BOTH Tryndamere triggers are put on the chain", async () => {
    const game = await conquerWithBoth();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2); // P1 has NOT scored every battlefield
    expect(game.p1.points()).toBe(6);
    expect(game.chain().filter((c) => c.triggered).map((c) => c.cardId).toSorted()).toEqual(["trynd1", "trynd2"]);
    expect(game.isOver()).toBe(false);
  });

  test("the triggers resolve one at a time: 6 → 7 → 8 — effect points ignore the conquer restriction — and P1 WINS", async () => {
    const game = await conquerWithBoth();
    await game.acting().passPriority();
    await game.acting().passPriority(); // first Tryndamere trigger
    expect(game.p1.points()).toBe(7);
    if (!game.isOver()) {
      await game.settle();
    }
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — starting from 7: the CONQUER point would be the final point and is withheld (bf2 unscored), but a Tryndamere trigger still scores 7 → 8 and P1 wins anyway (effect points bypass the restriction)", async () => {
    const game = await conquerWithBoth(7);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7); // conquer point denied by 471.1.b
    expect(game.isOver()).toBe(false);
    await game.settle();
    expect(game.p1.points()).toBeGreaterThanOrEqual(8);
    expect(game.winner()).toBe(P1);
  });

  test("contrast — the excess condition matters: two Tryndameres into a 12-Might Guard (16 − 12 = 4 excess < 5) conquer for 1 point only, no trigger points", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 5)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 12, name: "Big Guard" }, "guard")
      .unit(P2, "bf2", SPRITE, "sprite1")
      .unit(P1, "base", TRYNDAMERE, "trynd1")
      .unit(P1, "base", TRYNDAMERE, "trynd2")
      .build();
    await game.p1.move(["trynd1", "trynd2"], "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(6);
    expect(game.isOver()).toBe(false);
  });
});
