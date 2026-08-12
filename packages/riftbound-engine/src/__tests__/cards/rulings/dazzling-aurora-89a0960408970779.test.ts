/**
 * Ruling 89a0960408970779 — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · Body · [9][body][body]
 *   "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish
 *    it. Play it, ignoring its cost, and recycle the rest."
 *   × Whiteflame Protector (ogn-082-298) 8 Might "When you play me, give a unit +8 [Might] this turn."
 *
 * Q: When Dazzling Aurora plays Whiteflame Protector at end of turn, does the +8 carry into the enemy turn?
 * A: No. Dazzling Aurora fires in the Ending Step; the Expiration Step then runs and ends every "this turn"
 *    effect — including that +8 — before the next player's turn begins.
 * Rules: 317.1 (Ending Step triggers), 317.2.3.d (the Expiration Step ends "this turn" effects),
 *        317.3 (only then does the turn end).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const WHITEFLAME_PROTECTOR = "ogn-082-298";

/** P1's turn: Dazzling Aurora in play, a 3-Might Ally in base and Whiteflame Protector on top of the deck. */
function board() {
  return scenario().gear(P1, DAZZLING_AURORA, "aurora").unit(P1, "base", { might: 3, name: "Ally" }, "ally").deck(P1, [WHITEFLAME_PROTECTOR], ["wf"]);
}

describe("Ruling 89a0960408970779 — Whiteflame Protector's +8 lapses in the Expiration Step, before P2's turn", () => {
  test("ending the turn fires Dazzling Aurora, which plays Whiteflame Protector and asks whose Might to raise", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);

    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.zoneOf("wf")).toBe("base"); // played, ignoring its [8][calm][calm]
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "wf" } });
    expect(game.decision()?.kind === "pick" ? game.decision()!.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["ally", "wf"]);
  });

  test("the +8 is applied and then expires in the SAME turn's Expiration Step — P2's turn starts with the Ally back at 3", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    await game.settle();
    await game.p1.pick("ally");
    await game.p1.passPriority();
    await game.p2.passPriority(); // the buff resolves, the Ending Step finishes, Expiration runs

    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("ally").might).toBe(3); // not 11 — the "this turn" modifier is gone
    expect(game.state("ally").mightModifier).toBe(0);
    // The trace proves the +8 existed and was ended by the Expiration Step, not by P2's turn beginning.
    const [pass] = game.trace().expiration;
    expect(pass?.steps).toEqual(["heal", "expire", "empty-pools"]);
    expect(pass?.expired).toContain("mightModifier:ally");
    expect(game.violations()).toEqual([]);
  });

  test("Whiteflame Protector itself stays on the board into P2's turn — only the temporary buff goes away", async () => {
    const game = await board().build();
    await game.p1.endTurn();
    await game.settle();
    await game.p1.pick("wf"); // it may even buff itself
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("wf")).toBe("base");
    expect(game.state("wf").might).toBe(8); // printed 8, the +8 has expired
  });
});
