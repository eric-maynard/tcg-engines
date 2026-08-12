/**
 * Ruling 492522881f5f11de — Sprite (OGN-274 → ogn-274-298) · 3 Might · Fae
 *     "[Temporary] (Kill me at the start of your Beginning Phase, before scoring.)"
 *   × Soulspinner (VEN-123 → ven-123-166) · [3] · 3 Might · "[Ambush] (You may play me as a [Reaction] to a
 *     battlefield where you have units.)"
 *
 * Q: My only unit at a battlefield is a [Temporary] Sprite. Can I react to its Beginning-Phase death
 *    trigger with an [Ambush] unit, and do I still get the Hold point?
 * A: Yes. [Temporary] is a triggered ability: it goes on the chain and opens a priority window. Play the
 *    [Ambush] unit there; LIFO it resolves FIRST, arriving while the Sprite is still alive, so you never
 *    stop having a unit at that battlefield. Control never lapses and the Hold point is scored normally.
 * Rules: 816 ([Temporary] is a trigger), 822.1.b ([Ambush]: play as a [Reaction] to a battlefield where you
 *        have units), 340.1 (LIFO), 323.6 / 190.4 (control lapses only at a Cleanup with no unit there),
 *        471.3 (Hold is scored in your Beginning Phase), 186.1 (a dead token ceases to exist).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const SOULSPINNER = "ven-123-166";

/** End of P2's turn 3. P1 controls bf1 with a lone [Temporary] Sprite and holds an [Ambush] unit + runes. */
function board(withAmbush = true) {
  let s = scenario()
    .turn(3)
    .active(P2)
    .victoryScore(20)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SPRITE, "sprite");
  if (withAmbush) {
    s = s.runes(P1, "fury", 4).hand(P1, SOULSPINNER, "spinner");
  }
  return s;
}

/** P2 ends the turn → P1's Beginning Phase; the Sprite's [Temporary] trigger is on the chain. */
async function atTemporaryTrigger(withAmbush = true): Promise<Game> {
  const game = await board(withAmbush).build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  return game;
}

describe("Ruling 492522881f5f11de — [Ambush] in response to a [Temporary] death keeps the battlefield and the Hold point", () => {
  test("[Temporary] uses the chain: the Sprite is still alive, P1 holds priority, and no Hold has been scored yet", async () => {
    const game = await atTemporaryTrigger();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true })]);
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.points()).toBe(0);
  });

  test("[Ambush] is playable in that window (to the battlefield where P1 has the Sprite)", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.tapRunes(3);
    expect(game.p1.can("play", "spinner")).toBe(true);
    await game.p1.play("spinner", { to: "bf1" });
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1"); // the Temporary trigger has not resolved yet
  });

  test("ruling: the Ambush unit arrives first, so P1 never loses the battlefield — the Sprite then dies and P1 still scores the Hold", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.tapRunes(3);
    await game.p1.play("spinner", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("spinner")).toBe("battlefield-bf1");
    expect(["gone", "trash"]).toContain(game.zoneOf("sprite"));
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });

  test("contrast — passing instead: the Sprite dies with nothing to replace it, control lapses and no Hold point is scored", async () => {
    const game = await atTemporaryTrigger(false);
    await game.settle();
    expect(["gone", "trash"]).toContain(game.zoneOf("sprite"));
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — holding the Ambush unit back and only passing the trigger through loses it too (the window is the one chance)", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.passPriority();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.zoneOf("spinner")).toBe("hand");
  });
});
