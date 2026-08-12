/**
 * Ruling c0092e67f58bee9f — Sprite (OGN-274 → ogn-274-298) · Unit token · 3 [Might]
 *   "[Temporary] (Kill me at the start of your Beginning Phase, before scoring.)"
 *   × Pakaa Cub (OGN-135 → ogn-135-298) · Unit · [3] · "[Hidden]" as the hidden card held at the same battlefield.
 *
 * Q: Can you react to triggers during the Beginning Phase — e.g. flip a hidden unit in response to a Sprite token's
 *    [Temporary] death, so you do not lose the battlefield?
 * A: Yes. [Temporary] is a triggered ability: it goes on the Chain at the start of the Beginning Phase and opens a
 *    normal reaction window. Playing a hidden card is at reaction speed, so the hidden unit arrives first and the
 *    battlefield still has one of your units on it when the Sprite dies.
 * Rules: 816.1.c ([Temporary] triggers at the start of your Beginning Phase), 383.3 (triggers use the Chain),
 *        811.6 (playing a [Hidden] card is at reaction speed), 190.4/323.6 (control lapses only in an Open State).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const PAKAA_CUB = "ogn-135-298";

/** P2's turn is ending. P1 holds bf1 with nothing but a Sprite, and one hidden card sitting there. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SPRITE, "sprite")
    .unit(P2, "bf2", { might: 3, name: "TheirHolder" }, "th")
    .facedown(P1, "bf1", PAKAA_CUB, "cub");
}

describe("Ruling c0092e67f58bee9f — [Temporary] is a Chain trigger you can answer with a hidden card", () => {
  test("at the start of P1's Beginning Phase the Sprite's [Temporary] is on the Chain, not already resolved", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true })]);
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1"); // still alive
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("that window really is a reaction window: the hidden card is legal to play there", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.p1.can("reveal", "cub")).toBe(true);
    await game.p1.reveal("cub");
    await game.settle();
    expect(game.zoneOf("cub")).toBe("battlefield-bf1");
  });

  test("…and because the Cub is there first, P1 keeps bf1 once the Sprite dies", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.reveal("cub");
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("gone"); // the token was killed by [Temporary]
    expect(game.p1.units("bf1")).toEqual(["cub"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("declining the window loses the battlefield — the Sprite dies with nobody left to hold it", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.zoneOf("cub")).toBe("trash"); // 323.7 — the facedown card goes with the lost battlefield
  });

  test("the reaction window closes once the trigger has resolved", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("reveal", "cub")).toBe(false);
  });
});
