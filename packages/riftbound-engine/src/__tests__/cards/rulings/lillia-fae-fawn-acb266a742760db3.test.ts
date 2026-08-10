/**
 * Ruling acb266a742760db3 — Lillia, Fae Fawn (UNL-082 → unl-082-219) · 3 Might champion
 *     "[Accelerate] … When I move from a location, play a 3 [Might] Sprite unit token with [Temporary] there."
 *   × Sprite token (OGN-274 → ogn-274-298) · 3 Might · [Temporary]
 *   (The "trap" is a hidden card — here a facedown Zhonya's Hourglass ogn-077-298.)
 *
 * Q: Lillia sits at a battlefield with my hidden ("trap") card. Next turn I move her back to base — does the hidden card
 *    disappear, or stay with the Sprite that spawns?
 * A: It stays. The hidden card is its own object in that battlefield's facedown zone, unrelated to Lillia or the token.
 *    Lillia's move trigger plays the Sprite THERE, so I never lose control of the battlefield (Closed State while the
 *    trigger is pending; a unit of mine there afterwards) — and a hidden card is only lost at a Cleanup where I have
 *    actually lost control.
 * Rules: 421.1 / 811 (hidden cards live in the facedown zone; trashed only when control of the battlefield is lost),
 *        190.4 / 323.6 (control lapses only when empty in an Open State), 383 (move trigger → chain), Temporary.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LILLIA = "unl-082-219";
const ZHONYAS = "ogn-077-298"; // any [Hidden] card serves as "the trap"

/** P1's turn. P1 controls bf1 with Lillia (ready) and a facedown card there. P2 holds bf2. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", LILLIA, "lillia")
    .facedown(P1, "bf1", ZHONYAS, "trap")
    .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onlooker");
}

const spriteAt = (game: Game, bf: string) => game.cardsAt(bf).find((id) => game.state(id).name === "Sprite");

/** Lillia moves bf1 → base; her trigger resolves. */
async function lilliaWalksHome(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.facedown("bf1")).toEqual(["trap"]);
  await game.p1.move("lillia", "base");
  return game;
}

describe("Ruling acb266a742760db3 — moving Lillia home leaves the hidden card in place; the Sprite spawns beside it", () => {
  test("the move puts Lillia's 'when I move from a location' trigger on the chain; while it is pending (Closed State) bf1 is empty of units yet still P1's and the hidden card is untouched", async () => {
    const game = await lilliaWalksHome();
    expect(game.locationOf("lillia")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lillia", controller: P1, triggered: true })]);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("trap")).toBe("facedown-bf1");
  });

  test("the trigger resolves: a 3-Might [Temporary] Sprite token is played AT bf1 — bf1 now holds the Sprite AND the hidden card, P1 keeps control", async () => {
    const game = await lilliaWalksHome();
    await game.settle();
    expect(game.chain()).toEqual([]);
    const sprite = spriteAt(game, "bf1");
    expect(sprite).toBeDefined();
    expect(game.state(sprite as string)).toMatchObject({ controller: P1, isToken: true, keywords: ["Temporary"], location: "bf1", might: 3 });
    expect(game.p1.units("bf1")).toEqual([sprite as string]);
    expect(game.zoneOf("trap")).toBe("facedown-bf1");
    expect(game.state("trap").isHidden).toBe(true);
    expect(game.p1.facedown("bf1")).toEqual(["trap"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("it also survives the opponent's whole turn: the Sprite holds bf1, so at every Cleanup P1 still controls it and the hidden card stays", async () => {
    const game = await lilliaWalksHome();
    await game.settle();
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(spriteAt(game, "bf1")).toBeDefined();
    expect(game.zoneOf("trap")).toBe("facedown-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("contrast — WHEN control really is lost: at the start of P1's next turn [Temporary] kills the Sprite, bf1 is empty in an Open State, control lapses and only THEN is the hidden card trashed", async () => {
    const game = await lilliaWalksHome();
    await game.settle();
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1 — Beginning Phase kills the Temporary Sprite
    expect(game.turnPlayer()).toBe(P1);
    expect(spriteAt(game, "bf1")).toBeUndefined();
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.zoneOf("trap")).toBe("trash");
  });
});
