/**
 * Ruling 41349a007cdfbb0f — Fading Memories (OGN-180 → ogn-180-298) · Spell · Chaos · [4][chaos]
 *     "Give a unit at a battlefield or a gear [Temporary]. (Kill it at the start of its controller's Beginning Phase,
 *      before scoring.)"
 *   × Loose Cannon (Jinx legend, OGN-251 → ogn-251-298) "At start of your Beginning Phase, draw 1 if you have one or
 *     fewer cards in your hand."
 *
 * Q: I give an OPPONENT's unit Temporary with Fading Memories; that opponent also has Loose Cannon's beginning-phase
 *    trigger. Who controls the two triggers and can they be ordered?
 * A: The opponent controls both — Temporary's kill trigger belongs to the unit's CONTROLLER, not to whoever granted
 *    the keyword — and orders them as they choose.
 * Rules: 383.3.d (simultaneous triggers of one controller are ordered by that player), 816 (Temporary: kill at the start of
 *        its controller's Beginning Phase), 383.2 (a triggered ability is controlled by its source's controller).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FADING_MEMORIES = "ogn-180-298";
const LOOSE_CANNON = "ogn-251-298";

type OrderD = Extract<Decision, { kind: "order" }>;

/**
 * P1's turn with exactly [4][chaos]. P2's legend is Loose Cannon and P2's hand is EMPTY (≤ 1 → the draw condition
 * holds); P2's 3-Might Doomed stands at P2's bf1. Known P2 deck.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .legend(P2, LOOSE_CANNON, "jinx")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Doomed" }, "doomed")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["p2a", "p2b", "p2c"])
    .hand(P1, FADING_MEMORIES, "fm");
}

/** P1 gives Doomed Temporary and ends the turn; returns at the first decision of P2's turn. */
async function temporaryThenEndTurn(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("fm", { targets: "doomed" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.settle();
  expect(game.zoneOf("fm")).toBe("trash");
  expect(game.state("doomed").keywords).toContain("Temporary");
  expect(game.state("doomed").controller).toBe(P2); // Fading Memories only grants the keyword — no control change
  expect(game.p2.hand()).toEqual([]);
  await game.p1.endTurn();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.phase()).toBe("beginning");
  return game;
}

describe("Ruling 41349a007cdfbb0f — Temporary from Fading Memories triggers under the UNIT'S CONTROLLER, who orders it with their own Loose Cannon trigger", () => {
  test("at the start of P2's Beginning Phase BOTH triggers exist and both are controlled by P2 (not by P1 who cast Fading Memories)", async () => {
    const game = await temporaryThenEndTurn();
    const items = game.chain();
    expect(items.map((c) => c.cardId).sort()).toEqual(["doomed", "jinx"]);
    expect(items.every((c) => c.triggered && c.controller === P2)).toBe(true);
    expect(items.some((c) => c.controller === P1)).toBe(false);
  });

  test("P2 — the controller of both — is the seat offered the ORDER decision over exactly those two triggers", async () => {
    const game = await temporaryThenEndTurn();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P2 });
    expect((d as OrderD).items.map((i) => i.card).sort()).toEqual(["doomed", "jinx"]);
    // P1 is not the one asked.
    expect(game.p1.decision()?.kind).not.toBe("order");
  });

  test("P2 may put Loose Cannon on top (resolves first): P2 draws 1 while Doomed is still alive, then the Temporary kill resolves — Doomed to P2's trash", async () => {
    const game = await temporaryThenEndTurn();
    const d = game.decision() as OrderD;
    const doomedKey = d.items.find((i) => i.card === "doomed")?.key as string;
    const jinxKey = d.items.find((i) => i.card === "jinx")?.key as string;
    await game.p2.order([doomedKey, jinxKey]); // first = bottom, last = top → jinx resolves first
    expect(game.chain().map((c) => c.cardId)).toEqual(["doomed", "jinx"]);
    // Resolve the top item only.
    for (let i = 0; i < 4 && game.chain().length === 2; i++) {
      await game.acting().passPriority();
    }
    expect(game.p2.hand()).toEqual(["p2a"]); // drew off Loose Cannon (hand was 0 ≤ 1)
    expect(game.zoneOf("doomed")).toBe("battlefield-bf1"); // not dead yet
    await game.settle();
    expect(game.zoneOf("doomed")).toBe("trash");
    expect(game.p2.trash()).toContain("doomed");
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("…or the other way round: Temporary kill on top resolves first (Doomed dies), then Loose Cannon draws — same end state, P2's choice of order", async () => {
    const game = await temporaryThenEndTurn();
    const d = game.decision() as OrderD;
    const doomedKey = d.items.find((i) => i.card === "doomed")?.key as string;
    const jinxKey = d.items.find((i) => i.card === "jinx")?.key as string;
    await game.p2.order([jinxKey, doomedKey]); // doomed on top
    expect(game.chain().map((c) => c.cardId)).toEqual(["jinx", "doomed"]);
    for (let i = 0; i < 4 && game.chain().length === 2; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("doomed")).toBe("trash");
    expect(game.p2.hand()).toEqual([]); // Loose Cannon hasn't resolved yet
    await game.settle();
    expect(game.p2.hand()).toContain("p2a");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});
