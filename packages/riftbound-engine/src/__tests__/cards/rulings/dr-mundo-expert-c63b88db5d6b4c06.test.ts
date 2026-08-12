/**
 * Ruling c63b88db5d6b4c06 — Dr. Mundo, Expert (OGN-109 → ogn-109-298) · Unit · Mind · 6 Might
 *   "My Might is increased by the number of cards in your trash.
 *    At the start of your Beginning Phase, recycle 3 from your trash."
 *
 * Q: Does the "recycle three" ability target, and with two Dr. Mundos can both abilities name the same
 *    three cards so you only recycle three in total?
 * A: It does not target: the three cards are chosen AS the ability resolves, not when it goes on the chain.
 *    Both Mundos' abilities trigger together and go on the chain separately, and each one picks its three
 *    cards when it resolves — so with two Mundos you recycle six cards.
 * Rules: 355.10.b (a choice made on resolution is not targeting), 383.2 (simultaneous triggers become
 *        separate chain items), 359.3 (each item resolves on its own, reading the board as it then is).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DR_MUNDO = "ogn-109-298";
const SKULKER = "ogn-175-298";

/** It is P2's turn; ending it walks into P1's Beginning Phase, when Mundo's ability triggers. */
function board(mundos: number, trashCards: number) {
  let b = scenario().turn(2).active(P2);
  for (let i = 0; i < mundos; i += 1) {
    b = b.unit(P1, "base", DR_MUNDO, `mundo${i + 1}`);
  }
  for (let i = 0; i < trashCards; i += 1) {
    b = b.trash(P1, SKULKER, `t${i}`);
  }
  return b;
}

/** Answer every recycle pick, recording (in order) which card each prompt bound. */
async function drainRecyclePicks(game: Game): Promise<{ picked: string[]; offeredAtEachPrompt: string[][] }> {
  const picked: string[] = [];
  const offeredAtEachPrompt: string[][] = [];
  for (let i = 0; i < 12; i += 1) {
    const stop = await game.settle();
    if (stop.reason !== "unanswered") {
      break;
    }
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "RES" });
    const keys = (d?.options ?? []).map((o) => String(o.key));
    offeredAtEachPrompt.push(keys);
    picked.push(keys[0] as string);
    await game.p1.pick(keys[0] as string);
  }
  return { offeredAtEachPrompt, picked };
}

describe("Ruling c63b88db5d6b4c06 — Mundo's recycle is chosen on resolution, so two Mundos cost you six cards", () => {
  test("ruling: nothing is targeted when the trigger goes on the chain — every pick comes at RESOLUTION", async () => {
    const game = await board(1, 8).build();
    await game.p2.endTurn();
    // The trigger is on the chain with no bound targets; the first question arrives only as it resolves.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mundo1", triggered: true })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);

    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "RES" });
  });

  test("one Mundo recycles exactly three cards out of the trash and into the deck", async () => {
    const game = await board(1, 8).build();
    const trashBefore = game.p1.trash().length;
    const deckBefore = game.p1.deck().length;
    await game.p2.endTurn();
    await drainRecyclePicks(game);
    expect(game.p1.trash().length).toBe(trashBefore - 3);
    expect(game.p1.deck().length).toBe(deckBefore + 3 - 1); // +3 recycled, -1 for the turn's draw
  });

  test("ruling: with TWO Mundos the second cannot re-use the first one's three cards — six leave the trash in all", async () => {
    const game = await board(2, 8).build();
    const trashBefore = game.p1.trash().length;
    await game.p2.endTurn();
    const { offeredAtEachPrompt, picked } = await drainRecyclePicks(game);

    expect(picked.length).toBe(6);
    expect(new Set(picked).size).toBe(6); // six DISTINCT cards
    // Whatever the first ability recycled is no longer on offer to the second.
    const firstThree = picked.slice(0, 3);
    for (const offered of offeredAtEachPrompt.slice(3)) {
      for (const already of firstThree) {
        expect(offered).not.toContain(already);
      }
    }
    expect(game.p1.trash().length).toBe(trashBefore - 6);
    expect(game.violations()).toEqual([]);
  });
});
