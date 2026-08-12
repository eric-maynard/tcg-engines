/**
 * Ruling 806185fc465f3ba7 — (no specific card) what a token IS and what happens when it leaves the board.
 *   Stand-ins: Sprite Call (OGN-094 → ogn-094-298) · [Hidden] [Action] "Play a ready 3 [Might] Sprite unit
 *   token with [Temporary]"; Faithful Manufactor (OGN-211 → ogn-211-298) · "When you play me, play a 1
 *   [Might] Recruit unit token here"; Gust (OGN-169 → ogn-169-298) to bounce a token off the board.
 *
 * Q: What are tokens, what represents them, and what do they do?
 * A: Token units are made by effects and are NOT cards — they live outside the deck and outside the game
 *    until an effect creates them. They enter the board with exactly the stats the creating effect names
 *    (a Sprite is 3 Might, a Recruit is 1 Might). When a token leaves the board for any reason — killed,
 *    sent to hand, anything — it ceases to exist instead of going to the trash.
 * Rules: 186.1 (a token put into any non-board zone besides the chain ceases to exist immediately),
 *        187.2 (the creating effect specifies the token's characteristics), 816 ([Temporary]).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_CALL = "ogn-094-298";
const MANUFACTOR = "ogn-211-298";
const GUST = "ogn-169-298";

/** The one token of P1's that is not the named anchor unit. */
function tokenOf(game: Game, exclude: readonly string[]): string {
  const found = game.findAll({ owner: P1 }).filter((id) => !exclude.includes(id) && game.has(id) && game.state(id).isToken);
  expect(found).toHaveLength(1);
  return found[0]!;
}

describe("Ruling 806185fc465f3ba7 — tokens are effect-made objects that vanish when they leave the board", () => {
  test("a 3-Might Sprite: the effect (not a card) makes it, and it enters with the stats the effect names", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
      .hand(P1, SPRITE_CALL, "call")
      .build();
    const deckBefore = game.p1.deck().length;
    await game.p1.cast("call", { answers: ["bf1"] });
    await game.settle();
    const sprite = tokenOf(game, ["anchor"]);
    expect(game.state(sprite)).toMatchObject({ isToken: true, baseMight: 3, might: 3, isReady: true, owner: P1 });
    expect(game.state(sprite).keywords).toContain("Temporary");
    // it came from nowhere: the deck is untouched and the token was never a card in any zone
    expect(game.p1.deck()).toHaveLength(deckBefore);
    expect(game.p1.hand()).not.toContain(sprite);
    expect(game.zoneOf("call")).toBe("trash"); // the CARD that made it is an ordinary card
  });

  test("a different token type has a different Might — Faithful Manufactor's Recruit enters at 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
      .hand(P1, MANUFACTOR, "man")
      .build();
    await game.p1.play("man", { to: "bf1" });
    await game.settle();
    const recruit = tokenOf(game, ["anchor", "man"]);
    expect(game.state(recruit)).toMatchObject({ isToken: true, baseMight: 1, might: 1, name: "Recruit" });
    expect(game.locationOf(recruit)).toBe("bf1");
  });

  test("killed in combat, the token does NOT go to the trash — it ceases to exist (186.1)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", "unl-t07", "sprite")
      .unit(P2, "base", { might: 5, name: "Killer" }, "killer")
      .build();
    expect(game.state("sprite")).toMatchObject({ isToken: true, baseMight: 3 });
    await game.p2.move("killer", "bf1");
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.has("sprite")).toBe(false);
    expect(game.p1.trash()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("'for any reason' includes being sent to hand: Gust bounces the 3-Might Sprite and it vanishes instead of landing in the hand", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .resources(P2, { energy: 1, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", "unl-t07", "sprite")
      .hand(P2, GUST, "gust")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p2.cast("gust", { targets: "sprite" });
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.p1.hand()).toHaveLength(handBefore); // no card arrived — a token is not a card
    expect(game.p1.trash()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
