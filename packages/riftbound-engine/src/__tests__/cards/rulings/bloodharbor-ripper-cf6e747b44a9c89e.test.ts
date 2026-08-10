/**
 * Ruling cf6e747b44a9c89e — Bloodharbor Ripper (UNL-185 → unl-185-219) · Legend (Pyke)
 *     "[1], [Exhaust]: Return a friendly unit at a battlefield to its owner's hand. Play a Gold gear token exhausted."
 *   × Star-Crossed (UNL-128 → unl-128-219) · Reaction · [3][chaos] "Return a friendly unit and an enemy unit to their owners' hands."
 *   × Gold token (SFD-T03)
 *
 * Q: What if the same friendly unit is targeted by the Ripper's activated ability and by Star-Crossed?
 * A: Legal. Star-Crossed (on top) resolves first and returns the friendly unit and an enemy unit. The Ripper's ability
 *    then resolves: its return instruction fails (illegal target), but the Gold token is still played exhausted — that
 *    instruction is independent ("do as much as you can").
 * Rules: 340.1 (LIFO), 359.3.e.2/5 (a target that left the board is illegal → its instruction is skipped),
 *        359.3.e.6 + DAMAYC (independent instructions still execute).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLOODHARBOR_RIPPER = "unl-185-219";
const STAR_CROSSED = "unl-128-219";

/** P1's turn (Pyke legend) with [1] + [3][chaos]. P1's Diver (3) and Buddy (2) at P1's bf1; P2's Sentry (2) at P2's bf2. Star-Crossed in P1's hand. */
function board() {
  return scenario()
    .legend(P1, BLOODHARBOR_RIPPER, "ripper")
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Diver" }, "diver")
    .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .hand(P1, STAR_CROSSED, "star");
}

const goldOf = (game: Game) => game.p1.gear().filter((g) => game.state(g).name === "Gold");

/** Activate the Ripper at the Diver (target fixed at finalization), then — still holding priority — Star-Crossed the Diver + Sentry. */
async function ripperThenStarCrossed(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("ripper", 0, { targets: "diver" });
  expect(game.p1.energy()).toBe(3);
  expect(game.state("ripper").isExhausted).toBe(true);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ripper", targets: ["diver"] })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "star")).toBe(true);
  await game.p1.cast("star", { targets: ["diver", "sentry"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ripper", "star"]);
  return game;
}

describe("Ruling cf6e747b44a9c89e — Star-Crossed steals the Ripper's target: the return whiffs but the Gold is still made", () => {
  test("control: unanswered, the Ripper's ability returns the Diver to hand AND plays an exhausted Gold token", async () => {
    const game = await board().build();
    await game.p1.activate("ripper", 0, { targets: "diver" });
    await game.settle();
    expect(game.zoneOf("diver")).toBe("hand");
    expect(goldOf(game)).toHaveLength(1);
    expect(game.state(goldOf(game)[0]!)).toMatchObject({ isExhausted: true, isToken: true });
  });

  test("the same friendly unit may be chosen by both: Star-Crossed goes on top of the Ripper's ability naming Diver + Sentry", async () => {
    await ripperThenStarCrossed();
  });

  test("Star-Crossed resolves first (LIFO): Diver → P1's hand, Sentry → P2's hand; the Ripper's item still waits naming the Diver", async () => {
    const game = await ripperThenStarCrossed();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("diver")).toBe("hand");
    expect(game.zoneOf("sentry")).toBe("hand");
    expect(game.p2.hand()).toContain("sentry");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ripper", targets: ["diver"] })]);
    expect(goldOf(game)).toEqual([]); // nothing from the Ripper yet
  });

  test("then the Ripper's ability resolves: the return instruction fails (Diver already left the board; Buddy is NOT bounced instead) but an exhausted Gold token IS still played", async () => {
    const game = await ripperThenStarCrossed();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("diver")).toBe("hand");
    expect(game.zoneOf("buddy")).toBe("battlefield-bf1"); // no retarget
    const gold = goldOf(game);
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0]!)).toMatchObject({ controller: P1, isExhausted: true, isToken: true, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
