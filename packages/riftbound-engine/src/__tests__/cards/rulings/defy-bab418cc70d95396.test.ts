/**
 * Ruling bab418cc70d95396 — Defy (OGN-045 → ogn-045-298) · Spell · Calm · 1+[calm] · Reaction
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Called Shot (SFD-122 → sfd-122-221) · Spell · Chaos · 0+[chaos] · Action
 *     "[Repeat] [chaos] … Look at the top 2 cards of your Main Deck. Draw one and recycle the other."
 *
 * Q: How does Defy interact with Called Shot (in particular when the Repeat cost was paid)?
 * A: Defy checks Called Shot's PRINTED cost ([0]+[chaos]), not the increased total when Repeat was paid, so it can
 *    target it either way. Called Shot is finalized (Repeat chosen, costs paid), the opponent responds with Defy; when
 *    Defy resolves Called Shot is removed from the chain — no look, no draw.
 * Rules: 820 (Repeat is an optional additional cost), 356 (total cost vs printed cost), 425.1 (countered spell leaves
 *        the chain without effect; costs not refunded).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const CALLED_SHOT = "sfd-122-221";

/** P1's turn: Called Shot with exactly 2 chaos (base pip + Repeat); known deck d1..d4. P2: Defy with exactly 1+[calm]. */
function board() {
  return scenario()
    .resources(P1, { power: { chaos: 2 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .deck(P1, ["ogn-175-298", "ogn-004-298", "ogn-057-298", "ogn-175-298"], ["d1", "d2", "d3", "d4"])
    .hand(P1, CALLED_SHOT, "cs")
    .hand(P2, DEFY, "defy");
}

const defyTargets = (game: Game) => (game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[];

describe("Ruling bab418cc70d95396 — Defy counters Called Shot by its printed cost, Repeat paid or not", () => {
  test("Called Shot WITH Repeat: it is finalized as one item with both chaos paid (total 2 power > [rainbow]) — yet after P1 passes, Defy is legal and offers Called Shot as a target (printed cost [0]+[chaos])", async () => {
    const game = await board().build();
    await game.p1.cast("cs", { repeat: 1 });
    expect(game.p1.power("chaos")).toBe(0); // base [chaos] + Repeat [chaos]
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cs", controller: P1 })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(defyTargets(game)).toEqual(["cs"]);
  });

  test("Defy is added targeting Called Shot; when it resolves Called Shot is removed from the chain — no look, no draw (deck untouched), both spells in the trash, nothing refunded", async () => {
    const game = await board().build();
    await game.p1.cast("cs", { repeat: 1 });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "cs" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cs", "defy"]);
    // "maybe there are reactions" — none here: both pass and Defy resolves.
    await game.p2.passPriority();
    await game.p1.passPriority();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck().slice(0, 4)).toEqual(["d1", "d2", "d3", "d4"]);
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Called Shot WITHOUT Repeat is (of course) also a legal Defy target and is countered the same way", async () => {
    const game = await board().build();
    await game.p1.cast("cs", { repeat: 0 });
    expect(game.p1.power("chaos")).toBe(1);
    await game.p1.passPriority();
    expect(defyTargets(game)).toEqual(["cs"]);
    await game.p2.cast("defy", { targets: "cs" });
    await game.settle();
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
  });
});
