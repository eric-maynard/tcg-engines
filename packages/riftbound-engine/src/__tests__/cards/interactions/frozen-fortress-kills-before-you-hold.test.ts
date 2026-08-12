/**
 * Interaction: a battlefield that damages its own holder BEFORE the Scoring Step.
 *
 *   Frozen Fortress  (unl-212-219) Battlefield —
 *     "At the start of each player's Beginning Phase, deal 1 to each unit here.
 *      (This happens before scoring.)"
 *   Watchful Sentry  (ogn-096-298) Unit · Mind · [2] · 1 Might — "[Deathknell] — Draw 1."
 *   Wraith of Echoes (ogn-118-298) Unit · Mind · [6]+[mind] · 5 Might —
 *     "The first time a friendly unit dies each turn, draw 1."
 *
 * Q: P1 is on 7 of 8 and controls Frozen Fortress. NO-side: P1's ONLY unit there is the 1-Might
 *    Sentry, with the Wraith in P1's base. P1's Beginning Phase begins. Does the ping merely MARK
 *    lethal and leave the Sentry standing until scoring — so P1 still occupies the battlefield,
 *    Holds, reaches 8 and wins before the Sentry can die — or does the Sentry actually die first,
 *    costing P1 the Hold? Does P1 keep control? Do the Deathknell and Wraith draws happen?
 *    YES-side: a 2-Might body that survives the ping.
 *
 * A: NO-side. Marking damage is a status change, so 319.7 makes a Cleanup Outstanding at once, and
 *    that Cleanup runs its tasks in order: task 1 (323.1) sees P1 on 7 — no win; task 3a (323.4/808)
 *    queues the Deathknell; task 3b (323.5) trashes the Sentry (and the Wraith's "first friendly unit
 *    dies each turn" fires). 322 repeats Cleanups until nothing changes; P1 draws 2. THEN the Scoring
 *    Step (315.2.b) finds no P1 unit at Frozen Fortress ⇒ no Hold, no 8th point, and 323.6 strips
 *    P1's control at the next Open-state Cleanup. The win check never gets to "protect" a unit from a
 *    death queued in the same Cleanup, because the death Cleanup happens before scoring, not after.
 *    YES-side: the 2-Might unit takes 1, is not lethal, survives; the Scoring Step Holds 7→8 and the
 *    Cleanup after it hits task 1 with P1 ≥ 8 and ahead ⇒ P1 wins (194.2/472), no Deathknell, no
 *    Wraith draw, hand unchanged. The Fortress is symmetric: it pings at EACH player's Beginning
 *    Phase, so P2's units there take 1 on P2's turn too.
 *
 * Rules: 315.2 / 315.2.b (Beginning Phase then the Scoring Step) · 319.6 / 319.7 (a status change
 * makes a Cleanup Outstanding) · 322 (repeat Cleanups) · 323.1 (task 1 = win check) · 323.4 / 808
 * (3a Deathknell) · 323.5 (3b to the trash) · 323.6 (control lost with no unit present) ·
 * 469.2 / 194.2 / 472 (Hold, victory score, winning) · 808 (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FROZEN_FORTRESS = "unl-212-219";
const WATCHFUL_SENTRY = "ogn-096-298";
const WRAITH_OF_ECHOES = "ogn-118-298";

const bf1 = (game: Game) => game.gameState.battlefields.bf1;

/** P2's turn about to end; P1 sits on 7 of 8 holding Frozen Fortress with a single body. */
function board(holder: "sentry" | "bulwark") {
  const s = scenario()
    .turn(2)
    .active(P2)
    .points(P1, 7)
    .victoryScore(8)
    .battlefield("bf1", { controller: P1, def: FROZEN_FORTRESS, inert: false })
    .unit(P1, "base", WRAITH_OF_ECHOES, "wraith");
  return holder === "sentry"
    ? s.unit(P1, "bf1", WATCHFUL_SENTRY, "sentry")
    : s.unit(P1, "bf1", { might: 2, name: "Bulwark" }, "sentry");
}

describe("Frozen Fortress — the ping kills before the Scoring Step", () => {
  // ── NO-side: the 1-Might holder dies to its own battlefield ─────────────────────────────────

  test("NO-side: the Beginning-Phase ping is lethal on the 1-Might Sentry and the 319.7 Cleanup TRASHES it — it does not linger until scoring", async () => {
    const game = await board("sentry").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("sentry")).toBe("trash"); // 323.5 task 3b
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("NO-side: task 1 of that Cleanup sees 7, not 8 — P1 does NOT Hold at the Scoring Step, gains no point and the game is still live", async () => {
    const game = await board("sentry").build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(7); // 315.2.b found no unit there
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.phase()).toBe("main"); // the turn carried on past scoring/channel/draw
  });

  test("NO-side: both death riders fire in that same Cleanup — the Sentry's Deathknell and the Wraith's 'first friendly unit dies each turn' each draw P1 a card (2 on top of the turn's own draw)", async () => {
    const game = await board("sentry").build();
    const before = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.p1.hand()).toHaveLength(before + 1 + 2); // 315.4 draw + Deathknell + Wraith
  });

  test("NO-side: with no unit of P1's left there, 323.6 strips P1's control of Frozen Fortress at the next Open-state Cleanup", async () => {
    const game = await board("sentry").build();
    expect(bf1(game).controller).toBe(P1);
    await game.advanceTurn();
    expect(bf1(game)).toMatchObject({ contested: false, controller: null });
  });

  // ── YES-side: a body that survives the ping ─────────────────────────────────────────────────

  test("YES-side: a 2-Might holder takes 1 (not lethal), survives every Cleanup, Holds at the Scoring Step and takes P1 from 7 to 8 — the win lands at the Cleanup after the Hold (194.2/472)", async () => {
    const game = await board("bulwark").build();
    const before = game.p1.hand().length;
    await game.advanceTurn();
    expect(game.state("sentry").damage).toBe(1);
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    // The game ended in the Beginning Phase's scoring — the Draw Step never ran, and no death rider
    // fired, so P1's hand is exactly what it was.
    expect(game.phase()).toBe("beginning");
    expect(game.p1.hand()).toHaveLength(before);
    expect(bf1(game).controller).toBe(P1);
  });

  // ── symmetry: "each player's Beginning Phase" ───────────────────────────────────────────────

  test("the Fortress is symmetric — a 1-Might unit of P2's dies to the ping on P2'S OWN Beginning Phase, and P2 likewise fails to Hold", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .points(P2, 3)
      .battlefield("bf1", { controller: P2, def: FROZEN_FORTRESS, inert: false })
      .unit(P2, "bf1", WATCHFUL_SENTRY, "theirs")
      .build();
    await game.advanceTurn(); // P1 ends → P2's Beginning Phase
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.p2.points()).toBe(3); // no Hold
    expect(bf1(game).controller).toBeNull();
  });

  test("a survivor is pinged again on the OTHER player's Beginning Phase — 1 fresh damage each turn (the Expiration Step healed the previous point)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .battlefield("bf1", { controller: P2, def: FROZEN_FORTRESS, inert: false })
      .unit(P2, "bf1", { might: 4, name: "Garrison" }, "theirs")
      .build();
    await game.advanceTurn(); // P2's Beginning Phase
    expect(game.state("theirs").damage).toBe(1);
    await game.advanceTurn(); // P1's Beginning Phase — pings again, on the other player's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("theirs").damage).toBe(1);
    expect(game.zoneOf("theirs")).toBe("battlefield-bf1");
  });
});
