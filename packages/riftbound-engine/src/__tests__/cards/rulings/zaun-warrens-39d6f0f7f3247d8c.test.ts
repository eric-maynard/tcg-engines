/**
 * Ruling 39d6f0f7f3247d8c — Zaun Warrens (OGN-298 → ogn-298-298) · battlefield
 *   "When you conquer here, discard 1, then draw 1."
 *
 * Q: When you conquer Zaun Warrens, what order do the conquer/score and the Warrens trigger happen in?
 * A: Conquering resolves first — control changes and the point is scored as part of conquering — and
 *    only then does the "when you conquer here" trigger go on the Chain and resolve (discard, then draw).
 * Rules: 471.2 (scoring is part of conquering), 383.3 (the trigger is queued and finalized afterwards),
 *        339 (it resolves as a Chain item).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZAUN_WARRENS = "ogn-298-298";

/** An uncontrolled Zaun Warrens; P1 walks a unit in. P1 holds exactly one card with one card on deck. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null, def: ZAUN_WARRENS, inert: false })
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .hand(P1, { cardType: "spell", energyCost: 9, name: "Junk" }, "junk")
    .deckTop(P1, { cardType: "spell", energyCost: 8, name: "Fresh" }, "fresh");
}

describe("Ruling 39d6f0f7f3247d8c — the conquer (and its point) happen first; the Warrens trigger resolves after", () => {
  test("step by step: conquest scores and takes control, THEN the trigger sits unresolved on the Chain", async () => {
    const game = await board().build();
    expect(game.p1.points()).toBe(0);

    await game.p1.move("scout", "bf1");
    // Non-combat showdown at an uncontrolled battlefield: both pass Focus to close it.
    await game.p1.passFocus();
    await game.p2.passFocus();

    // Conquest already happened: control + point.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // The Warrens trigger is only now on the Chain — nothing of it has happened.
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "bf1", controller: P1, triggered: true }),
    ]);
    expect(game.p1.hand()).toEqual(["junk"]);
    expect(game.zoneOf("fresh")).toBe("mainDeck");

    // Now let it resolve: discard 1, then draw 1.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed", timing: "RES" });
    await game.p1.pick("junk");
    await game.settle();

    expect(game.p1.trash()).toEqual(["junk"]);
    expect(game.p1.hand()).toEqual(["fresh"]);
    expect(game.p1.points()).toBe(1); // still exactly the one conquest point
    expect(game.violations()).toEqual([]);
  });

  test("end state via settle(): 1 point, the held card discarded and replaced by the deck's top card", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.trash()).toEqual(["junk"]);
    expect(game.p1.hand()).toEqual(["fresh"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
