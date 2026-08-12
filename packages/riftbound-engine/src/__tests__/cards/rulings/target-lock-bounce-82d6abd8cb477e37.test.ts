/**
 * Ruling 82d6abd8cb477e37 — (no specific card) a bounce Reaction resolving under a damage spell.
 *   Stand-ins: Hextech Ray (OGN-009 → ogn-009-298) · [1][fury] [Action] "Deal 3 to a unit at a battlefield";
 *   Gust (OGN-169 → ogn-169-298) · [1][chaos] [Reaction] "Return a unit at a battlefield with 3 [Might] or
 *   less to its owner's hand"; inline "Test Bolt" ([Action] "Deal 3 to a unit. Draw 1.") for the two-
 *   instruction case.
 *
 * Q: A Reaction resolves first and bounces the unit my damage spell is aimed at — may the damage spell pick
 *    a new target because it resolves later?
 * A: No. Targets are locked when the spell is played onto the chain. The bounce resolves first (LIFO); the
 *    damage spell then finds an illegal target, that object is simply unaffected, and no replacement target
 *    is chosen. Unlinked instructions on the same card (a plain "Draw 1") still happen.
 * Rules: 355.15 (choices cannot change after they are made), 359.3.e.5 (an illegal target is unaffected and
 *        instructions related to it are ignored — the rule's own Void Seeker example still draws),
 *        340.1 (the chain resolves newest first).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const GUST = "ogn-169-298";

const BOLT_AND_DRAW = {
  abilities: [
    {
      effect: {
        effects: [
          { amount: 3, target: { type: "unit" }, type: "damage" },
          { amount: 1, type: "draw" },
        ],
        type: "sequence",
      },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  rulesText: "[Action] Deal 3 to a unit. Draw 1.",
  timing: "action",
} as const;

/** P1's turn. P2 holds bf1 with two 3-Might bodies; P1 has the Ray, P2 has the Gust. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 1, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Squire" }, "squire")
    .unit(P2, "bf1", { might: 3, name: "Page" }, "page")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, GUST, "gust");
}

describe("Ruling 82d6abd8cb477e37 — a bounced target is not re-chosen; the damage simply does not land", () => {
  test("the Ray's target is locked on the chain and stays locked while the Gust sits above it", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "squire" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P1, targets: ["squire"] })]);
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "squire" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "gust"]); // Gust is newest → resolves first
    expect(game.chain()[0]).toMatchObject({ targets: ["squire"] }); // still the Squire, 355.15
  });

  test("the Gust resolves, the Squire is in hand, and the Ray deals its 3 to NOBODY — the untouched Page is not picked up as a new target", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "squire" });
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("hand");
    expect(game.state("squire").damage).toBe(0);
    expect(game.state("page").damage).toBe(0); // no re-target (359.3.e.5 / 355.15)
    expect(game.zoneOf("ray")).toBe("trash"); // the spell did resolve, it just affected nothing
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("a spell with a second, unrelated instruction keeps it: the damage is ignored, the Draw 1 still happens", async () => {
    const game = await scenario()
      .resources(P2, { energy: 1, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Squire" }, "squire")
      .hand(P1, BOLT_AND_DRAW, "bolt")
      .hand(P2, GUST, "gust")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("bolt", { targets: "squire" });
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("hand");
    expect(game.state("squire").damage).toBe(0);
    // one card left the hand (the Bolt) and one came back in (the draw)
    expect(game.p1.hand()).toHaveLength(handBefore);
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control: with no bounce the very same Ray lands its 3 and kills the 3-Might Squire — so the fizzle above is the bounce, not a broken spell", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.state("page").damage).toBe(0);
  });
});
