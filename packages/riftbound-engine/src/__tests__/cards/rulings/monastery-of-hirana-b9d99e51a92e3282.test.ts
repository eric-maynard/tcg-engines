/**
 * Ruling b9d99e51a92e3282 — Monastery of Hirana (OGN-282 → ogn-282-298) · Battlefield
 *   "When you conquer here, you may spend a buff to draw 1."
 *   × Sett, Brawler (ogn-164-298) · 4 Might — "When I'm played and when I conquer, buff me."
 *
 * Q: Conquering the Monastery with Sett, can you order the two triggers so Sett's buff arrives first and is
 *    then spent for Hirana's draw?
 * A: You control both triggers and they are simultaneous, so you may order them as you please. If Sett is
 *    ALREADY buffed you can spend that buff for the draw and take a fresh buff from his trigger afterwards.
 * Rules: 383.3.d (a player orders their own simultaneous triggers), 471.2 (Conquer effects),
 *        204.3.a/383.3.b (a "you may [cost] to …" trigger pays its cost while it is Finalized).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const MONASTERY = "ogn-282-298";
const SETT_BRAWLER = "ogn-164-298";

/** P1's turn. bf1 is the Monastery, empty and uncontrolled; Sett walks in and conquers it. */
function board(buffed: boolean) {
  return scenario()
    .battlefield("bf1", { controller: null, def: MONASTERY, inert: false })
    .unit(P1, "base", SETT_BRAWLER, "sett", { buffed });
}

describe("Ruling b9d99e51a92e3282 — Sett + Monastery of Hirana on one conquer", () => {
  test("ruling: both conquer triggers are P1's and simultaneous, so P1 is offered the order of the batch", async () => {
    const game = await board(true).build();
    await game.p1.move("sett", "bf1");
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes(); // opt into Hirana's "spend a buff to draw 1"

    expect(game.decision()).toMatchObject({ kind: "order", seat: P1, defaultable: true, timing: "FIN" });
    await game.acceptTriggerOrder();
  });

  test("ruling: with Sett ALREADY buffed, Hirana spends that buff to draw 1 and Sett's trigger hands him a fresh buff", async () => {
    const game = await board(true).build();
    const deckBefore = game.p1.deck().length;
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.state("sett").might).toBe(5);

    await game.p1.move("sett", "bf1");
    await game.settle();
    expect(game.decision()?.source?.cardId).toBe("bf1");
    await game.p1.yes();
    await game.settle();

    expect(game.p1.points()).toBe(1); // the conquer itself
    expect(game.p1.deck().length).toBe(deckBefore - 1); // Hirana's draw
    expect(game.p1.hand().length).toBe(1);
    expect(game.state("sett").isBuffed).toBe(true); // his own trigger re-buffed him
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge b9d99e51a92e3282 says you may order Sett's trigger first, gain the buff and
  // then spend that fresh buff for Hirana's draw; CR 383.3.b + 204.3.a (and 402–404) say the "you may spend
  // a buff to draw 1" is a trigger BASE COST settled while the batch is Finalized — i.e. before ANY of the
  // batch resolves — so a buff that only appears when Sett's trigger resolves can never pay it. Engine
  // follows CR: with an unbuffed Sett the Monastery is not offered at all.
  test("RULING-CONFLICT: an UNBUFFED Sett cannot pay Hirana — the cost is settled at Finalization, before his buff exists", async () => {
    const game = await board(false).build();
    const deckBefore = game.p1.deck().length;
    expect(game.state("sett").isBuffed).toBe(false);

    await game.p1.move("sett", "bf1");
    const stop = await game.settle();

    expect(stop.reason).toBe("open"); // no opt-in was ever raised
    expect(game.p1.points()).toBe(1); // the conquer still scored
    expect(game.state("sett").isBuffed).toBe(true); // his own trigger resolved
    expect(game.p1.deck().length).toBe(deckBefore); // …but nothing was drawn
    expect(game.p1.hand().length).toBe(0);
  });
});
