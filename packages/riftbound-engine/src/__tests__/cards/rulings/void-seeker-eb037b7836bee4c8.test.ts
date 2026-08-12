/**
 * Ruling eb037b7836bee4c8 — Void Seeker (OGN-024 → ogn-024-298) · Spell · [Action] · [3][fury]
 *   "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · [Action] · "Deal 3 to a unit at a battlefield."
 *   × Stupefy (OGN-095 → ogn-095-298) · [Reaction] · "Give a unit -1 [Might] this turn… Draw 1."
 *
 * Q: My opponent casts Void Seeker on my unit at a battlefield — can I respond with an [Action]-speed spell?
 * A: No. An [Action] can only be played while the chain is EMPTY, so nothing can ever be played "in response"
 *    with it; and on another player's turn you have no [Action] window at all outside a showdown. Only a
 *    [Reaction] can answer the Void Seeker.
 * Rules: 320 ([Action] = your turn or a showdown, empty chain), 336–340 (chain / responses),
 *        321 ([Reaction] may be played any time you have priority).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const HEXTECH_RAY = "ogn-009-298";
const STUPEFY = "ogn-095-298";

/** P2's turn. P1's 5-Might Kai'Sa sits at bf1; P2 holds Void Seeker; P1 holds one [Action] and one [Reaction]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 4, power: { fury: 2, rainbow: 2 } })
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Kai'Sa" }, "kaisa")
    .unit(P2, "base", { might: 2, name: "Grunt" }, "grunt")
    .hand(P2, VOID_SEEKER, "seeker")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, STUPEFY, "stupefy");
}

describe("Ruling eb037b7836bee4c8 — an [Action] spell can never be played in response to Void Seeker", () => {
  test("premise: on P2's turn with an EMPTY chain P1 already has no [Action] window (only a showdown would give one)", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("cast", "ray")).toBe(false);
  });

  test("ruling: with Void Seeker on the chain and priority passed to P1, the [Action] Hextech Ray is still illegal", async () => {
    const game = await board().build();
    await game.p2.cast("seeker", { targets: "kaisa" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker"]);
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "ray")).toBe(false);
    const attempt = await game.p1.try((p) => p.cast("ray", { targets: "kaisa" }));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("ray")).toBe("hand");
  });

  test("…but a [Reaction] IS legal in exactly that window, and resolves first (LIFO)", async () => {
    const game = await board().build();
    await game.p2.cast("seeker", { targets: "kaisa" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "stupefy")).toBe(true);
    await game.p1.cast("stupefy", { targets: "kaisa" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker", "stupefy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("kaisa")).toBe("trash"); // 4 damage on a (5-1=)4-Might unit
    expect(game.violations()).toEqual([]);
  });

  test("contrast: on P1's OWN turn the Hextech Ray is castable — but only while the chain is empty, not on top of a spell", async () => {
    const game = await scenario()
      .turn(4)
      .active(P1)
      .resources(P1, { energy: 4, power: { fury: 2, rainbow: 2 } })
      .resources(P2, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5, name: "Kai'Sa" }, "kaisa")
      .unit(P2, "base", { might: 2, name: "Grunt" }, "grunt")
      .hand(P1, HEXTECH_RAY, "ray")
      .hand(P1, STUPEFY, "stupefy")
      .build();
    expect(game.p1.can("cast", "ray")).toBe(true);
    await game.p1.cast("stupefy", { targets: "kaisa" }); // put something on the chain first
    expect(game.chain().map((c) => c.cardId)).toEqual(["stupefy"]);
    expect(game.p1.can("cast", "ray")).toBe(false); // chain not empty ⇒ no [Action]
  });
});
