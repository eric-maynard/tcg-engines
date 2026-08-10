/**
 * Ruling 6403372a9a5120d1 — Sprite token (OGN-274 → ogn-274-298) · 3 Might "[Temporary] (Kill me at the start of your
 *     Beginning Phase, before scoring.)"
 *   × Sprite Call (OGN-094 → ogn-094-298) · [Hidden][Action] [3] "Play a ready 3 [Might] Sprite unit token with [Temporary]."
 *
 * Q: A Sprite holds a battlefield and Sprite Call is hidden there. What happens if I react to the Temporary trigger by
 *    playing the Sprite Call?
 * A: The new Sprite is played (there), then the old Sprite dies, then the hold point is scored; the new Sprite lasts until
 *    the beginning of your next turn.
 * Rules: 816 (Temporary trigger at start of Beginning Phase), 336.1 (LIFO), 811 (hidden card played as a Reaction, here),
 *        316 (hold scoring follows the beginning-of-turn triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const SPRITE_CALL = "ogn-094-298";

/** End of P2's turn 3. P1 holds bf1 with a lone Sprite token; Sprite Call face down there. P1 has no resources at all. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SPRITE, "old")
    .facedown(P1, "bf1", SPRITE_CALL, "call");
}

const spritesAt = (game: Game, loc: string) => game.p1.units(loc).filter((id) => game.state(id).name === "Sprite");

/** P2 ends → P1's Beginning Phase with the old Sprite's Temporary trigger pending; P1 reveals Sprite Call onto it. */
async function reactWithSpriteCall(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "old", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.points()).toBe(0);
  expect(game.p1.can("reveal", "call")).toBe(true);
  await game.p1.reveal("call");
  expect(game.p1.energy()).toBe(0); // played from hidden for [0]
  expect(game.chain().map((c) => c.cardId)).toEqual(["old", "call"]);
  return game;
}

describe("Ruling 6403372a9a5120d1 — Sprite Call in response to a Sprite's Temporary trigger: new Sprite, old dies, point scored", () => {
  test("step 1 — the new Sprite enters bf1 first (Sprite Call resolves off the top) while the old Sprite is still there", async () => {
    const game = await reactWithSpriteCall();
    for (let i = 0; i < 4 && game.chain().length > 1; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.answer({ keys: [d.options[0]!.key], kind: "pick" });
      } else if (d?.kind === "action") {
        await game.seat(d.seat).passPriority();
      }
    }
    expect(game.zoneOf("call")).toBe("trash");
    expect(spritesAt(game, "bf1")).toHaveLength(2);
    expect(game.zoneOf("old")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "old", triggered: true })]);
    expect(game.p1.points()).toBe(0); // still before scoring
  });

  test("steps 2–3 — then the old Sprite dies to its trigger, and P1 (still holding bf1 with the new Sprite) scores the hold point", async () => {
    const game = await reactWithSpriteCall();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("old")).toBe("gone");
    const left = spritesAt(game, "bf1");
    expect(left).toHaveLength(1);
    expect(left[0]).not.toBe("old");
    expect(game.state(left[0]!)).toMatchObject({ isToken: true, might: 3 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("step 4 — the new Sprite remains through this turn and P2's, and is killed by ITS Temporary at the start of P1's next turn", async () => {
    const game = await reactWithSpriteCall();
    await game.settle();
    const fresh = spritesAt(game, "bf1")[0]!;
    await game.advanceTurn(); // → P2
    expect(game.zoneOf(fresh)).toBe("battlefield-bf1");
    await game.p2.endTurn(); // → P1's next Beginning Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: fresh, triggered: true })]);
    await game.settle();
    expect(game.zoneOf(fresh)).toBe("gone");
  });
});
