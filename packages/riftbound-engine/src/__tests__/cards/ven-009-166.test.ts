/**
 * Baccai Reaper — ven-009-166 · Unit · Fury · 3 energy + [fury] · 4 Might
 *
 *   When I attack, you may pay [fury] to give me [Assault 2] this turn. (+2 [Might] while I'm an
 *   attacker.)
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. "When I attack" fires when the Reaper gains the ATTACKER designation (a move into an
 *      enemy-occupied battlefield opens combat) — never when it defends, never on a move to an empty
 *      battlefield (no combat is staged).
 *   2. "you may pay [fury]": an opt-in prompt on RESOLUTION of the trigger; the [fury] is a DOMAIN
 *      power (unlike Deflect's any-domain [rainbow]) — calm power cannot pay it; with no fury the
 *      offer cannot be accepted and nothing is charged. Declining costs nothing.
 *   3. Ordering: the trigger resolves on the combat chain BEFORE damage, so paying turns 4-vs-5
 *      (Reaper dies, defender lives) into 6-vs-5 (defender dies, Reaper lives: 5 < 6 while attacking).
 *   4. "this turn": the Assault 2 grant outlives the combat (still listed after cleanup, but +0 Might
 *      once no longer an attacker) and is gone after advanceTurn().
 *   5. Assault stacks (807.2) with Cleave: 4 + 2 + 3 = 9 while attacking.
 *   6. Cost: 3 energy + 1 fury; the fury spent to PLAY it is not available for the trigger later.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-009-166";
const CLEAVE = "ogn-004-298"; // [Action] Give a unit [Assault 3] this turn — 1 energy

function attacking(defMight: number, power: Record<string, number> = { fury: 1 }) {
  return scenario()
    .resources(P1, { energy: 1, power })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: defMight, name: "Defender" }, "def")
    .unit(P1, "base", CARD, "reaper");
}

describe("Baccai Reaper (ven-009-166)", () => {
  test("parsed ability: optional attack trigger, pay [fury] → grant self Assault 2 this turn", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 3, might: 4, powerCost: ["fury"] });
    const abilities = def?.abilities as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      condition: { cost: { power: ["fury"] }, type: "pay-cost" },
      effect: { duration: "turn", keyword: "Assault", target: "self", type: "grant-keyword", value: 2 },
      optional: true,
      trigger: { event: "attack", on: "self" },
      type: "triggered",
    });
  });

  test("cost: 3 energy + [fury]; enters base exhausted at 4 Might with no Assault; unaffordable without the fury or with 2 energy", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "reaper").build();
    await game.p1.play("reaper");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("reaper")).toBe("base");
    expect(game.state("reaper")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.state("reaper").keywords).not.toContain("Assault");
    const noFury = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).hand(P1, CARD, "reaper").build();
    expect(noFury.p1.can("play", "reaper")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 2, power: { fury: 2 } }).hand(P1, CARD, "reaper").build();
    expect(lowEnergy.p1.can("play", "reaper")).toBe(false);
  });

  test("When I attack: the trigger goes on the combat chain; on resolution P1 is offered to pay [fury]; paying spends exactly 1 fury and grants Assault 2 (4 → 6 while attacking)", async () => {
    const game = await attacking(9, { fury: 2 }).build();
    await game.p1.move("reaper", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "reaper", controller: P1, triggered: true })]);
    expect(game.state("reaper").might).toBe(4); // nothing granted before the trigger resolves
    await game.settle();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } }); // only ONE fury, no energy — rule 383.3.b.1
    // rule 402 (finalization): the grant lands when the chain item resolves
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("reaper").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 2 }]);
    expect(game.state("reaper").might).toBe(6);
  });

  test("ordering matters: paying makes it 6-vs-5 — the defender dies, the Reaper survives (5 < 6) and conquers", async () => {
    const game = await attacking(5).build();
    await game.p1.move("reaper", "bf1");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf("reaper")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.power("fury")).toBe(0);
  });

  test("declining: costs nothing, no Assault — 4-vs-5 kills the Reaper and the defender holds", async () => {
    const game = await attacking(5).build();
    await game.p1.move("reaper", "bf1");
    await game.settle();
    await game.p1.no();
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.state("reaper").grantedKeywords).toEqual([]);
    expect(game.state("reaper").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("reaper")).toBe("trash");
    expect(game.locationOf("def")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("no fury power: the offer cannot be accepted (calm power does not pay a [fury] pip); nothing is charged and no Assault is granted", async () => {
    const game = await attacking(5, { calm: 2 }).build();
    await game.p1.move("reaper", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
    const r = await game.p1.try((p) => p.yes());
    expect(r.ok).toBe(false);
    await game.p1.no();
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 2 } });
    expect(game.state("reaper").grantedKeywords).toEqual([]);
    await game.settle();
    expect(game.zoneOf("reaper")).toBe("trash"); // fought at 4 vs 5
    expect(game.locationOf("def")).toBe("bf1");
  });

  test("'this turn': after the combat the grant is still listed but adds nothing off-attack (4 Might); it expires on the next turn", async () => {
    const game = await attacking(1).build();
    await game.p1.move("reaper", "bf1");
    await game.settle();
    await game.p1.yes();
    await game.settle();
    expect(game.locationOf("reaper")).toBe("bf1");
    expect(game.state("reaper").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 2 }]);
    expect(game.state("reaper").might).toBe(4); // no longer an attacker (807.1.d.1)
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("reaper").grantedKeywords).toEqual([]);
    expect(game.state("reaper").keywords).not.toContain("Assault");
  });

  test("NOT an attack: moving to an empty battlefield stages no combat — no trigger, no prompt, no fury spent", async () => {
    const game = await attacking(5).build();
    await game.p1.move("reaper", "bf2");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.state("reaper").grantedKeywords).toEqual([]);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("NOT an attack: when the Reaper DEFENDS, its trigger does not fire (P1 is never prompted, keeps its fury) and it fights at 4", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "reaper")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .script(P1, [], { strict: true }) // any prompt to P1 would throw UNSCRIPTED_DECISION
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain().filter((c) => c.cardId === "reaper")).toEqual([]);
    await game.settle();
    expect(game.p1.power("fury")).toBe(1);
    expect(game.zoneOf("reaper")).toBe("trash"); // 5 ≥ 4
    expect(game.locationOf("raider")).toBe("bf1"); // took 4 < 5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Assault stacks with Cleave (807.2): 4 + 2 + 3 = 9 while attacking — an 8-Might defender dies and the Reaper lives", async () => {
    const game = await attacking(8).resources(P1, { energy: 1, power: { fury: 1 } }).hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "reaper" });
    await game.settle();
    await game.p1.move("reaper", "bf1");
    expect(game.state("reaper").might).toBe(7); // Cleave's Assault 3 already live as attacker
    await game.settle();
    await game.p1.yes();
    // rule 402 (finalization): resolve just the trigger; the showdown stays open
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("reaper").might).toBe(9);
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf("reaper")).toBe("bf1"); // 8 < 9
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("P1 answers the opt-in at finalization, before anyone gets priority; the fury is charged only on 'yes', not when the trigger is put on the chain", async () => {
    const game = await attacking(5).build();
    await game.p1.move("reaper", "bf1");
    expect(game.p1.power("fury")).toBe(1); // nothing paid at trigger time
    // rule 402 (finalization): the opt-in prompt comes before the priority round, and 383.3.b.1 charges on "yes"
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.power("fury")).toBe(0);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
  });
});
