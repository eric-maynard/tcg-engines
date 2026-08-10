/**
 * Ruling 9e69dbc808f08336 — Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might · "When I move, discard 1, then draw 1."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] [Action] "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: Can I answer the Merchant's move trigger with Hidden Blade at Reaction speed and kill him? Is he "at a
 *    battlefield" when the trigger goes on the chain?
 * A: Yes — but only if Hidden Blade was already facedown at that battlefield (Hidden ⇒ Reaction from facedown). The
 *    Merchant is at the battlefield (showdown not yet begun) and is a legal target. Killing him does NOT stop his
 *    trigger: it still resolves (discard 1, draw 1). A Hidden Blade in hand is only an [Action] and can't be used here.
 * Rules: 811.6 (facedown Hidden card plays as a Reaction, here), 383 / 359 (a trigger resolves independently of its
 *        source surviving), 344 (showdown opens only once the chain is empty).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MERCHANT = "ogn-185-298";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P2's turn. P1 controls bf1 with a 4-Might Defender and a facedown Hidden Blade there; P1 also holds a second Hidden
 * Blade in hand with [2]+[order] to spare. P2: ready Merchant in base, hand = two junk cards, known deck.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Defender" }, "def")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .hand(P1, HIDDEN_BLADE, "bladeInHand")
    .unit(P2, "base", MERCHANT, "merchant")
    .hand(P2, { cardType: "unit", might: 1, name: "Junk A" }, "junkA")
    .hand(P2, { cardType: "unit", might: 1, name: "Junk B" }, "junkB")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4"]);
}

async function merchantMovesIn(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("merchant", "bf1");
  expect(game.locationOf("merchant")).toBe("bf1"); // he IS at the battlefield already
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P2, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.hand().sort()).toEqual(["junkA", "junkB"]); // nothing discarded/drawn yet — it is a chain item
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 9e69dbc808f08336 — Hidden Blade (facedown there) can kill the Merchant in response to his move trigger; the trigger still resolves", () => {
  test("the facedown Hidden Blade at bf1 is playable at Reaction speed and the Merchant (at bf1, showdown not yet open) is a legal target; a Hidden Blade IN HAND is not playable now", async () => {
    const game = await merchantMovesIn();
    expect(game.p1.can("reveal", "blade")).toBe(true);
    expect(game.p1.can("cast", "bladeInHand")).toBe(false); // [Action] only — not from hand during a chain on P2's turn
    await game.p1.reveal("blade", { answers: ["merchant"] });
    expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([
      ["merchant", undefined],
      ["blade", ["merchant"]],
    ]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1 } }); // played from facedown for [0]
  });

  test("LIFO: Hidden Blade resolves first — Merchant killed, P2 (his controller) draws 2 — and the Merchant's move trigger is STILL on the chain", async () => {
    const game = await merchantMovesIn();
    await game.p1.reveal("blade", { answers: ["merchant"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Blade resolves
    expect(game.zoneOf("merchant")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.hand().sort()).toEqual(["d1", "d2", "junkA", "junkB"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P2, countered: false, triggered: true })]);
  });

  test("the dead Merchant's trigger then resolves in full: P2 is asked what to discard, discards it, then draws 1", async () => {
    const game = await merchantMovesIn();
    await game.p1.reveal("blade", { answers: ["merchant"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Blade
    await game.p2.passPriority();
    await game.p1.passPriority(); // Merchant trigger resolves → discard prompt
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["d1", "d2", "junkA", "junkB"]);
    await game.p2.pick("junkA");
    await game.settle();
    expect(game.zoneOf("junkA")).toBe("trash");
    expect(game.p2.hand().sort()).toEqual(["d1", "d2", "d3", "junkB"]); // −junkA, +d3
    expect(game.chain()).toEqual([]);
    // No attacker left: bf1 stays P1's, Defender untouched, back to P2's main phase.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
