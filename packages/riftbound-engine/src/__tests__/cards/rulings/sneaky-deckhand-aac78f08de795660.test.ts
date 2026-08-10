/**
 * Ruling aac78f08de795660 — Sneaky Deckhand (OGN-176 → ogn-176-298) · [3] · 2 Might · "You may play me to an open battlefield."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · [1] · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Does playing Sneaky Deckhand to an open battlefield earn a point?
 * A: Yes — if the Deckhand is still there when the showdown closes you conquer and score. Playing is not moving, but the unit
 *    still contests the battlefield. The opponent's window is the showdown: a Gust there sends it home and nothing is scored.
 * Rules: 170.11.c (open battlefield), 190.3.a (a unit arriving at a battlefield you don't control contests it), 344 (non-combat
 *        showdown at an uncontrolled battlefield), 469.1 (Conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SNEAKY_DECKHAND = "ogn-176-298";
const GUST = "ogn-169-298";

/** P1's turn with [3]; "open" is uncontrolled and empty. P2 holds Gust with [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 1 })
    .battlefield("open", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
    .hand(P1, SNEAKY_DECKHAND, "deckhand")
    .hand(P2, GUST, "gust");
}

const showdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).find((s) => s.active);

async function playedToOpen(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.option("playUnit", "deckhand")?.fields.find((f) => f.arg === "to")?.options).toContain("battlefield-open");
  await game.p1.play("deckhand", { to: "open" });
  expect(game.p1.energy()).toBe(0);
  expect(game.zoneOf("deckhand")).toBe("battlefield-open");
  return game;
}

describe("Ruling aac78f08de795660 — Sneaky Deckhand played to an open battlefield conquers it for a point unless answered", () => {
  test("the Deckhand arrives and CONTESTS the open battlefield: a non-combat showdown opens there (nothing scored yet, no combat role — it was played, not moved)", async () => {
    const game = await playedToOpen();
    expect(showdown(game)).toMatchObject({ battlefieldId: "open", isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // P1 has Focus first
    expect(game.gameState.battlefields.open).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0); // playing ≠ moving
  });

  test("nobody responds: the showdown closes, P1 takes control — a Conquer — and scores exactly 1 point", async () => {
    const game = await playedToOpen();
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.gameState.battlefields.open?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("deckhand")).toMatchObject({ isExhausted: true, location: "open", might: 2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the opponent's answer: with Focus in that showdown P2 Gusts the 2-Might Deckhand back to hand — the battlefield stays uncontrolled and P1 scores nothing", async () => {
    const game = await playedToOpen();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "deckhand" });
    await game.settle();
    await game.settle();
    expect(game.zoneOf("deckhand")).toBe("hand");
    expect(game.gameState.battlefields.open?.controller).toBe(null);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
