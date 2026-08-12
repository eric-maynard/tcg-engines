/**
 * Ruling 4ca91a14c76df72a — (flipping a hidden card that sits away from the combat; no specific card named)
 *   Stand-in: Sprite Call (OGN-094 → ogn-094-298) · "[Hidden] [Action] Play a ready 3 [Might] Sprite unit token
 *   with [Temporary]." hidden at bf2 — while the showdown is happening at bf1.
 *
 * Q: Can cards be revealed during a showdown if they are at a battlefield but not in the combat?
 * A: Yes — a hidden card is played as a Reaction and nothing requires it to be at the contested battlefield.
 *    What it can reach, though, is fixed: it only affects things at the battlefield where it was hidden.
 * Rules: 811.1 ([Hidden] cards are played with Reaction timing), 811.2 ("here" for a hidden card is the
 *        battlefield it is hidden at), 347 (Focus in a showdown is what lets a player act at all).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_CALL = "ogn-094-298";

/**
 * Turn 3, P2's turn. The combat is at bf1 (P1 defends with a Warden 4 against P2's Raider 5).
 * Away from it, P1 holds bf2 with an Anchor and has Sprite Call hidden THERE (from an earlier turn).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Warden" }, "warden")
    .unit(P1, "bf2", { might: 2, name: "Anchor" }, "anchor")
    .facedown(P1, "bf2", SPRITE_CALL, "call")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
}

/** P2 attacks bf1; the showdown is open and P1 has Focus. */
async function showdownAtBf1(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
  return game;
}

describe("Ruling 4ca91a14c76df72a — a hidden card at an uninvolved battlefield may still be flipped during the showdown", () => {
  test("the card is at bf2, the combat is at bf1 — and it is offered to P1 all the same", async () => {
    const game = await showdownAtBf1();
    expect(game.zoneOf("call")).toBe("facedown-bf2");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf2?.contested).toBe(false);
    expect(game.p1.can("reveal", "call")).toBe(true);
  });

  test("flipping it during the showdown works, for [0] — and what it produces lands at bf2, where the card was hidden, NOT at the contested battlefield", async () => {
    const game = await showdownAtBf1();
    const before = game.p1.units("bf2").length;
    await game.p1.reveal("call");
    await game.p1.passPriority();
    await game.p2.passPriority(); // the flipped card resolves; the combat at bf1 has NOT been fought yet
    expect(game.zoneOf("call")).toBe("trash");
    expect(game.zoneOf("warden")).toBe("battlefield-bf1");
    expect(game.p1.units("bf2")).toHaveLength(before + 1);
    const sprite = game.p1.units("bf2").find((id) => id !== "anchor");
    expect(game.state(sprite as string)).toMatchObject({ isToken: true, might: 3 });
    expect(game.p1.units("bf1")).toEqual(["warden"]); // nothing appeared at the combat
    expect(game.p1.energy()).toBe(0); // played from hidden for [0]
    expect(game.violations()).toEqual([]);
  });

  test("the combat at bf1 then resolves on its own terms — the far-away flip changed nothing there", async () => {
    const game = await showdownAtBf1();
    await game.p1.reveal("call");
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash"); // 5 ≥ 4
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });
});
