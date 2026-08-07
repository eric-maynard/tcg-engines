/**
 * Mageseeker Investigator — unl-163-219 · Unit · Order · 4 energy · 4 Might
 *
 *   Opponents must pay [rainbow] for each unit beyond the first to move multiple units to my
 *   battlefield at the same time.
 *
 * Rules: 204.4 (uses THIS card as its example of an "applied cost" — a passive that attaches a
 * cost to a game action), 135.2.e.5 / 135.2.e.5.a ([rainbow] = [A] = one POWER of any domain —
 * never energy), 445–447 (a Standard Move may move several units to one destination "at the same
 * time"; separate moves in the same turn are separate actions), 106/"my battlefield" (the
 * battlefield where this unit currently is — a unit in base has no battlefield), 364 (passive:
 * only while I'm on the board), 203 (a cost that cannot be paid makes the action illegal).
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. The currency is POWER (any domain), not energy: an opponent with 0 energy but one fury power
 *     CAN move two units in; an opponent with 5 energy and no power CANNOT.
 *  2. "at the same time": two units in ONE move cost 1; three cost 2; two SEPARATE single-unit
 *     moves in the same turn cost nothing.
 *  3. "to MY battlefield": multi-unit moves to any other battlefield or back to base are free, and
 *     an Investigator sitting in base taxes nothing at all.
 *  4. "Opponents": my own multi-unit moves to my own Investigator's battlefield are free.
 *  5. Passive lifetime: once the Investigator is dead the opponent's mass move is free again.
 *  6. Moving several units onto my Investigator starts a combat — the tax is charged at move
 *     time, before the showdown, so assert resources immediately after the move.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-163-219";

type Pool = { energy?: number; power?: Record<string, number> };

/** P2's turn. My Investigator holds bf1 (or sits where `where` says); P2 has three 2-Might movers. */
function board(p2: Pool, where: "bf1" | "bf2" | "base" = "bf1") {
  return scenario()
    .active(P2)
    .resources(P2, p2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, where, CARD, "msi")
    .unit(P2, "base", { might: 2, name: "Mover1" }, "u1")
    .unit(P2, "base", { might: 2, name: "Mover2" }, "u2")
    .unit(P2, "base", { might: 2, name: "Mover3" }, "u3");
}

