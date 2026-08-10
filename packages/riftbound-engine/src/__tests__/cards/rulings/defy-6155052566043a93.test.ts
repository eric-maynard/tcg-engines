/**
 * Ruling 6155052566043a93 — Defy (OGN-045 → ogn-045-298) · Reaction [1][calm] "Counter a spell that costs no more than [4]
 *     and no more than [rainbow]."
 *   × Mindsplitter (OGN-192 → ogn-192-298) · 7 [chaos][chaos] · 7 Might "When you play me, choose an opponent. They reveal their hand.
 *     Choose a card from it, and they discard that card."
 *
 * Q: Can you Defy Mindsplitter's ability?
 * A: No. Defy counters a SPELL; Mindsplitter's "When you play me" is a triggered ability, not a spell. The unit itself
 *    can't be responded to (it enters and resolves immediately). You may respond to the trigger once it is on the
 *    chain — but Defy has no legal target there, so it can't be played; the discard happens.
 * Rules: 425.1 (counter), 383.3 (triggered ability on the chain), 340 (permanents resolve immediately), 355.9 (needs a legal target).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const MINDSPLITTER = "ogn-192-298";

/** P1's turn with exactly [7][chaos][chaos] for Mindsplitter. P2 holds Defy + a Keepsake, with [1][calm] to pay for Defy. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { chaos: 2 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: null })
    .hand(P1, MINDSPLITTER, "splitter")
    .hand(P2, DEFY, "defy")
    .hand(P2, { cardType: "unit", energyCost: 3, might: 3, name: "Keepsake" }, "keep");
}

async function splitterPlayed(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("splitter");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  return game;
}

describe("Ruling 6155052566043a93 — Defy cannot counter Mindsplitter's 'When you play me' ability", () => {
  test("the unit itself never sits on the chain: Mindsplitter is already on the board and only its TRIGGERED ABILITY is a chain item", async () => {
    const game = await splitterPlayed();
    expect(game.zoneOf("splitter")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "splitter", controller: P1, triggered: true, type: "ability" })]);
    expect(game.chain().some((c) => c.type === "spell")).toBe(false);
  });

  test("P2 does get priority in response to the trigger — but Defy (\"counter a SPELL\") is not playable: no legal target; a forced attempt is rejected", async () => {
    const game = await splitterPlayed();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(false);
    const r = await game.p2.try((p) => p.cast("defy", { targets: "splitter" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.chain()).toHaveLength(1);
  });

  test("so the ability resolves: P2's hand is revealed, P1 picks Defy itself, and P2 discards it", async () => {
    const game = await splitterPlayed();
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["defy", "keep"]);
    await game.p1.pick("defy");
    await game.settle();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p2.trash()).toContain("defy");
    expect(game.p2.hand()).toEqual(["keep"]);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("splitter")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: Defy IS live against an actual cheap spell on the chain (a 1-cost spell from P1)", async () => {
    const SPARK = {
      abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "fury",
      energyCost: 1,
      name: "Spark",
      timing: "action",
    } as const;
    const game = await board()
      .resources(P1, { energy: 8, power: { chaos: 2 } })
      .hand(P1, SPARK, "spark")
      .unit(P2, "base", { might: 2, name: "Dummy" }, "dummy")
      .build();
    await game.p1.cast("spark", { targets: "dummy" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "spark" });
    await game.settle();
    expect(game.zoneOf("spark")).toBe("trash");
    expect(game.state("dummy").damage).toBe(0);
  });
});
