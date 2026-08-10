/**
 * Ruling 94bd6f6525ee7a27 — Teemo, Strategist (OGN-121 → ogn-121-298, 2 Might [Hidden]: "When I defend, choose an enemy
 *   unit here and reveal the top 5 cards of your Main Deck. Deal 1 to that unit for each card with [Hidden] revealed this
 *   way, then recycle the revealed cards.") × Ruin Runner (SFD-105 → sfd-105-221, 5 Might: "I can't be chosen by enemy
 *   spells and abilities.")
 *
 * Q: Does Teemo's defend trigger go off if the only enemy unit here is Ruin Runner (which he can't choose)?
 * A: The trigger fires (enters the chain as a pending item) but with no legal target it is removed during finalization
 *    (402.3): nothing is revealed, no damage. If another enemy unit is there too, Teemo must choose that one and the
 *    ability resolves normally against it.
 * Rules: 402 / 402.3 (pending trigger with no legal choices is removed), 355.10 ("choose" = target), 757 (can't be chosen).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TEEMO = "ogn-121-298";
const RUIN_RUNNER = "sfd-105-221";
const ZHONYAS = "ogn-077-298"; // a [Hidden] card for the reveal count
const SKULKER = "ogn-175-298";

/** P2's turn. Teemo (2) holds P1's bf1. P1's deck top 5 = Zhonya's, Skulker, Zhonya's, Skulker, Skulker (2 Hidden). P2: Ruin Runner (5) [+ Grunt (3)]. */
function board(withGrunt: boolean) {
  const b = scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TEEMO, "teemo")
    .unit(P2, "base", RUIN_RUNNER, "rr")
    .deck(P1, [ZHONYAS, SKULKER, ZHONYAS, SKULKER, SKULKER, SKULKER], ["z1", "s1", "z2", "s2", "s3", "s4"]);
  return withGrunt ? b.unit(P2, "base", { might: 3, name: "Grunt" }, "grunt") : b;
}

describe("Ruling 94bd6f6525ee7a27 — Teemo's defend trigger with Ruin Runner as the only enemy: removed for lack of a legal target", () => {
  test("Ruin Runner attacks alone: Teemo defends, but his ability never becomes a chain item P1 could aim — no target prompt, NO cards revealed/recycled, no damage; the attacker just gets Focus", async () => {
    const game = await board(false).build();
    const deckBefore = [...game.p1.deck()];
    await game.p2.move("rr", "bf1");
    expect(game.state("teemo").combatRole).toBe("defender"); // the trigger condition WAS met
    expect(game.state("rr").keywords).toContain("Untargetable");
    // P1 is never asked to choose a target, and nothing of Teemo's is left on the chain.
    const d = game.decision();
    expect(d?.kind === "pick" && d.seat === P1).toBe(false);
    expect(game.chain().some((c) => c.cardId === "teemo")).toBe(false);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.deck()).toEqual(deckBefore); // nothing revealed, nothing recycled
    expect(game.state("rr").damage).toBe(0);
    // (not "countered" — it simply could not proceed; combat then runs normally: 5 into 2)
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("Ruin Runner + Grunt attack together: Teemo MUST choose the Grunt (Ruin Runner is not offered); the ability resolves — top 5 revealed (2 Hidden) → 2 damage to the Grunt, revealed cards recycled", async () => {
    const game = await board(true).build();
    await game.p2.move(["rr", "grunt"], "bf1");
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      // if asked at all, only the Grunt is a legal choice
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["grunt"]);
      await game.p1.pick("grunt");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, targets: ["grunt"], triggered: true })]);
    await game.acting().pass();
    await game.acting().pass(); // resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("grunt").damage).toBe(2); // z1 + z2 among the top five
    expect(game.state("rr").damage).toBe(0);
    // the five revealed cards went to the bottom; the 6th card is now on top
    const deck = game.p1.deck();
    expect(deck[0]).toBe("s4");
    expect(deck.slice(-5).sort()).toEqual(["s1", "s2", "s3", "z1", "z2"]);
  });
});
