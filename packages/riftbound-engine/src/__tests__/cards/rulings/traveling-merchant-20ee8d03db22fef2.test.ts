/**
 * Ruling 20ee8d03db22fef2 — Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might
 *     "When I move, discard 1, then draw 1."
 *   × Charm (OGN-043 → ogn-043-298) · Calm · [1][calm] · "Move an enemy unit."
 *
 * Q: When my opponent Charms my Traveling Merchant, does its owner discard and draw?
 * A: Yes. The trigger belongs to the Merchant's controller, so the discard and the draw are performed by
 *    that player — the Charming player's hand is not touched.
 * Rules: 383.2 (a triggered ability is controlled by the object's controller), 419.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

type PickD = Extract<Decision, { kind: "pick" }>;

const TRAVELING_MERCHANT = "ogn-185-298";
const CHARM = "ogn-043-298";

/** P1's main phase. P2's Traveling Merchant sits at home with two spare cards in hand; bf1 is empty. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", TRAVELING_MERCHANT, "merchant")
    .hand(P2, { cardType: "unit", might: 1, name: "Spare A" }, "spareA")
    .hand(P2, { cardType: "unit", might: 1, name: "Spare B" }, "spareB")
    .hand(P1, CHARM, "charm");
}

describe("Ruling 20ee8d03db22fef2 — a Charmed Traveling Merchant makes its OWN controller discard and draw", () => {
  test("Charm moves the enemy Merchant and its 'When I move' trigger goes on the chain", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "merchant", answers: ["bf1"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Charm resolves; the move fires the Merchant's trigger
    expect(game.locationOf("merchant")).toBe("bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P2, triggered: true })]);
  });

  test("ruling: the discard is P2's decision — P2 is asked, not the Charming player", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "merchant", answers: ["bf1"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.passPriority();
    await game.p1.passPriority(); // the trigger resolves → discard prompt
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect((d as PickD).options.map((o) => o.card ?? o.key).sort()).toEqual([
      "spareA",
      "spareB",
    ]);
  });

  test("…P2 discards the named card and P2 draws; P1's hand is untouched", async () => {
    const game = await board().build();
    const p1HandBefore = game.p1.hand().length;
    await game.p1.cast("charm", { targets: "merchant", answers: ["bf1"] });
    game.script(P2, ["spareA"]);
    await game.settle();
    expect(game.zoneOf("spareA")).toBe("trash");
    expect(game.p2.trash()).toContain("spareA");
    expect(game.p2.hand()).toContain("spareB");
    expect(game.p2.hand().length).toBe(2); // spareB + the freshly drawn card
    expect(game.p1.hand().length).toBe(p1HandBefore - 1); // only the Charm left P1's hand
    expect(game.violations()).toEqual([]);
  });
});
