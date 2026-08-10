/**
 * Ruling 6096f1dda915cc81 — Vanguard Captain (OGN-218 → ogn-218-298) · Unit · Order · [3][order] · 3 Might
 *   "[Legion] — When you play me, play two 1 [Might] Recruit unit tokens here."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · [1] — "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Opponent plays Vanguard Captain to a battlefield they control and I Gust it — what happens to the Recruit
 *    tokens? Does the timing matter?
 * A: Timing is everything. Gust AFTER the play effect resolved: the two Recruits stay (they are separate objects).
 *    Gust in REACTION to the play trigger: the Captain leaves before resolution; the ability's "here" needs its
 *    source still at that location, so it does nothing — no tokens are ever created.
 * Rules: 356.3.e.12 / 359.3.f.4 (location-based "here" needs the source's location on resolution), 186 (tokens are
 *        independent objects once created), Legion.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VANGUARD_CAPTAIN = "ogn-218-298";
const GUST = "ogn-169-298";
const DISCIPLINE = "ogn-058-298";

/**
 * P2's turn. P2 controls bf1 (Holder 4 there); P2: a free Pawn (to satisfy Legion), Vanguard Captain, Discipline;
 * [5] + [order]. P1: Gust + [1].
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Holder" }, "holder")
    .hand(P2, { cardType: "unit", energyCost: 0, might: 1, name: "Pawn" }, "pawn")
    .hand(P2, VANGUARD_CAPTAIN, "captain")
    .hand(P2, DISCIPLINE, "discipline")
    .resources(P2, { energy: 5, power: { order: 1 } })
    .hand(P1, GUST, "gust")
    .resources(P1, { energy: 1 });
}

function recruitsAt(game: Game, zone: string): string[] {
  return game.findAll({ name: "Recruit" }).filter((id) => game.zoneOf(id) === zone);
}

/** P2 plays the Pawn (another card this turn → Legion live), then the Captain to bf1; his play trigger is on the chain. */
async function captainPlayedTriggerPending(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("pawn", { to: "base" });
  await game.settle();
  await game.p2.play("captain", { to: "bf1" });
  expect(game.zoneOf("captain")).toBe("battlefield-bf1"); // the Captain entered the board first …
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "captain", controller: P2, triggered: true })]); // … then his play effect went on the chain
  expect(recruitsAt(game, "battlefield-bf1")).toEqual([]);
  return game;
}

describe("Ruling 6096f1dda915cc81 — Gust vs Vanguard Captain: before the play trigger resolves ⇒ no tokens; after ⇒ tokens stay", () => {
  test("Gust in the reaction window BEFORE the play effect resolves: Captain returns to hand, the 'here' ability loses its source's location and creates NO Recruit tokens", async () => {
    const game = await captainPlayedTriggerPending();
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "captain" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["captain", "gust"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("captain")).toBe("hand");
    expect(game.findAll({ name: "Recruit" }).filter((id) => game.zoneOf(id) !== "gone")).toEqual([]); // never created
    expect(game.p2.units("bf1")).toEqual(["holder"]);
    expect(game.violations()).toEqual([]);
  });

  test("Gust AFTER the play effect resolved: the two 1-Might Recruits were created at bf1 and REMAIN there when the Captain is bounced", async () => {
    const game = await captainPlayedTriggerPending();
    await game.settle(); // nobody responds → trigger resolves
    const recruits = recruitsAt(game, "battlefield-bf1");
    expect(recruits).toHaveLength(2);
    for (const r of recruits) {
      expect(game.state(r)).toMatchObject({ isToken: true, might: 1 });
    }
    // Give P1 a window on P2's turn: P2 casts Discipline, P1 responds with Gust on the Captain.
    await game.p2.cast("discipline", { targets: "holder" });
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "captain" });
    await game.settle();
    expect(game.zoneOf("captain")).toBe("hand");
    // Tokens are their own game objects: still at bf1.
    expect(recruitsAt(game, "battlefield-bf1").sort()).toEqual([...recruits].sort());
    expect(game.p2.units("bf1").sort()).toEqual(["holder", ...recruits].sort());
    expect(game.violations()).toEqual([]);
  });
});
