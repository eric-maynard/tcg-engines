/**
 * Ruling dcd3870fd1097ac2 — Rebuke (OGN-172 → ogn-172-298) · [Action] · [2][chaos][chaos] "Return a unit at a battlefield to
 *     its owner's hand."
 *   × Defy (OGN-045 → ogn-045-298) · [Reaction] · [1][calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Vex, Cheerless (SFD-146 → sfd-146-221) · 5 Might "While I'm in combat, friendly spells cost [1][rainbow] less to a
 *     minimum of [1], and enemy spells cost [1][rainbow] more."
 *
 * Q: My Vex is in combat and the opponent Rebukes her. Can I Defy the Rebuke?
 * A (riftjudge): Yes — Rebuke is an Action on the chain so a Reaction may answer it, and Defy checks the spell's PRINTED
 *    cost, not what was actually paid, so Vex's +[1][rainbow] surcharge never pushes a spell out of Defy's range.
 *    (The answer then mis-states Rebuke's printed cost as being inside Defy's range.)
 * Rules: 206 (a card's "cost" is its printed cost), 356.3 (cost increases change what is PAID, not the printed cost),
 *        336/339 (Reaction in response to an Action on the chain), Defy's "no more than [rainbow]" clause.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUKE = "ogn-172-298";
const DEFY = "ogn-045-298";
const VEX_CHEERLESS = "sfd-146-221";
/** Void Seeker (ogn-024-298) · [Action] · [3][fury] "Deal 4 to a unit at a battlefield. Draw 1." — printed 1 power pip. */
const VOID_SEEKER = "ogn-024-298";

/**
 * P2's turn. P1 holds bf1 with Vex, Cheerless; P2's Raider attacks from base so Vex is "in combat". P2 has plenty of
 * resources (10 energy, 3 chaos, 2 fury) so the surcharge is observable; P1 has [3][calm] and Defy in hand.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 10, power: { chaos: 3, fury: 2 } })
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", VEX_CHEERLESS, "vex")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P2, REBUKE, "rebuke")
    .hand(P2, VOID_SEEKER, "vs")
    .hand(P1, DEFY, "defy");
}

const totalPower = (r: { power: Record<string, number> }) => Object.values(r.power).reduce((a, b) => a + b, 0);

/** Raider attacks bf1: combat showdown, empty initial chain, P2 (attacker) holds Focus. */
async function vexInCombat(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("vex").combatRole).toBe("defender");
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

describe("Ruling dcd3870fd1097ac2 — Defy vs a Rebuke aimed at Vex, Cheerless in combat", () => {
  test("Rebuke is an Action: P2 may cast it at Vex during the showdown, paying Vex's enemy surcharge — [3] and 3 power instead of the printed [2] + 2", async () => {
    const game = await vexInCombat();
    expect(game.p2.can("cast", "rebuke")).toBe(true);
    const before = game.p2.resources();
    await game.p2.cast("rebuke", { targets: "vex" });
    const after = game.p2.resources();
    expect(before.energy - after.energy).toBe(3); // 2 + Vex's [1]
    expect(totalPower(before) - totalPower(after)).toBe(3); // [chaos][chaos] + Vex's [rainbow]
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rebuke", controller: P2, targets: ["vex"] })]);
    // Reaction window: after P2 passes, P1 holds priority with Rebuke still on the chain.
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // RULING-CONFLICT: riftjudge dcd3870fd1097ac2 says Rebuke's printed cost "(2 Energy, 2 Power) … is within the range of what
  // Defy can counter"; Defy's printed text says "no more than [rainbow]" (ONE power) and riftjudge 2763a9cdf0b89b90 /
  // 4d66cf9176b76991 rule a two-pip spell (Falling Star) is NOT Defy-able — engine follows the card text (CR 206: compare the
  // printed cost): Rebuke's [chaos][chaos] exceeds [rainbow], so Defy has no legal target here and Rebuke resolves.
  test("Rebuke's PRINTED [chaos][chaos] already exceeds Defy's 'no more than [rainbow]' — Defy is not castable at it; Rebuke resolves and Vex returns to hand", async () => {
    const game = await vexInCombat();
    await game.p2.cast("rebuke", { targets: "vex" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "defy")).toBe(false);
    await game.p1.passPriority();
    await game.settle();
    expect(game.zoneOf("rebuke")).toBe("trash");
    expect(game.zoneOf("vex")).toBe("hand");
    expect(game.p1.hand()).toContain("vex");
  });

  test("the ruling's principle holds on the engine: Vex's surcharge makes P2 PAY [4] + 2 power for Void Seeker (printed [3][fury]), yet Defy still sees the printed cost and counters it — and Defy itself gets Vex's friendly discount ([1], no pip)", async () => {
    const game = await vexInCombat();
    const before = game.p2.resources();
    await game.p2.cast("vs", { targets: "vex" });
    const after = game.p2.resources();
    expect(before.energy - after.energy).toBe(4); // 3 + [1]
    expect(totalPower(before) - totalPower(after)).toBe(2); // [fury] + [rainbow] — "2 power paid" would fail Defy if paid cost counted
    await game.p2.passPriority();

    expect(game.p1.can("cast", "defy")).toBe(true);
    const offered = game.p1.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered.flat()).toContain("vs");
    await game.p1.cast("defy", { targets: "vs" });
    // Friendly spells cost [1][rainbow] less (min [1]): Defy [1][calm] → [1] and no pip.
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "defy"]);

    await game.settle();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("vs")).toBe("trash"); // countered
    expect(game.state("vex").damage).toBe(0); // no 4 damage
    expect(game.locationOf("vex")).toBe("bf1");
    expect(game.p2.hand()).toEqual(["rebuke"]); // no "Draw 1"
    expect(game.violations()).toEqual([]);
  });
});
