/**
 * Ruling 140600539315a1f0 — Discipline (OGN-058 → ogn-058-298) · Spell · Calm · 2 · [Reaction]
 *     "Give a unit +2 [Might] this turn. Draw 1."
 *   × Gust (ogn-169-298) · Spell · 1 · [Reaction] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: If my Discipline target gets Gusted in response, do I still draw?
 * A: Yes. Gust resolves first and returns the unit; when Discipline resolves the +2 Might can't be applied (its target left
 *    play) but "Draw 1" is a separate, unconditional instruction and still executes — a spell resolves as much as it can.
 * Rules: 359.3.e.5 (an instruction whose target is gone is skipped; the rest still resolves), 340 (LIFO), 359 (resolve as
 *        much as possible).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";
const GUST = "ogn-169-298";

/** P1's turn. P1's Scout (2) sits at P1's bf1; P1 has Discipline + [2]; P2 has Gust + [1]. Known top card for P1. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
    .unit(P1, "bf1", { might: 4, name: "Anchor" }, "anchor") // keeps bf1 P1's after the Scout leaves
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, GUST, "gust")
    .deck(P1, ["ogn-175-298"], ["topcard"]);
}

/** Discipline at Scout → P1 passes → P2 Gusts the Scout in response. */
async function disciplineThenGust(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("disc", { targets: "scout" });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.cast("gust", { targets: "scout" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "gust"]);
  return game;
}

describe("Ruling 140600539315a1f0 — Discipline's target Gusted away: no +2, but the Draw 1 still happens", () => {
  test("LIFO: Gust resolves first and returns the Scout to P1's hand while Discipline is still on the chain", async () => {
    const game = await disciplineThenGust();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc", controller: P1, targets: ["scout"] })]);
  });

  test("Discipline then resolves as much as it can: the +2 has no legal target (nothing is pumped, the Scout in hand is a fresh card), but P1 STILL draws 1", async () => {
    const game = await disciplineThenGust();
    const handAfterGust = () => game.p1.hand().length;
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust
    const before = handAfterGust(); // includes the returned Scout
    expect(game.p1.hand()).not.toContain("topcard");
    await game.settle(); // Discipline
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(before + 1);
    expect(game.p1.hand()).toContain("topcard"); // the draw happened
    expect(game.p1.hand()).toContain("scout");
    expect(game.state("scout").mightModifier).toBe(0); // no +2 followed it to hand
    expect(game.state("anchor")).toMatchObject({ might: 4, mightModifier: 0 }); // not re-targeted onto something else
    expect(game.violations()).toEqual([]);
  });

  test("control — unanswered, Discipline does both: Scout to 4 Might this turn and P1 draws 1", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("disc", { targets: "scout" });
    await game.settle();
    expect(game.state("scout")).toMatchObject({ might: 4, mightModifier: 2 });
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.p1.hand()).toContain("topcard");
  });
});
