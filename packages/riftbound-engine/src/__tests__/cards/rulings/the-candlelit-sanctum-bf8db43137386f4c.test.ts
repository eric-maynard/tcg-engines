/**
 * Ruling bf8db43137386f4c — The Candlelit Sanctum (OGN-291 → ogn-291-298) · Battlefield
 *     "When you conquer here, look at the top two cards of your Main Deck. You may recycle one or both of them.
 *      Put those you don't back in any order."
 *
 * Q: When you conquer a location, does the point (or its card-draw replacement) happen before or after the
 *    battlefield's conquer trigger?
 * A: The scoring comes first. You conquer, you take the point — or draw the replacement card if the Final Point
 *    is unavailable — and only then do the conquer triggers, including the battlefield's own, go on the chain.
 *    So a player at 7 points draws first and the Sanctum then looks at what is on top afterwards.
 * Rules: 465 / 471 (scoring is part of establishing control), 471.1.b.1 (Conquer at VS−1 → draw instead of the
 *        point), 383 (conquer triggers are queued after the scoring).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CANDLELIT_SANCTUM = "ogn-291-298";
const U = (name: string, might: number) => ({ cardType: "unit", energyCost: 1, might, name });

/**
 * P1's turn 3, Victory Score 8. bf1 IS The Candlelit Sanctum and is open; bf2 is P2's, so conquering bf1 alone
 * never scores every battlefield this turn. P1's deck reads Top, Second, Third, Fourth.
 */
function board(points: number) {
  return scenario()
    .turn(3)
    .victoryScore(8)
    .points(P1, points)
    .battlefield("bf1", { controller: null, def: CANDLELIT_SANCTUM, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 1, name: "Keeper" }, "keeper")
    .unit(P1, "base", { might: 3, name: "Striker" }, "striker")
    .deck(P1, [U("Top", 1), U("Second", 2), U("Third", 3), U("Fourth", 4)], ["top", "second", "third", "fourth"]);
}

/** Walk to the Sanctum's look prompt, recording P1's hand as it goes. */
async function conquerToLookPrompt(game: Game): Promise<{ decision: Decision; handWhenAsked: string[] }> {
  await game.p1.move("striker", "bf1");
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "pick") {
      return { decision: d, handWhenAsked: game.p1.hand() };
    }
    if (d.kind === "action" && (d.context === "showdown" || d.context === "chain")) {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
  throw new Error("the Sanctum's look prompt never appeared");
}

describe("Ruling bf8db43137386f4c — conquering scores (or draws) FIRST, then the battlefield's conquer trigger runs", () => {
  test("at 7/8: the conquest cannot take the Final Point, so P1 draws the replacement card — and that card is the old deck top", async () => {
    const game = await board(7).build();
    expect(game.p1.hand()).toEqual([]);
    const { handWhenAsked } = await conquerToLookPrompt(game);
    expect(handWhenAsked).toEqual(["top"]); // already drawn before the Sanctum is asked anything
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("…and only then does the Sanctum look at the top two, which are now the cards BELOW the one already drawn", async () => {
    const game = await board(7).build();
    const { decision } = await conquerToLookPrompt(game);
    expect(decision).toMatchObject({ kind: "pick", seat: P1 });
    expect(decision.kind === "pick" ? decision.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["second", "third"]);
  });

  test("declining to recycle leaves both back on top (in the order P1 names) — the drawn card is not among them", async () => {
    const game = await board(7).build();
    await conquerToLookPrompt(game);
    await game.p1.decline();
    const order = game.decision();
    if (order?.kind === "order") {
      await game.p1.order(order.items.map((it) => it.key));
    }
    await game.settle();
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.p1.deck().slice(0, 2).toSorted()).toEqual(["second", "third"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control at 5/8: the same conquest takes the POINT first (5 → 6, no draw) and the Sanctum then looks at the untouched top two", async () => {
    const game = await board(5).build();
    const { decision, handWhenAsked } = await conquerToLookPrompt(game);
    expect(game.p1.points()).toBe(6);
    expect(handWhenAsked).toEqual([]); // no replacement draw at all
    expect(decision.kind === "pick" ? decision.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["second", "top"]);
  });
});
