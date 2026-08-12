/**
 * Ruling b004b7d4b8b4ef73 — Promising Future (OGN-115 → ogn-115-298) · Mind · [5][mind]
 *     "Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest.
 *      Starting with the next player, each player plays those cards, ignoring Energy costs."
 *   × Legion Rearguard (OGN-010 → ogn-010-298) · 2 Might · "[Accelerate] (You may pay [1][fury] as an additional
 *     cost to have me enter ready.)"
 *
 * Q: (1) Can a unit's [Accelerate] cost be paid when the unit is played from Promising Future rather than from
 *    hand? (2) If I conquer both battlefields on my turn but the opponent takes one back during that same turn,
 *    do I still win?
 * A: (1) Yes — [Accelerate] is an additional cost of PLAYING the unit, wherever it is played from. (2) Yes — the
 *    Final Score rule asks whether you conquered every battlefield during your turn, not whether you still hold
 *    them at the end.
 * Rules: 356.1 (additional costs apply to any play), 419.3 (playing from banishment ignoring the Energy cost),
 *        471.1.b.1 (Final Point by conquest = every battlefield scored this turn), 323.6 (control lapses when a
 *        battlefield is left empty).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PROMISING_FUTURE = "ogn-115-298";
const LEGION_REARGUARD = "ogn-010-298";
const GUST = "ogn-169-298";
const U = (n: number) => ({ cardType: "unit", energyCost: 3, might: n, name: `Future ${n}` });

/** P1's turn with [5][mind] for Promising Future plus [1][fury] for the [Accelerate]. Rearguard sits on top of P1's deck. */
function pfBoard() {
  return scenario()
    .resources(P1, { energy: 6, power: { fury: 1, mind: 1 } })
    .deck(P1, [LEGION_REARGUARD, U(2), U(3), U(4), U(5), U(6)], ["rearguard", "a2", "a3", "a4", "a5", "a6"])
    .deck(P2, [U(2), U(3), U(4), U(5), U(6), U(7)], ["b1", "b2", "b3", "b4", "b5", "b6"])
    .hand(P1, PROMISING_FUTURE, "pf");
}

/** Cast Promising Future, banish the Rearguard on P1's side, and walk to the [Accelerate] question. */
async function toAccelerateQuestion(game: Game): Promise<Decision> {
  await game.p1.cast("pf");
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "yes-no") {
      return d;
    }
    if (d.kind === "pick") {
      const want = d.options.find((o) => (o.card ?? o.key) === "rearguard") ?? d.options[0]!;
      await game.seat(d.seat).pick(want.key);
      continue;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  throw new Error("no [Accelerate] question was asked");
}

/** Pass focus/priority for whoever is asked until the position is open again. */
async function passUntilOpen(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "action" && (d.context === "showdown" || d.context === "chain")) {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
}

describe("Ruling b004b7d4b8b4ef73 — [Accelerate] can be paid on a play from Promising Future, and the Final Point needs conquests, not lasting control", () => {
  test("part 1: playing the banished Legion Rearguard offers its [Accelerate] as an additional cost", async () => {
    const game = await pfBoard().build();
    const d = await toAccelerateQuestion(game);
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d.prompt).toContain("Accelerate");
  });

  test("…paying it has the unit enter READY, even though the play came from banishment and not from hand", async () => {
    const game = await pfBoard().build();
    await toAccelerateQuestion(game);
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("rearguard")).toBe("base");
    expect(game.state("rearguard").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } }); // [5][mind] + [1][fury]
    expect(game.violations()).toEqual([]);
  });

  test("…declining it plays the same unit exhausted and leaves the [1][fury] unspent", async () => {
    const game = await pfBoard().build();
    await toAccelerateQuestion(game);
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("rearguard")).toBe("base");
    expect(game.state("rearguard").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, mind: 0 } });
  });

  test("part 2: P1 conquers bf1 (6 → 7), the opponent Gusts P1's holder off it so P1 no longer controls it, and P1's second conquest still wins the game", async () => {
    const game = await scenario()
      .turn(3)
      .victoryScore(8)
      .points(P1, 6)
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Guard" }, "guard")
      .unit(P2, "bf2", { might: 1, name: "Sentry" }, "sentry")
      .unit(P1, "base", { might: 3, name: "Striker" }, "striker")
      .unit(P1, "base", { might: 3, name: "Ranger" }, "ranger")
      .hand(P1, { abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }], cardType: "spell", domain: "mind", energyCost: 1, name: "Ponder", timing: "standard" }, "ponder")
      .hand(P2, GUST, "gust")
      .build();
    // first conquest
    await game.p1.move("striker", "bf1");
    await passUntilOpen(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    // P2 uses a Reaction window to bounce the holder: bf1 stops being P1's
    await game.p1.cast("ponder");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "striker" });
    await game.settle();
    expect(game.zoneOf("striker")).toBe("hand");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(7);
    // second conquest, same turn ⇒ every battlefield scored this turn ⇒ the Final Point lands
    await game.p1.move("ranger", "bf2");
    await passUntilOpen(game);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });
});
