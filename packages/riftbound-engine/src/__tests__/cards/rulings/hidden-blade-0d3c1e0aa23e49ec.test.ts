/**
 * Ruling 0d3c1e0aa23e49ec — Hidden Blade (OGN-213 → ogn-213-298) · Action spell · Order · [2]+[order]
 *     "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."
 *   × Retreat (OGN-104 → ogn-104-298) · Reaction · [1]
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *
 * Q: I play Hidden Blade; my opponent Retreats the target, leaving only MY unit at another battlefield as
 *    a would-be valid target. Must I now kill my own unit, or does the Blade have no valid target?
 * A: The target is locked in when Hidden Blade is played (opponent cannot react before that). If it is
 *    moved off the battlefield in response you cannot switch targets; Hidden Blade resolves to no effect
 *    and the opponent does NOT draw.
 * Rules: 355.5 (targets chosen on play), 359.3.e.5 / 359.3.e.14.a (illegal target ⇒ instruction and its
 *        linked follow-up ignored).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const RETREAT = "ogn-104-298";

/**
 * P1's turn, exactly [2]+[order]. P2's Victim at P2's bf1; P1's own Ally at P1's bf2 (the "other valid
 * target"). P2 holds Retreat with exactly [1] and has a rune left in its rune deck to channel.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P1, "bf2", { might: 2, name: "Ally" }, "ally")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P2, RETREAT, "retreat");
}

/** P1 casts Hidden Blade at Victim and passes; P2 answers with Retreat on Victim; Retreat resolves (LIFO). */
async function bladeThenRetreat(): Promise<{ game: Game; p1Hand: number; p2Hand: number; p1Deck: number; p2Deck: number; p2Runes: number }> {
  const game = await board().build();
  const snap = {
    p1Deck: game.p1.deck().length,
    p1Hand: game.p1.hand().length,
    p2Deck: game.p2.deck().length,
    p2Hand: game.p2.hand().length,
    p2Runes: game.p2.runes().length,
  };
  await game.p1.cast("blade", { targets: "victim" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["victim"] })]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "retreat")).toBe(true);
  await game.p2.cast("retreat", { targets: "victim" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "retreat"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Retreat resolves
  return { game, ...snap };
}

describe("Ruling 0d3c1e0aa23e49ec — Hidden Blade's target Retreated away: no retarget, no kill, no draw", () => {
  test("the target is chosen AS Hidden Blade is played — the chain item already names Victim before P2 can react (355.5)", async () => {
    const game = await board().build();
    const offered = game.p1.option("cast", "blade")?.fields.find((f) => f.name === "targets")?.options;
    expect(offered).toEqual(expect.arrayContaining([["victim"], ["ally"]])); // both are legal choices up front
    await game.p1.cast("blade", { targets: "victim" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["victim"] })]);
    expect(game.actingSeat()).toBe(P1); // P2 has had no window yet
  });

  test("Retreat resolves first: Victim returns to P2's hand and P2 channels 1 rune exhausted; Hidden Blade is still pending on Victim", async () => {
    const { game, p2Hand, p2Runes } = await bladeThenRetreat();
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("hand");
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1);
    expect(game.p2.runes()).toHaveLength(p2Runes + 1);
    expect(game.p2.runes({ ready: false })).toHaveLength(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["victim"] })]);
  });

  test("P1 is NOT offered a new target — no pick prompt appears; only priority passes remain before the Blade resolves", async () => {
    const { game } = await bladeThenRetreat();
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    // Walk the remaining priority window by hand: nobody is ever asked to pick.
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      expect(game.decision()?.kind).toBe("action");
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Hidden Blade resolves to NO effect: my Ally at bf2 survives, Victim stays in hand, and NOBODY draws (359.3.e.14.a)", async () => {
    const { game, p1Hand, p2Hand, p1Deck, p2Deck } = await bladeThenRetreat();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf2");
    expect(game.state("ally").damage).toBe(0);
    expect(game.zoneOf("victim")).toBe("hand");
    // No draws anywhere: decks untouched; hands only reflect the spells played and Victim's return.
    expect(game.p1.deck()).toHaveLength(p1Deck);
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1);
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, Hidden Blade kills Victim and its controller (P2) draws 2", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    const p2Deck = game.p2.deck().length;
    await game.p1.cast("blade", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p2.deck()).toHaveLength(p2Deck - 2);
    expect(game.zoneOf("ally")).toBe("battlefield-bf2");
  });
});
