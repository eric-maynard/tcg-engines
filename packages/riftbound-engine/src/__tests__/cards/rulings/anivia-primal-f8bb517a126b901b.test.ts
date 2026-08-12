/**
 * Ruling f8bb517a126b901b — Anivia, Primal (OGN-148 → ogn-148-298) · Unit · Body · 8 Might
 *   "When I attack, deal 3 to all enemy units here."
 *   × Ahri, Inquisitive (OGN-119 → ogn-119-298) · 3 Might
 *     "When I attack or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: Anivia attacks into a defending Ahri — does Ahri's ability trigger and resolve before she dies to
 *    Anivia's 3 damage?
 * A: Yes. Both triggers fire when combat begins; the attack trigger is put on the chain first and the defend
 *    trigger last, so LIFO resolves the DEFEND trigger first. Ahri's -2 lands on Anivia, and only then does
 *    Anivia's attack trigger resolve and kill Ahri.
 * Rules: 336–340 (chain, LIFO), 383.3.d (simultaneous triggers are ordered by turn player first),
 *        464 (combat designations), 417 (damage).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ANIVIA = "ogn-148-298";
const AHRI = "ogn-119-298";

/** P1's Anivia in base; P2 holds bf1 with Ahri (and, when asked, a second body so Ahri has a choice). */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", ANIVIA, "anivia")
    .unit(P2, "bf1", AHRI, "ahri");
}

describe("Ruling f8bb517a126b901b — Ahri's defend trigger resolves before Anivia's attack damage", () => {
  test("intermediate fact: both triggers are on the chain at once, the attack trigger UNDER the defend trigger", async () => {
    const game = await board().build();
    await game.p1.move("anivia", "bf1");
    expect(game.state("anivia").combatRole).toBe("attacker");
    expect(game.state("ahri").combatRole).toBe("defender");
    const ids = game.chain().map((c) => c.cardId);
    expect(ids).toEqual(["anivia", "ahri"]); // Anivia first ⇒ resolves last
    expect(game.state("anivia").might).toBe(8);
    expect(game.state("ahri").damage).toBe(0);
  });

  test("ruling: the defend trigger resolves FIRST — Anivia is at 6 Might while Ahri is still alive", async () => {
    const game = await board().build();
    await game.p1.move("anivia", "bf1");
    // Let exactly the top item (Ahri's) resolve.
    while (game.chain().length > 1) {
      await game.acting().passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["anivia"]);
    expect(game.state("anivia").might).toBe(6); // 8 − 2 from Ahri
    expect(game.zoneOf("ahri")).toBe("battlefield-bf1"); // she is not dead yet
    expect(game.state("ahri").damage).toBe(0);
  });

  test("…and only then does Anivia's 3 damage land and kill her", async () => {
    const game = await board().build();
    await game.p1.move("anivia", "bf1");
    while (game.chain().length > 1) {
      await game.acting().passPriority();
    }
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ahri")).toBe("trash"); // 3 damage on a 3-Might unit
    expect(game.state("anivia").might).toBe(6); // the -2 persists for the turn
  });

  test("the whole combat: Ahri dies, Anivia (reduced to 6) survives and conquers bf1", async () => {
    const game = await board().build();
    await game.p1.move("anivia", "bf1");
    await game.settle();
    expect(game.zoneOf("ahri")).toBe("trash");
    expect(game.zoneOf("anivia")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("the -2 is real and lasts the turn: it is still on Anivia after combat and gone next turn", async () => {
    const game = await board().build();
    await game.p1.move("anivia", "bf1");
    await game.settle();
    expect(game.state("anivia")).toMatchObject({ might: 6, mightModifier: -2 });
    await game.advanceTurn();
    expect(game.state("anivia")).toMatchObject({ might: 8, mightModifier: 0 });
  });
});
