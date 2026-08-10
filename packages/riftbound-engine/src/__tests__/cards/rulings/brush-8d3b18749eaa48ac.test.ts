/**
 * Ruling 8d3b18749eaa48ac — Brush (UNL-T03 → unl-t03, battlefield token)
 *     "Bird, Cat, Dog, Poro, and Ivern units here have +1 [Might]. When you score here, you may replace this with the
 *     battlefield it replaced."
 *   × Green Father (UNL-195 → unl-195-219, Ivern legend) "When you conquer or hold, you may exhaust me to replace that
 *     battlefield with a Brush battlefield token."
 *
 * Q: Can I swap a battlefield back from Brush (by scoring there) and then exhaust Green Father to make it a Brush again?
 * A: Yes, provided each ability's condition is met: scoring at the Brush lets you swap the original back in (an optional
 *    trigger on the chain, respondable); a later conquer/hold there triggers Green Father again and re-Brushes it. You only
 *    score at a battlefield once per turn, so the swap-back uses that turn's scoring there.
 * Rules: 438 (Replace / tokens), 187.8, 468 (Score = Conquer or Hold), 465 (once per battlefield per turn), 383 (triggers use the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GREEN_FATHER = "unl-195-219";
const STALWART_PORO = "ogn-052-298"; // 2-Might Poro — reads Brush's +1

const slotOf = (game: Game) => game.locationOf("poro") as string;
const slotName = (game: Game) => game.state(slotOf(game)).name;
const banishedNames = (game: Game) => game.cardsAt("banishment").map((c) => game.state(c).name);

/** Turn 3: P1 (Green Father) conquers bf1 with the Poro and accepts Green Father → the slot becomes a Brush. */
async function conquerIntoBrush(): Promise<Game> {
  const game = await scenario()
    .turn(3)
    .legend(P1, GREEN_FATHER, "gf")
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", STALWART_PORO, "poro")
    .unit(P2, "bf1", { might: 1, name: "Speedbump" }, "bump")
    .build();
  await game.p1.move("poro", "bf1");
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "gf" } });
  await game.p1.yes();
  await game.settle();
  expect(slotName(game)).toBe("Brush");
  expect(banishedNames(game)).toEqual(["bf1"]);
  expect(game.state("poro").might).toBe(3); // 2 + Brush
  expect(game.state("gf").isExhausted).toBe(true);
  expect(game.p1.points()).toBe(1);
  return game;
}

/** P1 ends, P2 passes the turn; stop in P1's Beginning phase with the hold triggers pending. */
async function toP1sNextHold(game: Game): Promise<void> {
  await game.p1.endTurn();
  await game.settle();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
}

/** Answer each P1 opt-in raised by this hold: `answers[sourceCardName]` (default no). Returns the sources asked, in order. */
async function answerHoldTriggers(game: Game, answers: Record<string, boolean>): Promise<string[]> {
  const asked: string[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "yes-no") {
      break;
    }
    expect(d.seat).toBe(P1);
    const src = game.state(d.source?.cardId as string).name;
    asked.push(src);
    await (answers[src] ? game.p1.yes() : game.p1.no());
  }
  return asked;
}

describe("Ruling 8d3b18749eaa48ac — swap the Brush back by scoring, then Green Father can Brush it again on a later score", () => {
  test("holding the Brush: BOTH 'score here' (Brush) and 'hold' (Green Father) triggers go on the chain as respondable items; accepting Brush's swap-back restores the original bf1 to the slot, the Brush token is gone, the Poro loses the +1, and the hold still scored", async () => {
    const game = await conquerIntoBrush();
    await toP1sNextHold(game);
    // Before answering: the triggers are chain items (opponent could react before they resolve).
    await game.settle();
    expect(game.chain().length).toBeGreaterThanOrEqual(1);
    expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
    const asked = await answerHoldTriggers(game, { Brush: true, "Green Father": false });
    expect(asked.sort()).toEqual(["Brush", "Green Father"]);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(2); // conquer (t3) + this hold
    expect(slotName(game)).toBe("bf1"); // the original is back
    expect(game.battlefields()).toHaveLength(1);
    expect(banishedNames(game)).toEqual([]); // nothing left in banishment; the token ceased to exist
    expect(game.gameState.battlefields[slotOf(game)]?.controller).toBe(P1);
    expect(game.state("poro").might).toBe(2);
  });

  test("that swap-back used this turn's scoring at that battlefield: no further point is scored there this turn (still 2 at end of turn)", async () => {
    const game = await conquerIntoBrush();
    await toP1sNextHold(game);
    await answerHoldTriggers(game, { Brush: true, "Green Father": false });
    expect(game.p1.points()).toBe(2);
    await game.p1.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(2);
  });

  test("on P1's NEXT hold of the restored bf1, Green Father triggers again; exhausting it replaces bf1 with a fresh Brush token — original banished again, Poro back to 3", async () => {
    const game = await conquerIntoBrush();
    await toP1sNextHold(game);
    await answerHoldTriggers(game, { Brush: true, "Green Father": false });
    expect(slotName(game)).toBe("bf1");
    await toP1sNextHold(game);
    expect(game.state("gf").isReady).toBe(true); // readied in Awaken
    const asked = await answerHoldTriggers(game, { "Green Father": true });
    expect(asked).toEqual(["Green Father"]); // plain bf1 has no 'score here' trigger of its own
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(3);
    expect(slotName(game)).toBe("Brush");
    expect(game.battlefields()).toHaveLength(1);
    expect(banishedNames(game)).toEqual(["bf1"]);
    expect(game.state("gf").isExhausted).toBe(true);
    expect(game.state("poro").might).toBe(3);
  });
});
