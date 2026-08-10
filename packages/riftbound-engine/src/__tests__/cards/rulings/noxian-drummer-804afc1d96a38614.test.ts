/**
 * Ruling 804afc1d96a38614 — Noxian Drummer (OGN-222 → ogn-222-298) · 3 Might · "When I move to a battlefield, play a 1 [Might] Recruit unit
 *     token here."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · Action [2] · "Move a unit from a battlefield to its base."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction [1] · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: The Drummer moves to a battlefield; the opponent responds to her trigger with Fight or Flight / Gust. Does the Recruit still
 *    arrive at the battlefield?
 * A: The trigger still resolves, but "here" is read on resolution: returned to hand (Gust) → no token at all; moved to base (Fight or
 *    Flight) → the token is played in base; left alone → at the battlefield.
 * Rules: 359.3.f.1–2 ("here" is a referent evaluated on execution; null → ignored), 383 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOXIAN_DRUMMER = "ogn-222-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const GUST = "ogn-169-298";

/**
 * P1's turn. Ready Drummer in P1's base; bf1 is P2's with a 5-Might Wall. P2: [3] and Gust in hand (the Fight or Flight case hides it
 * at bf1 instead — an [Action] can only answer a trigger on P1's turn when flipped from hidden).
 */
function board() {
  return scenario()
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "base", NOXIAN_DRUMMER, "drummer")
    .hand(P2, GUST, "gust");
}

const recruits = (game: Game) => game.findAll({ name: "Recruit", owner: P1 });

async function drummerMoves(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("drummer", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drummer", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 804afc1d96a38614 — the Drummer's Recruit is played wherever 'here' is when the trigger resolves", () => {
  test("control: unanswered, the Recruit token is played at bf1 next to the Drummer", async () => {
    const game = await drummerMoves();
    await game.p2.passPriority();
    expect(recruits(game)).toHaveLength(1);
    expect(game.locationOf(recruits(game)[0]!)).toBe("bf1");
    expect(game.locationOf("drummer")).toBe("bf1");
  });

  test("Gust in response (Drummer is a 3-Might unit at a battlefield): she returns to hand first; the trigger then resolves with no 'here' → NO token anywhere", async () => {
    const game = await drummerMoves();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "drummer" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["drummer", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("drummer")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["drummer"]); // the trigger is still there and will resolve
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(recruits(game)).toEqual([]);
    expect(game.p1.units()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("Fight or Flight (flipped from HIDDEN at bf1 — its only Reaction-speed route on P1's turn) in response: the Drummer is moved to base first; the trigger then resolves with 'here' = P1's base → the Recruit is played in BASE, none at bf1", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
      .unit(P1, "base", NOXIAN_DRUMMER, "drummer")
      .build();
    await game.p1.move("drummer", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drummer", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof", { answers: ["drummer"] });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("drummer");
    }
    game.clearScript(P2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["drummer", "fof"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Fight or Flight resolves: Drummer → P1's base
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("drummer")).toBe("base");
    expect(game.chain().some((c) => c.cardId === "drummer" && c.triggered)).toBe(true); // the original trigger is still pending
    expect(recruits(game)).toEqual([]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(recruits(game)).toHaveLength(1);
    expect(game.locationOf(recruits(game)[0]!)).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
