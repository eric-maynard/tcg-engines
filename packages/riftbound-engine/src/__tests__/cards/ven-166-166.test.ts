/**
 * Threshold of the Gray — ven-166-166 · Battlefield
 *
 *   When combat starts here, the attacker and defender each [Add] [1].
 *
 * Rules: 464.2 (a Combat opens when a Cleanup finds a Contested battlefield with both sides' units;
 * 464.2.b "start of combat effects happen now", 464.2.c attacker = the player who applied Contested,
 * defender = the other), 429.1 / 429.5 ([Add] [1] = put 1 Energy in that player's Rune Pool), 429.2 /
 * 429.2.a (a TRIGGERED ability that Adds resolves as soon as it is finalized — no priority passes, no
 * lingering chain item), 190.6.a (the battlefield's controller controls the ability, but the instruction
 * names both players — each pool gets 1 regardless of who controls the card or who owns it), 167 / 317.2.d
 * (unspent Energy is lost at end of turn), 344 / 348.2 (a walk-in onto an EMPTY battlefield is a
 * Non-Combat Showdown — no combat starts, nobody is attacker/defender), 466.3.d.1 ("When combat starts"
 * has no once-per-turn limit: a second combat here the same turn adds again).
 *
 * Head-judge corner cases for THIS card:
 *  1. The marquee line: attack here with 0 energy and the Threshold funds a 1-cost combat trick (Cleave)
 *     inside the showdown; symmetrically the defender can fund a 1-cost Reaction (Stupefy) on MY turn.
 *  2. Timing: the energy is there BEFORE the attacker's first Focus action, with an empty chain (429.2).
 *  3. Negative space: Non-Combat Showdown here (empty battlefield) adds nothing; a combat at ANOTHER
 *     battlefield adds nothing; merely controlling/holding it adds nothing.
 *  4. Both players, exactly 1 each, exactly once per combat start (two attackers moving in together is one
 *     combat); a second, separate combat here later the same turn adds again.
 *  5. Expiry: the unspent point is gone after the turn ends.
 *
 * Engine status: the parsed ability is `{trigger:{event:"combat-start", on:"controller", location:"here"},
 * effect:{type:"raw", text:"the attacker and defender each [Add] …"}}` — an unparsed effect on an event
 * the engine never emits. Every positive clause below is a BUG test; the negative-space tests hold today.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-166-166";
const CLEAVE = "ogn-004-298"; // [Action] · 1 · Give a unit [Assault 3] this turn.
const STUPEFY = "ogn-095-298"; // [Reaction] · 1 · Give a unit -1 Might this turn (min 1). Draw 1.

/** P1 (0 energy) has a 2-Might Scout in base; P2 (0 energy) guards the live Threshold (bf1, P1 owns the card) with a 3-Might Guard; bf2 is P2's inert battlefield with a Sentry. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "bf2", { might: 3, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P1, "base", { might: 2, name: "Second" }, "second");
}

describe("Threshold of the Gray (ven-166-166)", () => {
  test("baseline / negative space today: attacking here opens a combat showdown with the attacker on Focus; combat resolves normally (Scout 2 dies to Guard 3)", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(game.decision() as ActionDecision).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.state("guard").zone).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  // BUG — expected (464.2.b + 429.2): the moment the combat opens here both the attacker (P1) and the
  // defender (P2) have 1 Energy, nothing lingers on the chain, and P1 holds Focus. Actual: 0 / 0.
  test("when combat starts here the attacker AND the defender each get +1 energy immediately (empty chain, attacker on Focus)", async () => {
    const game = await board().build();
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.energy()).toBe(0);
    await game.p1.move("scout", "bf1");
    expect(game.decision() as ActionDecision).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]); // 429.2 — an [Add] trigger resolves as soon as it is finalized
    expect(game.p1.energy()).toBe(1);
    expect(game.p2.energy()).toBe(1);
  });

  // BUG — expected: exactly +1 on top of what each player already had (3 → 4, 5 → 6), power untouched. Actual: unchanged.
  test("it ADDS exactly 1 to each pool — existing energy and power are kept (P1 3→4, P2 5→6, fury stays 1)", async () => {
    const game = await board().resources(P1, { energy: 3, power: { fury: 1 } }).resources(P2, { energy: 5 }).build();
    await game.p1.move("scout", "bf1");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } });
    expect(game.p2.resources()).toEqual({ energy: 6, power: {} });
  });

  // BUG — expected: the marquee line — a broke attacker moves in, the Threshold pays for Cleave (1) inside the
  // showdown: Scout becomes 2+3 = 5 as an attacker, kills the 3-Might Guard and conquers. Actual: Cleave is
  // unaffordable (0 energy), Scout dies.
  test("the attacker can spend the added [1] on a combat trick in this very showdown (Cleave → Scout 5 kills Guard 3, P1 conquers)", async () => {
    const game = await board().hand(P1, CLEAVE, "cleave").build();
    await game.p1.move("scout", "bf1");
    expect(game.p1.can("cast", "cleave")).toBe(true);
    await game.p1.cast("cleave", { targets: "scout" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  // BUG — expected: the DEFENDER is funded too, on the attacker's turn — P2 answers with Stupefy (1, Reaction)
  // on my 3-Might Bruiser: 3 → 2 < Guard 3, so the Guard survives (2 damage, healed at cleanup) and the
  // Bruiser dies; P2 drew 1. Actual: P2 has 0 energy and cannot cast.
  test("the defender can spend its added [1] on a Reaction during my attack (Stupefy shrinks my attacker, Guard holds)", async () => {
    const game = await board().hand(P2, STUPEFY, "stupefy").unit(P1, "base", { might: 3, name: "Bruiser" }, "bruiser").build();
    const p2Hand = game.p2.hand().length;
    await game.p1.move("bruiser", "bf1");
    await game.p1.passFocus();
    expect(game.p2.can("cast", "stupefy")).toBe(true);
    await game.p2.cast("stupefy", { targets: "bruiser" });
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand); // -1 Stupefy +1 draw
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.state("guard").zone).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("negative space — a walk-in onto an EMPTY Threshold is a Non-Combat Showdown: no attacker/defender, nobody gains energy, P1 conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .build();
    await game.p1.move("scout", "bf1");
    expect(game.state("scout").combatRole).toBe(null);
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.energy()).toBe(0);
  });

  test("negative space — 'here': a combat at bf2 (the Threshold is bf1) adds nothing to either pool", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf2");
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.p2.energy()).toBe(0);
  });

  test("negative space — controlling / holding the Threshold is not a combat: across P2's whole turn start (hold scored) nobody gains Threshold energy", async () => {
    const game = await scenario()
      .turn(2)
      .active(P1)
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
      .fillDecks({ main: 10, runes: 0 }) // no runes to channel → any energy would have to come from the card
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1); // the hold happened
    expect(game.p2.energy()).toBe(0);
    expect(game.p1.energy()).toBe(0);
  });

  // BUG — expected: two of my units moving in TOGETHER start ONE combat → exactly +1 each (not +2). Actual: 0.
  test("one combat = one trigger — two attackers arriving in a single move give each player exactly 1", async () => {
    const game = await board().build();
    await game.p1.move(["scout", "second"], "bf1");
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("second").combatRole).toBe("attacker");
    expect(game.p1.energy()).toBe(1);
    expect(game.p2.energy()).toBe(1);
  });

  // BUG — expected: "When combat starts here" has no per-turn cap — after combat #1 here ends (Scout dies),
  // Second attacking here later this turn starts a NEW combat: +1 each again → P2 (who spent nothing) sits
  // on 2. Actual: 0.
  test("a second, separate combat here in the same turn adds again (P2 unspent: 1 → 2)", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(game.p2.energy()).toBe(1);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    await game.p1.move("second", "bf1");
    expect(game.state("second").combatRole).toBe("attacker");
    expect(game.p1.energy()).toBe(2);
    expect(game.p2.energy()).toBe(2);
  });

  // BUG — expected (167 / 317.2.d): the point is real energy this turn and is LOST when the turn ends — after
  // the combat P1 still has 1 during its main phase, and 0 once P2's turn has begun. Actual: never gained.
  test("the added energy lasts for the rest of the turn and empties at end of turn", async () => {
    const game = await board().fillDecks({ main: 10, runes: 0 }).build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.energy()).toBe(0); // P2's unspent point from my turn is gone too
  });

  test("registry payload (as parsed today): one triggered ability on `combat-start` scoped to HERE — but its effect is an unparsed `raw` blob", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Threshold of the Gray" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      trigger: { event: "combat-start", location: "here" },
      type: "triggered",
    });
  });

  // BUG (parse) — expected: a structured effect adding 1 Energy to BOTH the attacker and the defender (e.g. an
  // `add-resource` with energy 1 for each combatant player) and no "optional" (there is no "may"). Actual:
  // `{ type: "raw", text: "the attacker and defender each [Add] :rb_energy_1:." }`.
  test("registry payload — the effect must be a structured [Add] [1] for attacker and defender, not raw text", async () => {
    const a = (await loadDefaultCardPool()).get(CARD)?.abilities?.[0] as { effect: { type: string }; optional?: boolean };
    expect(a.optional).not.toBe(true);
    expect(a.effect.type).not.toBe("raw");
    const s = JSON.stringify(a.effect);
    expect(s).toMatch(/add-resource|"add"/);
    expect(s).toMatch(/"energy":1/);
    expect(s).toMatch(/attacker/);
    expect(s).toMatch(/defender/);
  });
});
