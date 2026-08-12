/**
 * Ruling 4824a3871b2012a0 — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · [9][body][body]
 *     "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and
 *      banish it. Play it, ignoring its cost, and recycle the rest."
 *   × Stupefy (OGN-095 → ogn-095-298) · [Reaction] · [1] "Give a unit -1 [Might] this turn. Draw 1."
 *
 * Q: Can I play Reaction/Action cards on my opponent's turn whenever I like (e.g. at end of turn), or only
 *    in specific windows?
 * A: Only when something gives you priority — a showdown, or the opponent putting a spell or a triggered
 *    ability on the chain. You do NOT get a window merely because their turn is ending. An end-of-turn
 *    trigger such as Dazzling Aurora's is exactly such a chain item, and THAT is what opens the window.
 * Rules: 330–340 (priority follows chain items), 310 (Open/Closed States), 317 (the Ending Phase itself is
 *        not a priority window), 383.3 (a trigger goes on the chain and grants priority).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const STUPEFY = "ogn-095-298";
const SKULKER = "ogn-175-298";

/** P2's turn. P1 has a Reaction and [1] to pay for it; P2 has a bystander to target. */
function board(withAurora: boolean) {
  let s = scenario()
    .active(P2)
    .resources(P1, { energy: 1 })
    .unit(P2, "base", { might: 4, name: "Bystander" }, "bystander")
    .hand(P1, STUPEFY, "stupefy")
    .deck(P2, [SKULKER, SKULKER], ["top", "next"]);
  if (withAurora) {
    s = s.gear(P2, DAZZLING_AURORA, "aurora");
  }
  return s;
}

describe("Ruling 4824a3871b2012a0 — on the opponent's turn you act only when something gives you priority", () => {
  test("during P2's open main phase, with an empty chain, P1 has no decision and cannot play the Reaction", async () => {
    const game = await board(false).build();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.decision()).toBeNull();
    expect(game.p1.legal()).toEqual([]);
    expect(game.p1.can("cast", "stupefy")).toBe(false);
    expect((await game.p1.try((p) => p.cast("stupefy", { targets: "bystander" }))).ok).toBe(false);
  });

  test("ruling: without any trigger, ending P2's turn gives P1 no window at all — play goes straight to P1's own turn", async () => {
    const game = await board(false).build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    expect(game.turnPlayer()).toBe(P1); // P1 never got a decision on P2's turn
    expect(game.zoneOf("stupefy")).toBe("hand");
  });

  test("Dazzling Aurora's end-of-turn ability DOES create a chain item — and that is what opens the window", async () => {
    const game = await board(true).build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P2, triggered: true })]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "stupefy")).toBe(true);
    await game.p1.cast("stupefy", { targets: "bystander" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["aurora", "stupefy"]);
    // LIFO: the Reaction P1 got to play resolves first, on P2's turn.
    for (let i = 0; i < 4 && game.chain().length > 1 && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("bystander").mightModifier).toBe(-1);
    expect(game.p1.hand()).toHaveLength(1); // Stupefy's "Draw 1"
    await game.settle();
    expect(game.violations()).toEqual([]);
  });

  test("the other way in is the opponent playing a spell: that too hands P1 priority mid-turn", async () => {
    const game = await board(false).resources(P2, { energy: 1 }).hand(P2, STUPEFY, "theirStupefy").build();
    expect(game.p1.can("cast", "stupefy")).toBe(false);
    await game.p2.cast("theirStupefy", { targets: "bystander" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "stupefy")).toBe(true);
  });
});
