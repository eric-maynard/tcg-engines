/**
 * Ruling 480ad34fbcad4507 — Spirit's Refuge (OGN-063 → ogn-063-298) · Gear · "When you play this, buff a friendly unit.
 *     Friendly buffed units have [Deflect] if they didn't already."
 *   × Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · "At the end of your turn, reveal cards from the top of your Main
 *     Deck until you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest."
 *
 * Q: Does Dazzling Aurora stack if you control multiple copies?
 * A: Yes. Two Auroras = two separate end-of-turn triggers put on the chain together; priority passes; the first resolves
 *    (reveal → play a unit, its play triggers resolve), then the second resolves the same way; the chain closes when all
 *    are done. Multiple instances of the same triggered ability always trigger separately. Spirit's Refuge is the
 *    exception that "doesn't stack" — only because of its "if they didn't already" clause (no second Deflect).
 * Rules: 383 (triggered abilities; each instance triggers), 340 (LIFO chain resolution), 809.2 (granted Deflect sums —
 *        suppressed here by "if they didn't already").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SPIRITS_REFUGE = "ogn-063-298";
const DAZZLING_AURORA = "ogn-160-298";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit
const CLEAVE = "ogn-004-298"; // a non-unit to be revealed and recycled
/** P2's probe: a 1-cost spell that CHOOSES a unit — Deflect adds [rainbow] per Deflect value. */
const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P1 about to end the turn with two Auroras in base (no battlefield → plays land in base); deck: Cleave, Skulker A, Cleave, Skulker B, … */
async function twoAurorasAtEndOfTurn() {
  const game = await scenario()
    .gear(P1, DAZZLING_AURORA, "aurora1")
    .gear(P1, DAZZLING_AURORA, "aurora2")
    .deck(P1, [CLEAVE, SKULKER, CLEAVE, SKULKER], ["spell1", "unitA", "spell2", "unitB"])
    .build();
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  const d = game.decision();
  if (d?.kind === "order") {
    // rule 383.3.d — simultaneous triggers of one controller: that controller orders them
    expect(d.seat).toBe(P1);
    await game.acceptTriggerOrder();
  }
  return game;
}

function twoRefuges(p2Power: number) {
  return scenario()
    .active(P2)
    .gear(P1, SPIRITS_REFUGE, "refuge1")
    .gear(P1, SPIRITS_REFUGE, "refuge2")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally", { buffed: true })
    .resources(P2, { energy: 1, power: { fury: p2Power } })
    .hand(P2, BOLT, "bolt");
}

describe("Ruling 480ad34fbcad4507 — two Dazzling Auroras trigger and resolve separately; Spirit's Refuge's Deflect does not stack", () => {
  test("end of P1's turn: BOTH Aurora triggers go on the chain at once (both P1's), and priority passes for reactions before anything resolves", async () => {
    const game = await twoAurorasAtEndOfTurn();
    expect(game.chain()).toHaveLength(2);
    expect(game.chain()).toEqual([
      expect.objectContaining({ controller: P1, triggered: true }),
      expect.objectContaining({ controller: P1, triggered: true }),
    ]);
    expect(game.chain().map((c) => c.cardId).toSorted()).toEqual(["aurora1", "aurora2"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("unitA")).toBe("mainDeck");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2 may react too
    expect(game.chain()).toHaveLength(2);
  });

  test("both pass → only the FIRST trigger resolves: reveals Cleave then Skulker A and plays A for free; the SECOND trigger is still on the chain with a fresh priority round, Skulker B untouched", async () => {
    const game = await twoAurorasAtEndOfTurn();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("unitA")).toBe("base");
    expect(game.p1.energy()).toBe(0); // ignoring its cost
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ controller: P1, triggered: true });
    expect(game.zoneOf("unitB")).toBe("mainDeck");
    expect(game.p1.deck()[0]).toBe("spell2"); // spell1 recycled to the bottom, A left the deck
    expect(game.p1.deck().at(-1)).toBe("spell1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("both pass again → the second trigger resolves independently: reveals Cleave then Skulker B and plays it; chain closes and the turn passes — both effects happened", async () => {
    const game = await twoAurorasAtEndOfTurn();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("unitA")).toBe("base");
    expect(game.zoneOf("unitB")).toBe("base");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.base()).toEqual(expect.arrayContaining(["aurora1", "aurora2", "unitA", "unitB"]));
    expect(new Set(game.p1.deck().slice(-2))).toEqual(new Set(["spell1", "spell2"])); // both spells recycled
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });

  // "if they didn't already": a unit that already has Deflect (from the other Refuge) is not granted a second one —
  // Deflect value stays 1 (no 809.2 summing), so ONE extra power suffices.
  test("ruling 480ad34fbcad4507 — Deflect from two Spirit's Refuges is granted once (1 power), not summed", async () => {
    const game = await twoRefuges(1).build(); // Bolt's [1] + exactly ONE power for Deflect 1
    expect(game.state("ally").isBuffed).toBe(true);
    expect(game.state("ally").keywords.filter((k) => k === "Deflect")).toHaveLength(1);
    expect(game.p2.can("cast", "bolt")).toBe(true);
    await game.p2.cast("bolt", { targets: "ally" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("ally").damage).toBe(1);
  });

  test("the granted Deflect is real either way: with NO spare power Bolt cannot choose the buffed unit; with power to spare it can", async () => {
    const none = await twoRefuges(0).build();
    expect(none.state("ally").keywords).toContain("Deflect");
    expect((await none.p2.try((p) => p.cast("bolt", { targets: "ally" }))).ok).toBe(false);
    const plenty = await twoRefuges(2).build();
    await plenty.p2.cast("bolt", { targets: "ally" });
    await plenty.settle();
    expect(plenty.state("ally").damage).toBe(1);
  });
});
