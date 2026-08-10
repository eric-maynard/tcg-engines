/**
 * Ruling e0d3ab33ac1af9c1 — Sprite Mother (OGN-106 → ogn-106-298) "When you play me, play a ready 3 [Might] Sprite unit
 *   token with [Temporary] here."   × Sprite token (OGN-274 → ogn-274-298) "[Temporary] (Kill me at the start of your
 *   Beginning Phase, before scoring.)"   × Shen, Kinkou (OGN-241 → ogn-241-298) · 3+[order] · [Reaction] "(… including
 *   to a battlefield you control.)" [Shield 2] [Tank]
 *
 * Q: A player at 7 points holds a battlefield with only a Sprite (from Sprite Mother). At the start of their Beginning
 *    Phase the Temporary trigger fires there; in response they play Shen to that battlefield as a Reaction. Do they win
 *    at the hold step?
 * A: Yes. Shen resolves before the Temporary kill, so when the Sprite dies Shen is still present: control is kept,
 *    the hold in the Beginning Phase scores the 8th point, and they win.
 * Rules: 816 (Temporary — a Beginning-Phase trigger on the chain), 340 (LIFO), 190.4 (control needs a unit), 315.2.b
 *        (hold scoring), 471 (winning at the Victory Score).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_MOTHER = "ogn-106-298";
const SPRITE = "ogn-274-298";
const SHEN_KINKOU = "ogn-241-298";

/**
 * End of P2's turn. P1 (7 points, victory at 8): Sprite Mother in base, her Sprite token ALONE holding bf1, Shen in hand,
 * four Order runes (3 to exhaust + 1 to recycle for [order]). P2 holds bf2 with a Guard.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .points(P1, 7)
    .victoryScore(8)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", SPRITE_MOTHER, "mother")
    .unit(P1, "bf1", SPRITE, "sprite")
    .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
    .runes(P1, "order", 4)
    .hand(P1, SHEN_KINKOU, "shen");
}

/** P2 ends the turn → P1's Beginning Phase opens with the Sprite's Temporary trigger on the chain. */
async function atTemporaryTrigger(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true })]);
  expect(game.zoneOf("sprite")).toBe("battlefield-bf1");
  expect(game.p1.points()).toBe(7); // scoring has not happened yet ("before scoring")
  return game;
}

describe("Ruling e0d3ab33ac1af9c1 — Shen played in response to the Sprite's Temporary trigger keeps the battlefield and scores the winning hold", () => {
  test("P1 has priority on the Temporary trigger and may pay for and play Shen as a Reaction TO bf1 (a battlefield P1 controls); Shen goes on top of the chain", async () => {
    const game = await atTemporaryTrigger();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.tapRunes(3);
    await game.p1.recycleRune();
    expect(game.p1.resources()).toEqual({ energy: 3, power: { order: 1 } });
    expect(game.p1.can("play", "shen")).toBe(true);
    const to = game.p1.option("playUnit", "shen")?.fields.find((f) => f.name === "location")?.options ?? [];
    expect(to.map(String)).toContain("battlefield-bf1");
    await game.p1.play("shen", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1"); // trigger still waiting under Shen
  });

  test("LIFO: Shen lands at bf1 first, THEN the Sprite dies to Temporary — bf1 never empties, P1 keeps control, the hold step scores 7 → 8 and P1 WINS", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.tapRunes(3);
    await game.p1.recycleRune();
    await game.p1.play("shen", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.zoneOf("sprite")).toBe("gone"); // token killed by Temporary ceased to exist
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no Shen: the lone Sprite dies before scoring, bf1's control lapses, P1 stays at 7 and the game goes on", async () => {
    const game = await atTemporaryTrigger();
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.zoneOf("shen")).toBe("hand");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
  });
});
