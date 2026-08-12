/**
 * Ruling 4641754dbbed9cdb — (hidden cards when the last friendly unit leaves; no specific card named)
 *   Stand-ins: Sprite Call (OGN-094 → ogn-094-298) · "[Hidden] [Action] Play a ready 3 [Might] Sprite unit token
 *   with [Temporary]." hidden at bf1 on an earlier turn; Flurry of Blades (OGN-133 → ogn-133-298) · [Reaction]
 *   [1] "Deal 1 to all units at battlefields" as the opponent's removal.
 *
 * Q: Does a hidden card get discarded if the only friendly unit on a battlefield I control is killed or moved?
 * A: Yes — the moment you lose control of the battlefield, the hidden cards there go to the trash. But the
 *    removal that empties the battlefield is itself a chain item, so you keep control (and the hidden card)
 *    while it is pending and may flip that card in response — a unit it makes keeps the battlefield yours.
 * Rules: 323.6 / 190.4 (control lapses at a Cleanup in an OPEN State — never while a chain item is pending),
 *        323.7 (facedown cards at a battlefield you no longer control are trashed in that same Cleanup),
 *        811 ([Hidden]: playable as a Reaction for [0] at the battlefield where it is hidden).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_CALL = "ogn-094-298";
const FLURRY_OF_BLADES = "ogn-133-298";

/** Turn 3, P2's turn. P1 holds bf1 with a lone 1-Might Sentry and Sprite Call hidden there (from an earlier turn). */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Sentry" }, "sentry")
    .facedown(P1, "bf1", SPRITE_CALL, "call")
    .hand(P2, FLURRY_OF_BLADES, "flurry");
}

/** P2 casts the Flurry that will kill P1's lone holder; stops with it still on the chain. */
async function removalPending(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("flurry");
  expect(game.chain().map((c) => c.cardId)).toEqual(["flurry"]);
  return game;
}

describe("Ruling 4641754dbbed9cdb — losing the last unit there trashes the hidden card, but the removal itself is a window", () => {
  test("with the removal still pending I have NOT lost anything yet: bf1 is still mine and the hidden card is still there and still flippable", async () => {
    const game = await removalPending();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", seat: P1 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("call")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "call")).toBe(true);
  });

  test("letting it resolve: the lone Sentry dies, control lapses in the next Cleanup and the hidden card is trashed", async () => {
    const game = await removalPending();
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.zoneOf("call")).toBe("trash");
    expect(game.p1.trash()).toContain("call");
    expect(game.p1.can("reveal", "call")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("the nuance: flipping the hidden card in response saves the battlefield — the Sprite it makes is still there when the Sentry dies, so control (and nothing else) is lost", async () => {
    const game = await removalPending();
    await game.p2.passPriority();
    await game.p1.reveal("call");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash"); // the Flurry still killed it
    const sprite = game.p1.units("bf1")[0];
    expect(sprite).toBeDefined();
    expect(game.state(sprite as string)).toMatchObject({ isToken: true, might: 3 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("moving the last unit away does it too — a Standard Move needs no chain, and the hidden card is trashed in the same Cleanup", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Sentry" }, "sentry")
      .facedown(P1, "bf1", SPRITE_CALL, "call")
      .build();
    await game.p1.move("sentry", "base");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.zoneOf("call")).toBe("trash");
  });
});
