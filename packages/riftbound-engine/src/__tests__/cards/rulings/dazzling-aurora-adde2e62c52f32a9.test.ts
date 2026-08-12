/**
 * Ruling adde2e62c52f32a9 — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · [9][body][body]
 *   "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish
 *    it. Play it, ignoring its cost, and recycle the rest."
 *   × Retreat (OGN-104 → ogn-104-298) · Spell · [1] · [Reaction] (the reaction being held).
 *
 * Q: Can you play a Reaction at the end of your turn when no end-of-turn trigger exists?
 * A: No. Reactions need priority, and priority only exists in a showdown or while something is on the Chain.
 *    With nothing triggering at end of turn the turn just ends. An end-of-turn trigger such as Dazzling
 *    Aurora's DOES put an item on the Chain, and that is the window in which the Reaction can be played.
 * Rules: 340 / 444.2 (priority windows), 383 (a trigger creates the Closed State), 317 (Ending Phase).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const RETREAT = "ogn-104-298";

/** P1 holds a Reaction and a unit to bounce; `withAurora` adds the end-of-turn trigger source. */
function holdingAReaction(withAurora: boolean) {
  const s = scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", { might: 2, name: "Rearguard" }, "ally")
    .hand(P1, RETREAT, "retreat");
  return withAurora ? s.gear(P1, DAZZLING_AURORA, "aurora") : s;
}

describe("Ruling adde2e62c52f32a9 — a Reaction at end of turn needs an end-of-turn trigger to react to", () => {
  test("with no end-of-turn trigger, ending the turn opens no window at all: the turn simply passes to P2", async () => {
    const game = await holdingAReaction(false).build();
    expect(game.p1.can("cast", "retreat")).toBe(true); // castable NOW, in the open main phase
    await game.p1.endTurn();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("retreat")).toBe("hand"); // never got to be played
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("with Dazzling Aurora in play the end-of-turn trigger goes on the Chain and P1 may cast the Reaction into it", async () => {
    const game = await holdingAReaction(true).build();
    await game.p1.endTurn();
    expect(game.chain().map((c) => c.cardId)).toEqual(["aurora"]);
    expect(game.chain()[0]).toMatchObject({ controller: P1, triggered: true });
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "retreat")).toBe(true);
    await game.p1.cast("retreat", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["aurora", "retreat"]); // reaction sits on top
    await game.settle();
    expect(game.zoneOf("ally")).toBe("hand"); // Retreat resolved first (LIFO)
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the opponent gets the same window — P2 also holds priority while the Aurora trigger is on the Chain", async () => {
    const game = await holdingAReaction(true).hand(P2, RETREAT, "p2retreat").resources(P2, { energy: 1 }).build();
    await game.p1.endTurn();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.decision()).toMatchObject({ context: "chain", kind: "action" });
  });
});
