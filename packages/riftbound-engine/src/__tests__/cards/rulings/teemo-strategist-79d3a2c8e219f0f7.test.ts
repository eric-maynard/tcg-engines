/**
 * Ruling 79d3a2c8e219f0f7 — Teemo, Strategist (OGN-121 → ogn-121-298) · Unit · Mind · [2][mind] · 2 Might
 *   "[Hidden] When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck.
 *    Deal 1 to that unit for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *
 * Q: Does Teemo, Strategist hit ALL attacking units while he defends?
 * A: No. You choose exactly ONE enemy unit at his battlefield; all the damage from the revealed [Hidden]
 *    cards goes to that single unit, no matter how many are revealed.
 * Rules: 355.10.d (a singular target is one chosen object), 464.2.c (defend trigger), 359.3 (resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_STRATEGIST = "ogn-121-298";
const HIDDEN_BLADE = "ogn-213-298"; // has [Hidden]
const SKULKER = "ogn-175-298"; // 3-Might vanilla, no [Hidden]

/** P2's turn. P1 holds bf1 with Teemo; P1's top 5 are exactly two [Hidden] cards and three plain ones. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TEEMO_STRATEGIST, "teemo")
    .unit(P2, "base", { might: 5, name: "Raider A" }, "raiderA")
    .unit(P2, "base", { might: 5, name: "Raider B" }, "raiderB")
    .deck(P1, [HIDDEN_BLADE, SKULKER, HIDDEN_BLADE, SKULKER, SKULKER]);
}

describe("Ruling 79d3a2c8e219f0f7 — Teemo, Strategist damages exactly one chosen attacker, never the whole attacking force", () => {
  test("two attackers arrive together: the defend trigger asks P1 for ONE of them (min 1 / max 1), offering both", async () => {
    const game = await board().build();
    await game.p2.move(["raiderA", "raiderB"], "bf1");
    expect(game.state("raiderA").combatRole).toBe("attacker");
    expect(game.state("raiderB").combatRole).toBe("attacker");
    expect(game.state("teemo").combatRole).toBe("defender");

    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, min: 1, max: 1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["raiderA", "raiderB"]);
  });

  test("only the chosen Raider takes the 2 damage (two [Hidden] among the five revealed); the other is untouched", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await game.p2.move(["raiderA", "raiderB"], "bf1");
    await game.p1.pick("raiderA");
    await game.p1.passPriority();
    await game.p2.passPriority();

    expect(game.state("raiderA").damage).toBe(2);
    expect(game.state("raiderB").damage).toBe(0);
    expect(game.p1.deck()).toHaveLength(deck0); // "then recycle the revealed cards" — all five go back into the deck
    expect(game.violations()).toEqual([]);
  });

  test("picking the other Raider moves ALL of the damage there — the split never happens", async () => {
    const game = await board().build();
    await game.p2.move(["raiderA", "raiderB"], "bf1");
    await game.p1.pick("raiderB");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("raiderB").damage).toBe(2);
    expect(game.state("raiderA").damage).toBe(0);
  });
});
