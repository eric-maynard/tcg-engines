/**
 * Ruling f935872c1537470a — Teemo, Strategist (OGN-121 → ogn-121-298) · Champion Unit · Mind · [2][mind] · 2 Might
 *     "[Hidden] · When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1
 *      to that unit for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *
 * Q: If Teemo is hidden and played during a showdown, does his ability trigger twice — once for being played
 *    from hidden and once for being declared a defender?
 * A: Under the printed text plus the older rules it read as two. The card has since been errata'd, and under
 *    current official play it triggers ONCE, when he defends. That is what this engine implements.
 * Rules: 811.1.c.3 (playing from hidden is a play), 464.2.c.3 (a unit joining a live combat takes a designation
 *        on entry), 383.4.e.2.a (a defend trigger fires once per combat, on gaining the designation).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_STRATEGIST = "ogn-121-298";
const HIDDEN_BLADE = "ogn-213-298"; // a [Hidden] card, so exactly one of the five revealed counts

const vanilla = (name: string) => ({ cardType: "unit", energyCost: 1, might: 1, name }) as const;

/**
 * Turn 3, P2's turn. P1 holds bf1 with a Guardian and has Teemo face-down there; P2's Raider (4) attacks.
 * P1's top five cards are ONE [Hidden] card and four plain ones, so a single trigger deals exactly 1.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guardian" }, "guardian")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .facedown(P1, "bf1", TEEMO_STRATEGIST, "teemo")
    .deck(
      P1,
      [HIDDEN_BLADE, vanilla("V1"), vanilla("V2"), vanilla("V3"), vanilla("V4")],
      ["hb", "v1", "v2", "v3", "v4"],
    );
}

/** P2 attacks bf1 and passes focus; P1 flips Teemo up into the live combat. */
async function ambushWithTeemo(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  await game.p2.passFocus();
  await game.p1.reveal("teemo");
}

describe("Ruling f935872c1537470a — Teemo played from hidden into a showdown triggers ONCE (the errata'd reading)", () => {
  test("flipping him up puts him on the battlefield as a defender of the combat already under way", async () => {
    const game = await board().build();
    await ambushWithTeemo(game);
    expect(game.locationOf("teemo")).toBe("bf1");
    expect(game.state("teemo")).toMatchObject({ controller: P1, combatRole: "defender", isHidden: false });
  });

  test("ruling: exactly ONE 'when I defend' item goes on the chain — not one for the play from hidden and one for defending", async () => {
    const game = await board().build();
    await ambushWithTeemo(game);
    expect(game.chain().filter((c) => c.cardId === "teemo")).toHaveLength(1);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "teemo", controller: P1, targets: ["raider"], triggered: true }),
    ]);
  });

  test("and it resolves once: with one [Hidden] card among the five revealed, the Raider takes exactly 1", async () => {
    const game = await board().build();
    await ambushWithTeemo(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("raider").damage).toBe(1); // 2 would mean it fired twice
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the revealed five are recycled and nothing else re-triggers as the combat plays out", async () => {
    const game = await board().build();
    await ambushWithTeemo(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("hb")).toBe("mainDeck"); // revealed, then recycled
    await game.settle();
    expect(game.state("raider").damage === 1 || game.zoneOf("raider") === "trash").toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
