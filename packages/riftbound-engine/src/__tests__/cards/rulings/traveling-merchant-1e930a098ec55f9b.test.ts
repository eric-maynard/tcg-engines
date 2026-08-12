/**
 * Ruling 1e930a098ec55f9b — Traveling Merchant (OGN-185 → ogn-185-298) · 2 · 2 Might
 *   "When I move, discard 1, then draw 1."
 *
 * Q: When I move the Traveling Merchant, may I decline to use his ability?
 * A: No. A triggered ability is mandatory unless it says "may"; the Merchant's does not, so the
 *    discard-then-draw happens every single time he moves.
 *   Nuance in the ruling: a "may" trigger still goes on the chain and you decide when it resolves.
 * Rules: 383.3 (triggered abilities are mandatory unless optional), 383.3.a (an optional trigger's
 *        "you may" is answered while the item is finalized — before anyone gets priority).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MERCHANT = "ogn-185-298";
const FILLER = "ogn-175-298";

/** Same trigger shape as the Merchant's, but written with a leading "you may". */
const OPTIONAL_SCOUT = {
  abilities: [
    {
      effect: { amount: 1, type: "draw" },
      optional: true,
      trigger: { event: "move", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "chaos",
  energyCost: 2,
  might: 2,
  name: "Optional Scout",
  rulesText: "When I move, you may draw 1.",
} as const;

/** P1's turn, two open battlefields, the Merchant (and an Optional Scout) ready in base, two spare cards in hand. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", MERCHANT, "merchant")
    .unit(P1, "base", OPTIONAL_SCOUT, "scout")
    .hand(P1, { cardType: "unit", might: 1, name: "Junk A" }, "junkA")
    .hand(P1, { cardType: "unit", might: 1, name: "Junk B" }, "junkB")
    .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"]);
}

/** Pass chain priority for both seats until something else is pending. */
async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 1e930a098ec55f9b — the Merchant's move trigger has no 'may': it always happens", () => {
  test("moving the Merchant queues the trigger with NO yes/no question — P1 is never offered a way out", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.decision()?.kind).not.toBe("yes-no");
  });

  test("on resolution the discard is FORCED: P1 must name a card (declining is not on offer) and then draws 1", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await game.p1.move("merchant", "bf1");
    await passBoth(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["junkA", "junkB"]);
    expect(d?.kind === "pick" ? d.allowDecline : true).toBe(false);
    const declined = await game.p1.try((p) => p.decline());
    expect(declined.ok).toBe(false);
    await game.p1.pick("junkA");
    expect(game.p1.trash()).toContain("junkA");
    expect(game.p1.hand().toSorted()).toEqual(["d1", "junkB"]);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.violations()).toEqual([]);
  });

  test("every move pays the tax again: a second move (bf1 → bf2 via base) discards and draws once more", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    await passBoth(game);
    await game.p1.pick("junkA");
    await game.settle();
    expect(game.state("merchant").isExhausted).toBe(true);
    // Ready him up again by starting a fresh turn, then move once more.
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("merchant").isReady).toBe(true);
    const hand0 = game.p1.hand().length;
    await game.p1.move("merchant", "base");
    await passBoth(game);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick(game.p1.hand()[0]!);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0); // −1 discard, +1 draw
  });

  // RULING-CONFLICT: riftjudge 1e930a098ec55f9b says an optional ("may") trigger still goes on the
  // chain and its controller decides at RESOLUTION; CR 383.3.a/402.1 puts the "you may" at
  // FINALIZATION, before anyone has priority, and a declined item is removed and never becomes a
  // chain item — engine follows CR.
  test("contrast — a 'may' version of the same trigger asks at finalization; declining removes the item so nothing ever reaches the chain", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await game.p1.move("scout", "bf1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(deck0); // declined ⇒ no draw
    expect(game.locationOf("scout")).toBe("bf1"); // the move itself still happened
  });

  test("…and accepting it does put the item on the chain and draws", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await game.p1.move("scout", "bf2");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "scout", controller: P1, triggered: true })]);
    await passBoth(game);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.violations()).toEqual([]);
  });
});
