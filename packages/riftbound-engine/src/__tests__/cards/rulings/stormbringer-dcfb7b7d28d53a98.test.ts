/**
 * Ruling dcfb7b7d28d53a98 — Stormbringer (OGN-250 → ogn-250-298) · Spell · 6+[rainbow][rainbow]
 *     "Choose a friendly unit in your base. Deal damage equal to its Might to all enemy units at a battlefield, then move
 *      your unit there."
 *   × Volibear, Furious (ogn-041-298) 9 Might "[Deflect 2] … When I attack, deal 5 damage split among any number of enemy units here."
 *   × Sett, Kingpin (ogn-240-298) 5 Might "[Tank] I get +1 [Might] for each buffed friendly unit at my battlefield."
 *   × Hidden Blade (ogn-213-298) "[Hidden] … Kill a unit at a battlefield. Its controller draws 2." — P2's, facedown at bf1
 *
 * Q: Stormbringer sends Volibear (9) into P2's battlefield holding a buffed Sett (10 with three other buffed units) —
 *    one Cleanup or two, and can P2 answer with the Hidden Blade?
 * A (riftjudge, pre-current-CR): two Cleanups — the first kills the three buffed units and drops Sett to 7 with 9 damage,
 *    Sett lingers as a "zombie" while combat is staged, Volibear's attack trigger opens a window for Hidden Blade, and
 *    Sett dies at the next Cleanup. The ruling itself flags the zombie interaction as "to be addressed in the next CR".
 * Rules: 321/322 (a Cleanup whose events qualify for a Cleanup is followed by another IMMEDIATELY), 323.5 (lethal ⇒ killed),
 *        323.6/323.7 (control + hidden cards lapse in an Open State with no showdown ongoing there), 323.8–323.13.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STORMBRINGER = "ogn-250-298";
const VOLIBEAR = "ogn-041-298";
const SETT_KINGPIN = "ogn-240-298";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P1's turn with exactly 6 + 2 rainbow; Volibear (9) in P1's base. P2 holds bf1 with a BUFFED Sett, Kingpin and three
 * buffed 2-Might units (Sett = 5 + 1 buff + 4 buffed friends here = 10) and has Hidden Blade facedown there.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", VOLIBEAR, "voli")
    .unit(P2, "bf1", SETT_KINGPIN, "sett", { buffed: true })
    .unit(P2, "bf1", { might: 2, name: "B1" }, "b1", { buffed: true })
    .unit(P2, "bf1", { might: 2, name: "B2" }, "b2", { buffed: true })
    .unit(P2, "bf1", { might: 2, name: "B3" }, "b3", { buffed: true })
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
    .hand(P1, STORMBRINGER, "storm");
}

const showdowns = (game: Game) => game.gameState.interaction?.showdownStack ?? [];

/** Cast Stormbringer (Volibear → bf1); both pass; stop at whatever the Cleanup after its resolution hands back. */
async function stormResolves(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sett").might).toBe(10);
  expect(game.state("b1").might).toBe(3);
  await game.p1.cast("storm", { targets: ["voli", "bf1"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "storm", targets: ["voli", "bf1"] })]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.p1.passPriority();
  // P2's only response window is HERE, before Stormbringer resolves — and Hidden Blade IS offered in it.
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "blade")).toBe(true);
  await game.p2.passPriority();
  expect(game.zoneOf("storm")).toBe("trash");
  return game;
}

describe("Ruling dcfb7b7d28d53a98 — Stormbringer/Volibear into buffed Sett: what the Cleanups do", () => {
  test("Stormbringer resolves: 9 damage (Volibear's Might) is dealt to Sett AND each of the three buffed units, and Volibear moves to bf1", async () => {
    const game = await stormResolves();
    const hits = (game.gameState.damageLog ?? []).filter((r) => !r.combat);
    expect(hits.map((r) => [r.target, r.amount]).sort()).toEqual([
      ["b1", 9],
      ["b2", 9],
      ["b3", 9],
      ["sett", 9],
    ]);
    expect(game.locationOf("voli")).toBe("bf1");
  });

  test("first Cleanup: the three buffed units (3 Might each) have lethal damage and die", async () => {
    const game = await stormResolves();
    for (const b of ["b1", "b2", "b3"]) {
      expect(game.zoneOf(b)).toBe("trash");
    }
    expect(game.p2.trash()).toEqual(expect.arrayContaining(["b1", "b2", "b3"]));
  });

  // RULING-CONFLICT: riftjudge dcfb7b7d28d53a98 says Sett (now 7 Might, 9 damage) survives the first Cleanup as a "zombie"
  // until a second Cleanup after the next chain resolution; CR 322 says a Cleanup whose events qualify for a Cleanup is
  // followed by another Cleanup IMMEDIATELY (before any item is finalized or any player acts), and 323.5 kills every unit
  // with lethal damage in it — engine follows CR: Sett dies in the chained Cleanup, before anyone gets Focus or priority.
  test("chained Cleanup (322): with his buffed friends gone Sett is 5+1 Might carrying 9 — lethal — and is killed at once; no P2 unit remains at bf1 before any player can act", async () => {
    const game = await stormResolves();
    expect(game.zoneOf("sett")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.cardsAt("bf1")).toEqual(["voli"]);
  });

  // RULING-CONFLICT: riftjudge dcfb7b7d28d53a98 says a Combat is staged with Sett defending, Volibear's "When I attack"
  // triggers and P2 may answer it with the facedown Hidden Blade; CR 190.4/323.6/323.7 (+ official 9a32c2cc829f221a) say
  // that with no P2 unit left in an Open State and no showdown yet ongoing there P2 loses control of bf1 and its Hidden card
  // is trashed in the same Cleanup, and 323.9/323.10 stage no Combat without opposing units — engine follows CR: bf1 is
  // uncontrolled + contested by P1, ONE non-combat showdown opens, Volibear is not an attacker, nothing triggers, and
  // Hidden Blade is already in P2's trash.
  test("no zombie combat: bf1 uncontrolled, Hidden Blade trashed with P2's control, a NON-combat showdown opens for Volibear with an empty chain — no attack trigger, no Hidden Blade window", async () => {
    const game = await stormResolves();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.zoneOf("blade")).toBe("trash");
    expect(showdowns(game)).toHaveLength(1);
    expect(showdowns(game)[0]).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.state("voli").combatRole ?? null).toBeNull();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "blade")).toBe(false);
    expect(game.p2.legal().map((o) => o.verb)).not.toContain("reveal");
  });

  test("aftermath: both pass Focus → Volibear conquers bf1 and P1 scores 1; P2 drew nothing (Hidden Blade never resolved); no invariant violations", async () => {
    const game = await stormResolves();
    const p2Hand = game.p2.hand().length;
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
