/**
 * Ruling 26c728e7e38d3db8 — Thrill of the Hunt (UNL-184 → unl-184-219) · Spell · Fury/Body · 2 · Reaction
 *   "Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost."
 *
 * Q: On my opponent's turn, if Thrill of the Hunt banishes and replays my ONLY unit at a battlefield back to
 *    that battlefield, do I score (Conquer) there?
 * A: No. The replayed unit is a pending chain item (354.2/354.3) that keeps the chain alive through the
 *    cleanup (330/331), so the turn stays in a Closed State and cleanup step 4 — lose control of empty
 *    battlefields — does not apply (190.4.c, 323.6). Control is never lost, so there is no Conquer (469.1);
 *    the owner then chooses the destination (359.2) and the unit lands on a battlefield you still control.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THRILL = "unl-184-219";
const DREDGE_UP = "ven-049-166"; // "Draw 1." — a plain 2-cost spell P2 casts so P1 may React on P2's turn

type PickD = Extract<Decision, { kind: "pick" }>;

/**
 * P2's turn (turn 3, main phase). P1 controls "home" with a single unit; P2 controls "away".
 * P1 holds Thrill of the Hunt with exactly its cost; P2 holds Dredge Up with exactly its cost.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .points(P1, 2)
    .points(P2, 2)
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("home", { controller: P1 })
    .battlefield("away", { controller: P2 })
    .unit(P1, "home", { might: 3, name: "Lone Hunter" }, "solo")
    .unit(P2, "away", { might: 4, name: "Enemy Guard" }, "guard")
    .hand(P1, THRILL, "thrill")
    .hand(P2, DREDGE_UP, "dredge");
}

describe("Ruling 26c728e7e38d3db8 — Thrill of the Hunt on your only unit at a battlefield, on the opponent's turn, does not score", () => {
  test("premise: it is P2's turn, P1 controls 'home' with exactly one unit, and P1 cannot start a chain itself (Reaction needs something to react to)", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.units("home")).toEqual(["solo"]);
    expect(game.gameState.battlefields.home?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });

  test("P2 casts a spell, P1 reacts with Thrill on 'solo': while the replay is pending, 'home' is empty but STILL P1's (closed state — 323.6/190.4.c do not apply), and the OWNER (P1) is asked for the destination", async () => {
    const game = await board().build();
    await game.p2.cast("dredge");
    await game.p2.passPriority();
    expect(game.p1.can("cast", "thrill")).toBe(true);
    await game.p1.cast("thrill", { targets: "solo" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "thrill"]);

    const r = await game.settle();
    // Thrill resolved: solo is banished, and its owner (P1) now chooses the battlefield to replay it to.
    expect(r.decision).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.zoneOf("solo")).toBe("banishment");
    expect(game.cardsAt("home")).toEqual([]);
    // Control never lapsed: the pending play keeps the turn in a Closed State.
    expect(game.gameState.battlefields.home?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    const keys = (r.decision as PickD).options.map((o) => o.key);
    expect(keys).toContain("battlefield-home");
  });

  test("choosing 'home' puts the unit back on a battlefield P1 already controls — no Conquer, no point (469.1); everything else resolves normally", async () => {
    const game = await board().build();
    await game.p2.cast("dredge");
    await game.p2.passPriority();
    await game.p1.cast("thrill", { targets: "solo" });
    const r = await game.settle();
    expect(r.decision).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.gameState.battlefields.home?.controller).toBe(P1);

    const p2HandBefore = game.p2.hand().length;
    await game.p1.pick("battlefield-home");
    await game.settle({ policy: "first" });

    expect(game.zoneOf("solo")).toBe("battlefield-home");
    expect(game.p1.units("home")).toEqual(["solo"]);
    expect(game.gameState.battlefields.home?.controller).toBe(P1);
    // No score from this sequence — P1 never (re)gained control, it simply kept it.
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(2);
    expect(game.gameState.scoredThisTurn[P1] ?? []).toEqual([]);
    // The rest of the chain finished: Thrill in trash, Dredge Up resolved (P2 drew 1).
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.p2.hand().length).toBe(p2HandBefore + 1);
    expect(game.chain()).toEqual([]);
    // Back to P2's open main phase.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
