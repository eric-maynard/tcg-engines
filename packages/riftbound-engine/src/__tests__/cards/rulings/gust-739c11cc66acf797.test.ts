/**
 * Ruling 739c11cc66acf797 — Gust (OGN-169 → ogn-169-298) · Reaction · [1]
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might · "When you play a spell, give me +1 [Might] this turn."
 *
 * Q: Can you Gust your OWN 3-Might Ravenbloom Student?
 * A: Yes. Gust fully resolves (Student → hand) before it counts as "played"; the Student's "when you play a
 *    spell" trigger would only fire after that, and by then the Student is in hand, so it never becomes 4
 *    Might in time to dodge Gust. Legality is checked at cast and at resolution — 3 both times.
 * Rules: 349.4/358 (a spell is "played" once it resolves), 383.4 (play triggers fire after the play completes),
 *        355.11 (target re-checked on resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";

/**
 * P1's turn with [1] and Gust. P1's Ravenbloom Student sits at bf1 already at 3 Might (2 printed + 1 this turn
 * from an earlier spell). P2 has a 2-Might unit at bf2 as an alternative Gust target.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student", { mightModifier: 1 })
    .unit(P2, "bf2", { might: 2, name: "Lookout" }, "lookout")
    .hand(P1, GUST, "gust");
}

describe("Ruling 739c11cc66acf797 — you can Gust your own 3-Might Ravenbloom Student", () => {
  test("premise: the Student is exactly 3 Might at a battlefield and is a legal Gust target for its own controller", async () => {
    const game = await board().build();
    expect(game.state("student")).toMatchObject({ baseMight: 2, might: 3, zone: "battlefield-bf1" });
    const targets = game.p1.option("cast", "gust")?.fields.find((f) => f.name === "targets");
    expect(targets?.options).toEqual(expect.arrayContaining([["student"], ["lookout"]]));
  });

  test("casting Gust on the Student: while Gust is on the chain the Student's trigger has NOT fired — still 3 Might, Gust is the only chain item", async () => {
    const game = await board().build();
    await game.p1.cast("gust", { targets: "student" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gust", targets: ["student"], triggered: false })]);
    expect(game.state("student").might).toBe(3);
    await game.p1.passPriority();
    expect(game.chain()).toHaveLength(1);
    expect(game.state("student").might).toBe(3); // still legal when it comes to resolve
  });

  test("Gust resolves: the Student returns to P1's hand; its 'when you play a spell' trigger never lands (+1 to nothing) — no chain item, open main phase", async () => {
    const game = await board().build();
    await game.p1.cast("gust", { targets: "student" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("student")).toBe("hand");
    expect(game.p1.hand()).toEqual(["student"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // Back in hand it is a plain printed-2 card again.
    expect(game.state("student")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  test("control: Gust aimed at the enemy Lookout instead — only AFTER Gust resolves does the Student's trigger go on the chain and make it 4", async () => {
    const game = await board().build();
    await game.p1.cast("gust", { targets: "lookout" });
    await game.p1.passPriority();
    expect(game.state("student").might).toBe(3); // not yet — Gust hasn't resolved
    await game.p2.passPriority();
    expect(game.zoneOf("lookout")).toBe("hand");
    // The play trigger is now pending/on the chain (or already resolved if auto-run); drain it.
    await game.settle();
    expect(game.state("student")).toMatchObject({ might: 4, zone: "battlefield-bf1" });
  });
});
