/**
 * Ruling 093cf6d131847ab8 — Harnessed Dragon (OGN-234 → ogn-234-298) × Portal Rescue (OGN-102 → ogn-102-298)
 *   Harnessed Dragon: 8 + [order][order] unit, 6 Might — "When you play me, kill an enemy unit."
 *   Portal Rescue: 3-cost [Action] — "Banish a friendly unit, then its owner plays it to their base, ignoring its cost."
 *
 * Q: If the unit targeted by the Dragon's kill is Portal Rescued in response, does the kill still resolve
 *    (the unit being back on the board when the kill resolves)?
 * A: No. A unit that left the board stopped being a legal target; the one that came back is a new object, so
 *    the kill fizzles. Nuance: Portal Rescue is an [Action], so it cannot actually be played in response to
 *    the trigger in the first place.
 * Rules: 359.3.e (illegal/absent target ⇒ instruction not executed), 124 / 124.1 (zone change ⇒ new object),
 *        Action timing (your turn / showdowns only) vs Reaction.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARNESSED_DRAGON = "ogn-234-298";
const PORTAL_RESCUE = "ogn-102-298";

/**
 * The principle needs a legal responder: an inline REACTION-speed copy of Portal Rescue's exact parsed effect
 * ("Banish a friendly unit, then its owner plays it to their base, ignoring its cost").
 */
const REACTION_RESCUE = {
  abilities: [
    {
      effect: {
        effects: [
          { target: { controller: "friendly", type: "unit" }, type: "banish" },
          { ignoreCost: true, target: { type: "pending-value" }, toLocation: "base", type: "play" },
        ],
        pendingValue: { source: 0 },
        type: "sequence",
      },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "mind",
  energyCost: 3,
  name: "Test Reaction Rescue",
  rulesText: "[Reaction] Banish a friendly unit, then its owner plays it to their base, ignoring its cost.",
  timing: "reaction",
};

function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { order: 2 } })
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { energyCost: 2, might: 3, name: "Victim" }, "victim")
    .hand(P1, HARNESSED_DRAGON, "dragon")
    .hand(P2, PORTAL_RESCUE, "rescue")
    .hand(P2, REACTION_RESCUE, "rescueRx");
}

/** P1 plays the Dragon; its play trigger goes on the chain aimed at the only enemy unit; P1 passes to P2. */
async function dragonTriggerPending(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("dragon");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", controller: P1, targets: ["victim"], triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

describe("Ruling 093cf6d131847ab8 — Harnessed Dragon's kill fizzles if its target left and re-entered the board; Portal Rescue itself can't respond", () => {
  test("nuance: with the Dragon's trigger on the chain (Closed state, P1's turn), P2 can NOT cast Portal Rescue — it is an [Action]", async () => {
    const game = await dragonTriggerPending();
    expect(game.p2.can("cast", "rescue")).toBe(false);
    const r = await game.p2.try((p) => p.cast("rescue", { targets: "victim" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("rescue")).toBe("hand");
    expect(game.p2.energy()).toBe(3);
  });

  test("control: with no response the trigger resolves and kills the Victim", async () => {
    const game = await dragonTriggerPending();
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.chain()).toEqual([]);
  });

  test("the principle: a Reaction-speed rescue resolves first (LIFO) — Victim is banished and replayed to P2's base as a new object — then the Dragon's kill finds no legal target and does nothing", async () => {
    const game = await dragonTriggerPending();
    expect(game.p2.can("cast", "rescueRx")).toBe(true);
    await game.p2.cast("rescueRx", { targets: "victim" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dragon", "rescueRx"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // rescue resolves
    // Any "owner plays it" prompt belongs to P2 (the owner); a forced single option is auto-taken by settle().
    const r = await game.settle();
    if (r.reason === "unanswered" && game.decision()?.seat === P2) {
      await game.p2.pick("base");
      await game.settle();
    }
    expect(game.chain()).toEqual([]);
    // Victim survived: it sits in P2's base (it was on the board when the kill resolved, but as a NEW object).
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim")).toMatchObject({ controller: P2, damage: 0, location: "base", owner: P2 });
    expect(game.p2.trash()).not.toContain("victim");
    // The Dragon itself resolved fine; only its kill instruction fizzled.
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.zoneOf("rescueRx")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