describe("Mageseeker Investigator (unl-163-219)", () => {
  test("cost: 4 energy, no power — a 4-Might Order unit in base; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "msi").build();
    await game.p1.play("msi");
    await game.settle();
    expect(game.zoneOf("msi")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("msi")).toMatchObject({ baseMight: 4, might: 4 });
    expect(game.state("msi").domains).toEqual(["order"]);
    const poor = await scenario().resources(P1, { energy: 3, power: { order: 2 } }).hand(P1, CARD, "msi").build();
    expect(poor.p1.can("play", "msi")).toBe(false);
  });

  test("two units moved to my battlefield AT THE SAME TIME cost the opponent one [rainbow] — paid from POWER of any domain (135.2.e.5.a), energy untouched", async () => {
    // Expected: P2 (0 energy, 1 fury) may make the move; afterwards fury 0, energy 0, both units
    // at bf1 and a combat showdown open. Actual: the engine charges 1 ENERGY, so with 0 energy the
    // two-unit move is not even offered.
    const game = await board({ energy: 0, power: { fury: 1 } }).build();
    await game.p2.move(["u1", "u2"], "bf1");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.locationOf("u1")).toBe("bf1");
    expect(game.locationOf("u2")).toBe("bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
  });

  test("'for each unit beyond the first' — three units at once cost two [rainbow] (order + calm here), not energy", async () => {
    // Expected: power {order:0, calm:0}, energy still 5. Actual: energy 3, power untouched.
    const game = await board({ energy: 5, power: { calm: 1, order: 1 } }).build();
    await game.p2.move(["u1", "u2", "u3"], "bf1");
    expect(game.p2.resources()).toEqual({ energy: 5, power: { calm: 0, order: 0 } });
    expect(game.p2.units("bf1").sort()).toEqual(["u1", "u2", "u3"]);
  });

  test("an applied cost that cannot be paid makes the action illegal (203) — 5 energy but NO power cannot move two units onto my Investigator", async () => {
    // Expected: the two-unit move to bf1 is refused; a single unit may still go. Actual: allowed,
    // charging 1 energy instead.
    const game = await board({ energy: 5 }).build();
    const r = await game.p2.try((p) => p.move(["u1", "u2"], "bf1"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("u1")).toBe("base");
    expect(game.p2.resources()).toEqual({ energy: 5, power: {} });
    await game.p2.move("u1", "bf1");
    expect(game.locationOf("u1")).toBe("bf1");
  });

  test("a SINGLE unit moving to my battlefield pays nothing (it is not 'multiple units')", async () => {
    const game = await board({ energy: 0 }).build();
    await game.p2.move("u1", "bf1");
    expect(game.locationOf("u1")).toBe("bf1");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect((game.decision() as ActionDecision).context).toBe("showdown");
  });

  test("'at the same time' — two SEPARATE single-unit moves to my battlefield in one turn are both free", async () => {
    // Expected: u1 attacks alone (and dies to the 4-Might Investigator), then u2 may also move in
    // with an empty pool. Actual: the engine taxes the Nth unit moved THIS TURN, so the second
    // single move demands 1 energy and is refused at 0 energy.
    const game = await board({ energy: 0 }).build();
    await game.p2.move("u1", "bf1");
    await game.settle(); // 2 into 4: u1 dies, Investigator holds
    expect(game.zoneOf("u1")).toBe("trash");
    expect(game.locationOf("msi")).toBe("bf1");
    await game.p2.move("u2", "bf1");
    expect(game.locationOf("u2")).toBe("bf1");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });

  test("'to MY battlefield' — a two-unit move to a DIFFERENT battlefield (bf2) is free", async () => {
    // Expected: legal at 0 resources; both movers at bf2. Actual: refused (1 energy demanded).
    const game = await board({ energy: 0 }).build();
    await game.p2.move(["u1", "u2"], "bf2");
    expect(game.p2.units("bf2").sort()).toEqual(["u1", "u2"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });

  test("an Investigator sitting in my BASE has no battlefield — the opponent's mass move anywhere is free", async () => {
    // Expected: legal at 0 resources. Actual: the escalation flag is honoured from the base too.
    const game = await board({ energy: 0 }, "base").build();
    await game.p2.move(["u1", "u2"], "bf2");
    expect(game.p2.units("bf2").sort()).toEqual(["u1", "u2"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });

  test("when the tax IS due it never touches energy — 2 energy + 1 mind moving two units in leaves energy at 2", async () => {
    // Expected: { energy: 2, power: { mind: 0 } }. Actual: { energy: 1, power: { mind: 1 } }.
    const game = await board({ energy: 2, power: { mind: 1 } }).build();
    await game.p2.move(["u1", "u2"], "bf1");
    expect(game.p2.energy()).toBe(2);
    expect(game.p2.power("mind")).toBe(0);
  });

  test("'Opponents' only: my own two-unit move onto my Investigator's battlefield is free", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "msi")
      .unit(P1, "base", { might: 2, name: "Ally1" }, "a")
      .unit(P1, "base", { might: 2, name: "Ally2" }, "b")
      .build();
    await game.p1.move(["a", "b"], "bf1");
    expect(game.p1.units("bf1").sort()).toEqual(["a", "b", "msi"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("passive lifetime (364): with the Investigator dead in my trash the opponent moves two units to bf1 for nothing and conquers it", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 0 })
      .battlefield("bf1", { controller: P1 })
      .trash(P1, CARD, "msi")
      .unit(P2, "base", { might: 2 }, "u1")
      .unit(P2, "base", { might: 2 }, "u2")
      .build();
    await game.p2.move(["u1", "u2"], "bf1");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test("full line at today's (energy) pricing: two 2-Might movers into the 4-Might Investigator — 4 damage kills it, its 4 back kills exactly… both (2+2), so nobody conquers", async () => {
    // Independent of the currency bug: give P2 plenty of both so the move is legal either way.
    const game = await board({ energy: 5, power: { fury: 2 } }).build();
    await game.p2.move(["u1", "u2"], "bf1");
    expect(game.state("msi").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("msi")).toBe("trash"); // 2 + 2 ≥ 4
    // Investigator assigns 4: lethal 2 to one mover, then 2 to the other (465.2.c.3) → both die.
    expect(game.zoneOf("u1")).toBe("trash");
    expect(game.zoneOf("u2")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
    expect(game.p2.points()).toBe(0);
  });

  test("registry payload: hand-authored — no parsed abilities, the `moveEscalation` marker carries the applied cost; 4-cost 4-Might Order unit with no power cost", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 4, might: 4, moveEscalation: true, name: "Mageseeker Investigator" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([]);
    expect(def?.rulesText).toContain("[rainbow] for each unit beyond the first");
    expect(def?.rulesText).toContain("my battlefield at the same time");
  });
});
