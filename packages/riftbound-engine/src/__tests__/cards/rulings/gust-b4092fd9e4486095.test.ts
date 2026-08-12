/**
 * Ruling b4092fd9e4486095 — Gust (OGN-169 → ogn-169-298) · Spell · [1] · [Reaction]
 *   "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Discipline (OGN-058 → ogn-058-298) as the in-response buff, × Ravenbloom Student (OGN-103 → ogn-103-298)
 *     as a "when you play a spell" watcher.
 *
 * Q: If I buff a 2-[Might] unit to 4 in response to Gust choosing it, what happens to Gust?
 * A: Gust still resolves — it just does nothing to the now-illegal target. The target is locked at finalization and
 *    is never re-aimed at another legal unit, and "you played a spell" triggers fire all the same.
 * Rules: 355.10 (targets locked when the card is played), 359.3.e.5/355.15 (an illegal target makes that instruction
 *        fizzle, no re-target), 419.4.a ("when you play a spell" fires after it resolves).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const DISCIPLINE = "ogn-058-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";

/** P1's turn. P2 has a 2-[Might] prey and a spare 2-[Might] body at bf1; P1 has Gust and a Ravenbloom Student. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Prey" }, "prey")
    .unit(P2, "bf1", { might: 2, name: "Spare" }, "spare")
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .hand(P1, GUST, "gust")
    .resources(P1, { energy: 1 })
    .hand(P2, DISCIPLINE, "disc")
    .resources(P2, { energy: 2 });
}

describe("Ruling b4092fd9e4486095 — a Gust whose target grew out of range still resolves, doing nothing", () => {
  test("the target is written onto the Chain item at play and P2 gets a window to answer it", async () => {
    const game = await board().build();
    await game.p1.cast("gust", { targets: "prey" });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "gust", controller: P1, targets: ["prey"], triggered: false }),
    ]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "disc")).toBe(true);
  });

  test("P2's +2 makes it a 4 and Gust fizzles: the unit stays at bf1 and is NOT swapped for the still-legal Spare", async () => {
    const game = await board().build();
    await game.p1.cast("gust", { targets: "prey" });
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "prey" });
    await game.acting().pass();
    await game.acting().pass();
    expect(game.state("prey").might).toBe(4);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gust", targets: ["prey"] })]); // never re-aimed
    await game.acting().pass();
    await game.acting().pass();
    expect(game.zoneOf("gust")).toBe("trash"); // it resolved
    expect(game.zoneOf("prey")).toBe("battlefield-bf1"); // …to no effect
    expect(game.zoneOf("spare")).toBe("battlefield-bf1"); // the other legal unit was never touched
  });

  test("and it still counts as a spell played: the Ravenbloom Student's trigger fires off the fizzled Gust", async () => {
    const game = await board().build();
    await game.p1.cast("gust", { targets: "prey" });
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "prey" });
    await game.settle();
    expect(game.state("prey").might).toBe(4);
    expect(game.zoneOf("prey")).toBe("battlefield-bf1");
    expect(game.state("student")).toMatchObject({ might: 3, mightModifier: 1 });
    expect(game.violations()).toEqual([]);
  });

  test("control — left alone at 2 [Might], the very same Gust does bounce it to P2's hand", async () => {
    const game = await board().build();
    await game.p1.cast("gust", { targets: "prey" });
    await game.settle();
    expect(game.zoneOf("prey")).toBe("hand");
    expect(game.p2.hand()).toContain("prey");
  });
});
