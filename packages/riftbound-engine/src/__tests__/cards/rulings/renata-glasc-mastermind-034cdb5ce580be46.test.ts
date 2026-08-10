/**
 * Ruling 034cdb5ce580be46 — Renata Glasc, Mastermind (SFD-088 → sfd-088-221) · Mind Champion Unit · [5] · 4 Might
 *   "[1][mind]: Draw 1.  [4][mind][mind][mind][mind], [Exhaust]: Score 1 point.  Use my abilities only while I'm at a battlefield."
 *
 * Q: Can Renata's "Score 1 point" win the game on your turn?
 * A: Yes. It is an activated ability: pay [4] + 4 mind + exhaust her, it goes on the chain (Closed state — the opponent may
 *    React), and on resolution you score 1. Points from a non-conquer/hold source are not bound by the "final point via
 *    conquer needs every battlefield" restriction, so at 7 it takes you to 8 and you win immediately.
 * Rules: 377.3 (activated abilities use the chain), 466.1.a.1 (other point sources exempt from conquer/hold limits),
 *        471.1.b (final-point conquer restriction), 467 (reach the Victory Score ⇒ win).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RENATA = "sfd-088-221";
const DISCIPLINE = "ogn-058-298"; // P2's Reaction witness

/** P1's turn at `points`, Renata READY at P1's bf1, exactly [4] + 4 mind. P2 holds bf2, has Discipline + [2]. */
function board(points: number) {
  return scenario()
    .points(P1, points)
    .points(P2, 3)
    .resources(P1, { energy: 4, power: { mind: 4 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", RENATA, "renata")
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .hand(P2, DISCIPLINE, "disc");
}

describe("Ruling 034cdb5ce580be46 — Renata's activated 'Score 1 point' can deliver the winning point", () => {
  test("at 7 points: activating pays [4]+4 mind and exhausts her, and puts an ABILITY on the chain — Closed state, P2 gets priority and could React; nothing scored yet", async () => {
    const game = await board(7).build();
    expect(game.p1.can("activate", "renata")).toBe(true);
    await game.p1.activate("renata", 1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.state("renata").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "renata", controller: P1, triggered: false, type: "ability" })]);
    expect(game.p1.points()).toBe(7);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc")).toBe(true); // a Reaction is legal in this window
  });

  test("both pass → it resolves: P1 scores 1 (7 → 8 = Victory Score) and WINS immediately, on P1's turn, with more points than P2", async () => {
    const game = await board(7).build();
    await game.p1.activate("renata", 1);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast (471.1.b): at 7, CONQUERING a single battlefield does not give the 8th point (P1 has not scored every battlefield) — the restriction Renata's ability is exempt from", async () => {
    const game = await scenario()
      .points(P1, 7)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 1, name: "Keeper" }, "keeper")
      .unit(P1, "base", { might: 5, name: "Bruiser" }, "bruiser")
      .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
      .build();
    await game.p1.move("bruiser", "bf2");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1); // conquered…
    expect(game.p1.points()).toBe(7); // …but no final point from a lone conquer
    expect(game.isOver()).toBe(false);
  });

  test("below the line it is just a point: at 5 → 6, game continues; and 'only while I'm at a battlefield' — from base the ability is not available", async () => {
    const game = await board(5).build();
    await game.p1.activate("renata", 1);
    await game.settle();
    expect(game.p1.points()).toBe(6);
    expect(game.isOver()).toBe(false);

    const inBase = await scenario()
      .points(P1, 7)
      .resources(P1, { energy: 4, power: { mind: 4 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", RENATA, "renata")
      .build();
    expect(inBase.p1.can("activate", "renata")).toBe(false);
    expect(inBase.p1.legal().some((o) => o.verb === "activate" && o.card === "renata")).toBe(false);
  });
});
