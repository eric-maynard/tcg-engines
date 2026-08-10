/**
 * Ruling 02726fcdd41c9fee — Ride the Wind (OGN-173 → ogn-173-298) · Chaos Action · [2][chaos]
 *   "Move a friendly unit and ready it."
 *
 * Q: Can you conquer and score a battlefield on your OPPONENT's turn if you controlled it at the start of their turn but
 *    lost control during that turn?
 * A: Yes — provided you have not already scored that battlefield this turn. You must actually LOSE control and then
 *    re-establish it (e.g. Ride the Wind a unit back in during a showdown and win); merely defending successfully is not
 *    a conquer.
 * Rules: 466.5 / 469.1 (conquer = gaining control), 471.2 (score a battlefield at most once per turn; on any player's
 *        turn), 471.2.c (keeping control through a defence is not a conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/**
 * P2's turn. P1 controls bf1 with a small Holder (2) and has Bruiser (6) in base + Ride the Wind ([2][chaos]).
 * P2: Raider (5) and Scout (1) in base; bf2 is open.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 6, name: "Bruiser" }, "bruiser")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 1, name: "Scout" }, "scout")
    .hand(P1, RIDE_THE_WIND, "ride");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Step 1–2: P2's Raider attacks bf1 and kills the Holder → P2 conquers bf1 (P1 has LOST control on P2's turn). */
async function p1LosesBf1(): Promise<Game> {
  const game = await board().build();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // controlled at the start of P2's turn
  await game.p2.move("raider", "bf1");
  await game.settle();
  expect(game.zoneOf("holder")).toBe("trash");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
  expect(game.p2.points()).toBe(1);
  expect(game.p1.points()).toBe(0);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 02726fcdd41c9fee — lose control on the opponent's turn, Ride the Wind back in, win: you conquer AND score on their turn", () => {
  test("step 3: later that turn P2 opens a showdown elsewhere (Scout → open bf2); on Focus P1 casts the ACTION Ride the Wind, sending the readied Bruiser into P2's bf1", async () => {
    const game = await p1LosesBf1();
    await game.p2.move("scout", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "ride")).toBe(true);
    await game.p1.cast("ride", { targets: "bruiser" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["battlefield-bf1", "battlefield-bf2"]);
    await game.p1.pick("battlefield-bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ride the Wind resolves
    expect(game.state("bruiser")).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  test("step 4: the bf2 showdown closes (P2 conquers bf2), then the staged combat at bf1 runs with P1 ATTACKING on P2's turn; Bruiser (6) kills Raider (5) → P1 re-takes bf1 = a Conquer, and scores 1 — on the opponent's turn", async () => {
    const game = await p1LosesBf1();
    await game.p2.move("scout", "bf2");
    await game.p2.passFocus();
    await game.p1.cast("ride", { targets: "bruiser" });
    await game.p1.pick("battlefield-bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Close the bf2 showdown; the bf1 combat then begins.
    for (let i = 0; i < 6 && !(showdown(game)?.battlefieldId === "bf1" && showdown(game)?.isCombatShowdown); i++) {
      await game.acting().pass();
    }
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p2.points()).toBe(2);
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("bruiser").combatRole).toBe("attacker");
    expect(game.turnPlayer()).toBe(P2); // still the opponent's turn
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1); // conquered and SCORED on P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling 02726fcdd41c9fee — nuances", () => {
  test("a successful DEFENCE is not a conquer: if P1 instead Rides Bruiser in as a reinforcement during the Raider's attack, the defenders win, P1 keeps bf1 and scores NOTHING", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, isCombatShowdown: true });
    await game.p2.passFocus();
    expect(game.p1.can("cast", "ride")).toBe(true);
    await game.p1.cast("ride", { targets: "bruiser" });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("battlefield-bf1");
    }
    await game.settle();
    expect(game.state("bruiser").zone).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash"); // 5 into 2 + 6
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 }); // never lost
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("once per turn: a battlefield P1 already scored this turn (held at the start of P1's turn) gives no second point when P1 loses and re-conquers it that same turn", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 6, name: "Bruiser" }, "bruiser")
      .unit(P2, "bf2", { might: 1, name: "Sentry" }, "sentry")
      .build();
    await game.advanceTurn(); // → P1's turn: P1 HOLDS bf1 and scores it
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // P1 walks the Holder home: with no P1 unit left, control of bf1 lapses (lost)…
    await game.p1.move("holder", "base");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    // …and Bruiser walks back in and re-establishes control: a conquer, but bf1 was already scored this turn → still 1.
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });
});
