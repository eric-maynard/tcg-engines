/**
 * Ruling 2631a8ca4992fd1e — Sprite (OGN-274 → ogn-274-298) · 3-Might Fae token
 *   "[Temporary] (Kill me at the start of your Beginning Phase, before scoring.)"
 *   × Teemo, Scout (OGN-197 → ogn-197-298) · [Hidden] · "When you play me, give me +3 [Might] this turn."
 *
 * Q: A Sprite token holds a battlefield together with a hidden Teemo. At the start of my Beginning Phase
 *    the [Temporary] trigger goes up — can I reveal the hidden unit BEFORE the token is removed, so I keep
 *    control and score for holding?
 * A: Yes. The [Temporary] trigger is a normal chain item and can be responded to. Flip Teemo first; he
 *    resolves onto the battlefield (his own "when you play me" trigger resolving on top), and only then
 *    does the Sprite trigger resolve and trash the token. Teemo is still there, so you keep the
 *    battlefield and score for holding it.
 * Rules: 340 (chain items can be responded to and resolve LIFO), 812 ([Temporary] = a Beginning-Phase
 *        trigger before scoring), 811 ([Hidden] cards are played as reactions), 323.6 (control lapses only
 *        with no unit of yours there at an Open-State Cleanup), 468 (score for holding).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const TEEMO_SCOUT = "ogn-197-298";

/** Turn 2, P2 active. P1 holds bf1 with a Sprite token there and a hidden Teemo, Scout underneath. */
function board(withTeemo: boolean) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SPRITE, "sprite");
  return withTeemo ? b.facedown(P1, "bf1", TEEMO_SCOUT, "teemo") : b;
}

/** End P2's turn so P1's Beginning Phase starts and the [Temporary] trigger goes on the chain. */
async function beginningPhase(withTeemo: boolean): Promise<Game> {
  const game = await board(withTeemo).build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  return game;
}

describe("Ruling 2631a8ca4992fd1e — reveal the hidden unit in response to the [Temporary] trigger and keep the battlefield", () => {
  test("the [Temporary] trigger is a chain item P1 can respond to — the hidden Teemo is flippable right then", async () => {
    const game = await beginningPhase(true);
    expect(game.chain().filter((c) => c.cardId === "sprite" && c.triggered)).toHaveLength(1);
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1"); // not dead yet
    expect(game.p1.can("reveal", "teemo")).toBe(true);
  });

  test("ruling: flipping Teemo first puts him (and his own trigger) above the Sprite trigger on the chain", async () => {
    const game = await beginningPhase(true);
    await game.p1.reveal("teemo");
    expect(game.chain().map((c) => c.cardId)).toContain("teemo");
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").might).toBe(4); // 1 + his own "+3 this turn"
  });

  test("ruling: the Sprite trigger then resolves and the token is gone, but P1 keeps bf1 and scores for holding", async () => {
    const game = await beginningPhase(true);
    await game.p1.reveal("teemo");
    await game.settle();
    expect(game.has("sprite")).toBe(false); // the token was killed and ceased to exist
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // held bf1 through the scoring step
    expect(game.violations()).toEqual([]);
  });

  test("contrast: letting the Sprite trigger resolve with nothing else there loses bf1 and scores nothing", async () => {
    const game = await beginningPhase(false);
    await game.settle();
    expect(game.has("sprite")).toBe(false);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0);
  });
});
