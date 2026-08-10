/**
 * Ruling 1cc4bf2c34ed32af — Gust (OGN-169 → ogn-169-298) · Reaction · Chaos · [1] · "Return a unit at a battlefield with
 *     3 [Might] or less to its owner's hand."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Action · Chaos · [2]+[chaos] · "Move a friendly unit and ready it."
 *
 * Q: On my opponent's turn, can I Gust my own unit off battlefield A (leaving it open) and then Ride the Wind another unit
 *    from battlefield B onto A to score an extra conquer point?
 * A: Yes. A battlefield scores once per turn, and this is a different turn; once A becomes uncontrolled, taking it again
 *    is a conquer. But Gust is a Reaction — it needs something to react to (e.g. a showdown), it can't be fired "out of
 *    nowhere". And if you Gust while DEFENDING that battlefield in a showdown, you never lost control of it, so no point.
 * Rules: 441–444 (scoring: conquer = gaining control; once per battlefield per turn), 190.4 (control lapses when your last
 *        unit leaves outside combat), 340–341 (Reaction/Action timing; focus in showdowns), 464–467 (combat, hold vs conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const RIDE_THE_WIND = "ogn-173-298";

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P2's turn 3; P1 already has 2 points (scored A and B on their own turn). P1 holds bfA with Small (2) and bfB with
 * Runner (4) + Anchor (4); Gust + Ride the Wind in hand with exactly [3] + [chaos]. P2's Raider (3) is in base.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .points(P1, 2)
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfA", { might: 2, name: "Small" }, "small")
    .unit(P1, "bfB", { might: 4, name: "Runner" }, "runner")
    .unit(P1, "bfB", { might: 4, name: "Anchor" }, "anchor")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, GUST, "gust")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Resolve the current chain by passing priority back and forth. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

/** With focus, P1 Rides the Wind `runner` and answers the destination prompt with bfA. */
async function rideRunnerToA(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("rtw", { targets: "runner" });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 }); // "Move a friendly unit" — P1 chooses where
  expect((d as Pick).options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bfA"]);
  await game.p1.pick("battlefield-bfA");
  await resolveChain(game);
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.state("runner")).toMatchObject({ isReady: true, zone: "battlefield-bfA" });
}

describe("Ruling 1cc4bf2c34ed32af — Gust your own unit off A on the opponent's turn, then Ride the Wind onto the now-open A: a real conquer", () => {
  test("Gust can't be fired 'out of nowhere': in P2's quiet main phase P1 has no play at all", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.legal()).toEqual([]);
    expect(game.p1.can("cast", "gust")).toBe(false);
    const r = await game.p1.try((p) => p.cast("gust", { targets: "small" }));
    expect(r.ok).toBe(false);
  });

  test("with something to react to (P2 attacks bfB → showdown), P1 Gusts Small off bfA: Small returns to hand and bfA — outside that combat — becomes UNCONTROLLED", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bfB");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "small" });
    expect(game.p1.energy()).toBe(2);
    await resolveChain(game);
    expect(game.zoneOf("small")).toBe("hand");
    expect(game.p1.hand()).toContain("small");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(2);
  });

  test("then, holding focus again, P1 Rides the Runner from bfB onto the open bfA; the bfB combat finishes first (Anchor 4 kills Raider 3), then bfA is conquered — P1 scores a conquer point on the OPPONENT's turn (2 → 3)", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bfB");
    await game.p2.passFocus();
    await game.p1.cast("gust", { targets: "small" });
    await resolveChain(game);
    // The chain closed → focus went to P2; P2 passes and P1 holds focus on an empty chain: Action timing.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    await rideRunnerToA(game);
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.gameState.battlefields.bfB?.contested).toBe(true); // the current combat is still unresolved
    expect(game.p1.points()).toBe(2); // nothing scores until the showdowns end
    await game.settle(); // bfB's combat resolves; the follow-up showdown at bfA is handed back once
    expect(game.zoneOf("raider")).toBe("trash"); // bfB: 3 into Anchor's 4
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    if (game.gameState.battlefields.bfA?.contested) {
      expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
      await game.settle(); // both pass at bfA → P1 takes it
    }
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.zoneOf("runner")).toBe("battlefield-bfA");
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bfA"]);
    expect(game.gameState.scoredThisTurn?.[P1]).toEqual(["bfA"]);
    expect(game.p1.points()).toBe(3);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance — Gusting while DEFENDING that very battlefield doesn't work: P2 attacks bfA, P1 Gusts Small off it and Rides the Runner in as a defender; P1 never lost control of bfA, wins the combat and merely HOLDS — no point", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bfA");
    await game.p2.passFocus();
    await game.p1.cast("gust", { targets: "small" });
    await resolveChain(game);
    expect(game.zoneOf("small")).toBe("hand");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P2, controller: P1 }); // still P1's mid-combat
    await game.p2.passFocus();
    await rideRunnerToA(game);
    expect(game.state("runner").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 3 into Runner's 4
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.conqueredThisTurn?.[P1] ?? []).toEqual([]);
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
