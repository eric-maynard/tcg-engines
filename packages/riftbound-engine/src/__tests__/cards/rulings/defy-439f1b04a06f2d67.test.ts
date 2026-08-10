/**
 * Ruling 439f1b04a06f2d67 — Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Called Shot (SFD-122 → sfd-122-221) · Action · [0][chaos] · "[Repeat] [chaos] Look at the top 2 cards of your
 *     Main Deck. Draw one and recycle the other."
 *
 * Q: How does Repeat work on action cards — two chains? Can opponents respond between the repeated effects?
 * A: Repeat is an additional cost chosen as you play the card; it is ONE chain item whose effect runs twice on
 *    resolution with no window in between. Opponents may respond before it resolves. If it is countered (Defy)
 *    the whole card is countered and the Repeat cost stays paid. Called Shot repeated = reveal 2 take 1, then
 *    reveal 2 take 1 (not reveal 4 take 2).
 * Rules: 820 (Repeat = optional additional cost, same item), 354.2 (costs paid at play), 425.1 (countered → no
 *        effect, no refund), 336–340 (one chain, LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const CALLED_SHOT = "sfd-122-221";
const SKULKER = "ogn-175-298";
const CLEAVE = "ogn-004-298";
const BLOCK = "ogn-057-298";

/** P1's turn: Called Shot in hand with exactly 2 chaos; deck top d1..d4. P2: Defy with exactly [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { power: { chaos: 2 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .deck(P1, [SKULKER, CLEAVE, BLOCK, SKULKER], ["d1", "d2", "d3", "d4"])
    .hand(P1, CALLED_SHOT, "cs")
    .hand(P2, DEFY, "defy");
}

describe("Ruling 439f1b04a06f2d67 — Repeat on an action card is one chain item resolving twice; Defy counters all of it", () => {
  test("Repeat is chosen and paid as the card is played: the cast carries a `repeat` field, both chaos are spent, and exactly ONE chain item exists", async () => {
    const game = await board().build();
    expect(game.p1.option("cast", "cs")?.fields.map((f) => String(f.arg))).toContain("repeat");
    await game.p1.cast("cs", { repeat: 1 });
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "cs", controller: P1, triggered: false });
  });

  test("opponents can respond BEFORE it resolves: after P1 passes, P2 holds priority on the chain and Defy is legal against Called Shot", async () => {
    const game = await board().build();
    await game.p1.cast("cs", { repeat: 1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
  });

  test("resolution runs the effect twice with no interruption: look at d1+d2 → take one, then IMMEDIATELY look at d3+d4 → take one (never 4 at once, no P2 decision in between)", async () => {
    const game = await board().build();
    await game.p1.cast("cs", { repeat: 1 });
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves
    const first = game.decision() as PickDecision;
    expect(first).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1, semantics: "from-revealed" });
    expect(first.options.map((o) => o.card)).toEqual(["d1", "d2"]); // reveal 2, not 4
    await game.p1.pick("d1");
    // Straight into the second execution — the next decision is again P1's look, not a priority window for P2.
    const second = game.decision() as PickDecision;
    expect(second).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(second.options.map((o) => o.card)).toEqual(["d3", "d4"]);
    expect(game.zoneOf("cs")).toBe("chain"); // still the same, single resolving item
    await game.p1.pick("d4");
    expect(game.p1.hand().sort()).toEqual(["d1", "d4"]);
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Defy on the Repeat-paid Called Shot: the ENTIRE card is countered (no look, no draw at all), both spells to trash, and the Repeat chaos is not refunded", async () => {
    const game = await board().build();
    await game.p1.cast("cs", { repeat: 1 });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "cs" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cs", "defy"]); // one chain, Defy on top
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.p1.hand()).toEqual([]); // neither execution happened
    expect(game.p1.deck().slice(0, 4)).toEqual(["d1", "d2", "d3", "d4"]);
    expect(game.p1.power("chaos")).toBe(0); // repeat cost stays paid
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("actions need an empty chain: with Called Shot on the chain a second Called Shot (Action) cannot be added, but after it resolves it can", async () => {
    const game = await board().resources(P1, { power: { chaos: 3 } }).hand(P1, CALLED_SHOT, "cs2").build();
    await game.p1.cast("cs", { repeat: 0 });
    expect(game.p1.can("cast", "cs2")).toBe(false);
    await game.settle();
    await game.p1.pick("d1");
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("cast", "cs2")).toBe(true);
  });
});
