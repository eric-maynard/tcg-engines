/**
 * Ruling 12dca2053b089d0f — Fight or Flight (OGN-168 → ogn-168-298) · Chaos Action spell · [2]
 *   "[Hidden] [Action] Move a unit from a battlefield to its base."
 *   × Defy (OGN-045 → ogn-045-298) · Calm Reaction · [1][calm] — "Counter a spell that costs no more than [4]
 *     and no more than [rainbow]."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Chaos Action · [2][chaos] — "Move a friendly unit and ready it."
 *   (+ Cleave ogn-004-298 [Action] / Discipline ogn-058-298 [Reaction] in the attacker's hand as timing witnesses.)
 *
 * Q: In a combat showdown the attacker casts Fight or Flight to push a defender home and the defender Defies
 *    it. (1) Can the attacker start a new chain with another ACTION spell before combat resolves? (2) If the
 *    defender instead lets Fight or Flight resolve, can they Ride the Wind the pushed unit back in?
 * A: (1) Not while Fight or Flight/Defy are on the chain (Closed state — Reactions only). But once that chain
 *    has fully resolved the showdown is Open again, Focus passes around, and when it returns to the attacker
 *    they may open a new chain with an Action spell before combat damage. (2) Yes: after Fight or Flight
 *    resolves the chain is empty, the defender has Focus and may cast Ride the Wind (Action) to move the unit
 *    from base back to the battlefield, readied.
 * Rules: 330–336 (Open/Closed states), 341–347 (Focus in showdowns), 348 (all pass ⇒ combat proceeds).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const DEFY = "ogn-045-298";
const RIDE_THE_WIND = "ogn-173-298";
const CLEAVE = "ogn-004-298"; // [1] [Action] Give a unit [Assault 3] this turn.
const DISCIPLINE = "ogn-058-298"; // [2] [Reaction] Give a unit +2 [Might] this turn. Draw 1.

/**
 * P1's turn. P2 controls bf1 with two 2-Might defenders (DefOne, DefTwo). P1's 5-Might Attacker in base.
 * P1: Fight or Flight, Cleave, Discipline + [5]. P2: Defy, Ride the Wind + [3], 1 calm, 1 chaos.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5 })
    .resources(P2, { energy: 3, power: { calm: 1, chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 2, name: "DefOne" }, "d1")
    .unit(P2, "bf1", { might: 2, name: "DefTwo" }, "d2")
    .unit(P1, "base", { might: 5, name: "Attacker" }, "atk")
    .hand(P1, FIGHT_OR_FLIGHT, "fof")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P2, DEFY, "defy")
    .hand(P2, RIDE_THE_WIND, "ride");
}

/** Attacker moves in (combat showdown, P1 has Focus) and casts Fight or Flight on DefOne, then passes priority to P2. */
async function attackAndFof(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("atk", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.state("atk").combatRole).toBe("attacker");
  await game.p1.cast("fof", { targets: "d1" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["fof"]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

describe("Ruling 12dca2053b089d0f — scenario 1: Defy on Fight or Flight; no Action spells until the chain is gone, then a fresh chain is fine", () => {
  test("P2 may Defy Fight or Flight ([2], no power ⇒ within Defy's limits); with both on the chain P1 can play a REACTION (Discipline) but NOT an Action (Cleave)", async () => {
    const game = await attackAndFof();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "fof" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fof", "defy"]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(false); // Closed state: no Action spells
    expect(game.p1.can("cast", "discipline")).toBe(true); // Reactions are fine
  });

  test("Defy resolves and counters Fight or Flight — DefOne stays put; the whole chain is gone and the showdown is Open again (combat damage has NOT happened)", async () => {
    const game = await attackAndFof();
    await game.p2.cast("defy", { targets: "fof" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Defy resolves
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("d1")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("atk").damage).toBe(0);
    expect(game.state("d1").damage).toBe(0);
  });

  test("ruling: Focus passes around; when it is back with the attacker (P1) they CAN start a new chain with an Action spell (Cleave) before combat damage", async () => {
    const game = await attackAndFof();
    await game.p2.cast("defy", { targets: "fof" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    // Whoever holds Focus first: if it is P2, they pass it on.
    if (game.actingSeat() === P2) {
      expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
      await game.p2.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(true);
    await game.p1.cast("cleave", { targets: "atk" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    await game.settle(); // Cleave resolves, all pass, combat: Attacker 5+3 vs 2+2
    expect(game.state("atk").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("d2")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling 12dca2053b089d0f — scenario 2: Fight or Flight resolves; the defender Rides the Wind the unit straight back", () => {
  test("unanswered, Fight or Flight resolves: DefOne is moved to P2's base and loses its defender designation; chain empty, showdown still Open with P2 holding Focus", async () => {
    const game = await attackAndFof();
    await game.p2.passPriority(); // FoF resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("d1")).toBe("base");
    expect(game.state("d1").combatRole).toBeNull();
    expect(game.zoneOf("d2")).toBe("battlefield-bf1"); // combat continues — DefTwo still defends
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("ruling: P2 may now cast Ride the Wind (an ACTION — legal because the showdown is Open) on DefOne in base, choosing bf1 as the destination", async () => {
    const game = await attackAndFof();
    await game.p2.passPriority();
    expect(game.p2.can("cast", "ride")).toBe(true);
    const targets = game.p2.option("cast", "ride")?.fields.find((f) => f.name === "targets")?.options as string[][];
    expect(targets.flat()).toContain("d1"); // a unit in base is a legal "friendly unit"
    await game.p2.cast("ride", { targets: "d1" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, semantics: "destination" });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("battlefield-bf1");
    await game.p2.pick("battlefield-bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ride"]);
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1, chaos: 0 } });
  });

  test("ruling: Ride the Wind resolves — DefOne is back at bf1, READY, and a defender again; combat then resolves with both defenders present", async () => {
    const game = await attackAndFof();
    await game.p2.passPriority();
    await game.p2.cast("ride", { targets: "d1" });
    await game.p2.pick("battlefield-bf1");
    await game.p2.passPriority();
    await game.p1.passPriority(); // Ride the Wind resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("d1")).toBe("battlefield-bf1");
    expect(game.state("d1")).toMatchObject({ combatRole: "defender", isReady: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle(); // all pass → combat: 5 vs 2+2 → both defenders die, Attacker (took 4 < 5) conquers
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("d2")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
