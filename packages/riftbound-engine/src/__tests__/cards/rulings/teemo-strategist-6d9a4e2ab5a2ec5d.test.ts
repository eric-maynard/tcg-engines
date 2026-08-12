/**
 * Ruling 6d9a4e2ab5a2ec5d — Teemo, Strategist (OGN-121 → ogn-121-298) · Unit · Mind · [2][mind] · 2 Might
 *     "[Hidden] … When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to that
 *      unit for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *   × Gust (ogn-169-298) · Reaction · [1] · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Is the target chosen BEFORE the cards are revealed to determine how much damage is dealt?
 * A: Yes. The enemy unit is chosen as the trigger is put on the Chain — only then does the opponent get to react.
 *    The reveal / count / damage / recycle all happen later, when the ability resolves, at the already-chosen unit.
 * Rules: 355.5.b (a triggered ability's targets are chosen when it goes on the Chain), 402 (finalization),
 *        406.4 (reactions before resolution), 359.3.e.5 (an illegal target at resolution simply fizzles).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_STRATEGIST = "ogn-121-298";
const GUST = "ogn-169-298";
const BACK_OFF = "unl-042-219"; // a [Hidden] card, so the reveal counts something
const SKULKER = "ogn-175-298"; // vanilla 3-Might, no [Hidden]

const pickCards = (d: Decision | null): string[] => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/**
 * P2's turn. P1 holds bf1 with Teemo + a Guard; P2's two 3-Might Raiders attack it together (so the choice is real,
 * and both are small enough for Gust). P1's top five cards contain exactly two [Hidden] cards ⇒ 2 damage.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TEEMO_STRATEGIST, "teemo")
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Raider A" }, "raiderA")
    .unit(P2, "base", { might: 3, name: "Raider B" }, "raiderB")
    .deck(P1, [BACK_OFF, SKULKER, BACK_OFF, SKULKER, SKULKER, SKULKER], ["h1", "n1", "h2", "n2", "n3", "n4"])
    .hand(P2, GUST, "gust");
}

/** Pass priority on the chain until it empties (or a non-chain decision appears). */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling 6d9a4e2ab5a2ec5d — Teemo's target is chosen when the trigger goes on the Chain, before any reveal", () => {
  test("the very first decision after the attack is P1 choosing the enemy unit (timing FIN) — no card has been revealed yet and nobody has had a reaction window", async () => {
    const game = await board().build();
    await game.p2.move(["raiderA", "raiderB"], "bf1");
    expect(game.state("teemo").combatRole).toBe("defender");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(pickCards(d).toSorted()).toEqual(["raiderA", "raiderB"]);
    // Nothing has been revealed or recycled: the Main Deck is untouched and still in its built order.
    expect(game.p1.deck().slice(0, 6)).toEqual(["h1", "n1", "h2", "n2", "n3", "n4"]);
    expect(game.state("raiderA").damage).toBe(0);
    expect(game.state("raiderB").damage).toBe(0);
  });

  test("after the choice the trigger sits on the Chain already aimed, and only THEN do players get priority to react", async () => {
    const game = await board().build();
    await game.p2.move(["raiderA", "raiderB"], "bf1");
    await game.p1.pick("raiderB");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, targets: ["raiderB"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.p1.deck().slice(0, 6)).toEqual(["h1", "n1", "h2", "n2", "n3", "n4"]); // still nothing revealed
  });

  test("on resolution the top 5 are revealed, the chosen Raider takes 1 per [Hidden] (2 here) and the five revealed cards are recycled to the bottom", async () => {
    const game = await board().build();
    await game.p2.move(["raiderA", "raiderB"], "bf1");
    await game.p1.pick("raiderB");
    await resolveChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("raiderB").damage).toBe(2);
    expect(game.state("raiderA").damage).toBe(0);
    const deck = game.p1.deck();
    expect(deck[0]).toBe("n4"); // the one built card that was never revealed is now on top
    expect(deck.slice(-5).toSorted()).toEqual(["h1", "h2", "n1", "n2", "n3"]); // all five recycled to the bottom
    expect(game.violations()).toEqual([]);
  });

  test("the choice is locked in: P2 Gusts the chosen Raider in response — the damage is not re-aimed at the other Raider, it simply fizzles", async () => {
    const game = await board().build();
    await game.p2.move(["raiderA", "raiderB"], "bf1");
    await game.p1.pick("raiderB");
    await game.p1.passPriority();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "raiderB" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["teemo", "gust"]);
    await resolveChain(game);
    expect(game.zoneOf("raiderB")).toBe("hand"); // Gust resolved first (LIFO)
    expect(game.state("raiderA").damage).toBe(0); // never re-targeted
    expect(game.violations()).toEqual([]);
  });
});
