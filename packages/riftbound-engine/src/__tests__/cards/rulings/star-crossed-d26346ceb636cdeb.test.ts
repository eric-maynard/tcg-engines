/**
 * Ruling d26346ceb636cdeb — Star-Crossed (UNL-128 → unl-128-219) · Reaction · Chaos · [3][chaos]
 *     "Return a friendly unit and an enemy unit to their owners' hands."
 *   × Mindsplitter (OGN-192 → ogn-192-298) · Unit · [7][chaos][chaos] · 7 Might
 *     "When you play me, choose an opponent. They reveal their hand. Choose a card from it, and they discard that card."
 *
 * Q: Can I react to Mindsplitter with Star-Crossed?
 * A: Not to the unit being played — it enters the board immediately without using the chain. But its "When you play me"
 *    trigger DOES go on the chain (Closed State), and you may Star-Cross in reaction to that, choosing a friendly unit and
 *    an enemy unit (Mindsplitter itself is fine). LIFO: Star-Crossed resolves first (both units to hand), then Mindsplitter's
 *    ability resolves against what remains — here it targets a PLAYER, so the reveal/discard still happens.
 * Rules: 356.2 (permanents enter on play; no counter window), 383 (the play trigger is a chain item), 336–343 (Closed
 *        State / Reactions), 340.1 (LIFO), 359.3.e (only instructions tied to an illegal target fail).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";
const MINDSPLITTER = "ogn-192-298";
const SKULKER = "ogn-175-298";
const CLEAVE = "ogn-004-298";

/** P2's turn with exactly [7][chaos][chaos]. P1: Pal (3) at P1's bf1; hand = Star-Crossed, Skulker, Cleave; [3][chaos]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 7, power: { chaos: 2 } })
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Pal" }, "pal")
    .hand(P1, STAR_CROSSED, "star")
    .hand(P1, SKULKER, "keep1")
    .hand(P1, CLEAVE, "keep2")
    .hand(P2, MINDSPLITTER, "ms");
}

async function mindsplitterPlayed(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("ms", { to: "base" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  return game;
}

describe("Ruling d26346ceb636cdeb — you can't react to Mindsplitter entering, but you can Star-Cross in reaction to its play trigger", () => {
  test("the unit is on the board IMMEDIATELY (no window before it lands); what sits on the chain is its 'When you play me' trigger, and P1's hand is not yet touched", async () => {
    const game = await mindsplitterPlayed();
    expect(game.zoneOf("ms")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ms", controller: P2, triggered: true })]);
    expect(game.p1.hand().toSorted()).toEqual(["keep1", "keep2", "star"]);
    // P2 (turn player) holds priority first; P1's first say comes with the trigger already pending.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("with the trigger pending (Closed State) Star-Crossed is a legal Reaction for P1 and may name Pal (friendly) + Mindsplitter itself (enemy)", async () => {
    const game = await mindsplitterPlayed();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "star")).toBe(true);
    const pairs = game.p1.option("cast", "star")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(pairs).toContainEqual(["pal", "ms"]);
    await game.p1.cast("star", { targets: ["pal", "ms"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ms", "star"]);
  });

  test("LIFO: Star-Crossed resolves first — Pal to P1's hand, Mindsplitter back to P2's hand — while Mindsplitter's trigger is still on the chain", async () => {
    const game = await mindsplitterPlayed();
    await game.p2.passPriority();
    await game.p1.cast("star", { targets: ["pal", "ms"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("hand");
    expect(game.zoneOf("ms")).toBe("hand");
    expect(game.p2.hand()).toContain("ms");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ms", triggered: true })]);
  });

  test("then Mindsplitter's ability resolves anyway (its source leaving doesn't matter; it targets a player): P1's hand is revealed, P2 picks a card, P1 discards it", async () => {
    const game = await mindsplitterPlayed();
    await game.p2.passPriority();
    await game.p1.cast("star", { targets: ["pal", "ms"] });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "ms" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["keep1", "keep2", "pal"]); // P1's whole hand, incl. the returned Pal
    await game.p2.pick("keep1");
    await game.settle();
    expect(game.zoneOf("keep1")).toBe("trash");
    expect(game.p1.hand().toSorted()).toEqual(["keep2", "pal"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
