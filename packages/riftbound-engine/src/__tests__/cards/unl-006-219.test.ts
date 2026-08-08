/**
 * Sharkling — unl-006-219 · Unit · Fury · 3 energy · 1 Might
 *
 *   [Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)
 *   [Assault 4] (+4 [Might] while I'm an attacker.)
 *
 * Rules: 143.4 (units enter exhausted), 805.1.a / 805.1.a.1 / 805.2 (Accelerate = optional
 * additional cost [1][C], C must match the unit's domain), 805.6 (enters ready, is not "readied"),
 * 807.1.c / 807.1.d.1 (Assault = +X Might only while holding the Attacker designation), 807.2
 * (Assault values from several sources sum), 465.2 / 466 (combat damage uses current Might; a unit
 * dies when damage ≥ Might; the attacker conquers only if defenders are gone and it survived).
 *
 * Head-judge corner cases considered:
 *   - Might is 1 everywhere except while attacking (base, defending, after combat ends);
 *   - exactly-lethal vs one-short: 5 kills a 4- and a 5-Might defender, but a 5-Might defender
 *     also kills Sharkling (its Might is 5 while the damage lands → 5 ≥ 5), a 6-Might one survives;
 *   - Accelerate then attack the same turn (the whole point of a 1-drop 5-power attacker);
 *   - Accelerate's power pip is domain-locked: [calm] cannot pay it, and it is optional;
 *   - stacking with Cleave (+Assault 3 → 8 Might as attacker) — natural Fury partner;
 *   - defending: an attacking 2-Might unit kills it (no Assault on defense).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-006-219";
const CLEAVE = "ogn-004-298"; // [Action] Give a unit [Assault 3] this turn — 1 energy

function attackInto(defMight: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "shark")
    .unit(P2, "bf1", { might: defMight, name: `Wall${defMight}` }, "wall");
}

describe("Sharkling (unl-006-219)", () => {
  test("costs 3 energy; without Accelerate it enters the base EXHAUSTED as a 1-Might Fury unit with both keywords", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "shark").build();
    await game.p1.play("shark", { to: "base" });
    await game.settle();
    expect(game.zoneOf("shark")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    const s = game.state("shark");
    expect(s).toMatchObject({ baseMight: 1, isExhausted: true, might: 1 });
    expect(s.domains).toEqual(["fury"]);
    expect(s.keywords).toEqual(expect.arrayContaining(["Accelerate", "Assault"]));
  });

  test("not playable with 2 energy (even holding a fury power)", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).hand(P1, CARD, "shark").build();
    expect(game.p1.can("play", "shark")).toBe(false);
    const r = await game.p1.try((p) => p.play("shark", { to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("shark")).toBe("hand");
  });

  test("Accelerate: 3+1 energy and 1 [fury] → enters READY, pool emptied (805.1.a)", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "shark").build();
    await game.p1.play("shark", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.zoneOf("shark")).toBe("base");
    expect(game.state("shark").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("Accelerate is optional (declining keeps the extra [1][fury]) and domain-locked ([calm] cannot pay it — 805.1.a.1)", async () => {
    const declined = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "shark").build();
    await declined.p1.play("shark", { accelerate: false, to: "base" });
    await declined.settle();
    expect(declined.state("shark").isExhausted).toBe(true);
    expect(declined.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });

    const wrong = await scenario().resources(P1, { energy: 4, power: { calm: 1 } }).hand(P1, CARD, "shark").build();
    expect(wrong.p1.can("play", "shark")).toBe(true); // the plain play is fine
    const r = await wrong.p1.try((p) => p.play("shark", { accelerate: true, to: "base" }));
    expect(r.ok).toBe(false);
    expect(wrong.zoneOf("shark")).toBe("hand");
    expect(wrong.p1.power("calm")).toBe(1);
  });

  test("Assault 4: attacking, it is a 5-Might attacker during the showdown and kills a 4-Might defender, conquering", async () => {
    const game = await attackInto(4).build();
    expect(game.state("shark").might).toBe(1); // at rest
    await game.p1.move("shark", "bf1");
    // Showdown open: designations assigned → Assault is live now (807.1.c).
    expect(game.state("shark").combatRole).toBe("attacker");
    expect(game.state("shark").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("shark")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // Combat over → Attacker designation removed (466.7.a) → back to 1 Might (807.1.d.1).
    expect(game.state("shark").combatRole).toBeNull();
    expect(game.state("shark").might).toBe(1);
  });

  test("exactly lethal both ways: into a 5-Might defender both die (5 ≥ 5 each way) and nobody conquers", async () => {
    const game = await attackInto(5).build();
    await game.p1.move("shark", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("shark")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test("one short: a 6-Might defender survives with the battlefield, Sharkling dies", async () => {
    const game = await attackInto(6).build();
    await game.p1.move("shark", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.zoneOf("shark")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("no Assault while DEFENDING: a 2-Might attacker kills the 1-Might Sharkling and takes the battlefield", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "shark")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("shark").combatRole).toBe("defender");
    expect(game.state("shark").might).toBe(1);
    await game.settle();
    expect(game.zoneOf("shark")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("tempo line: Accelerate in, then attack the same turn and win (4 energy + fury → ready → move → 5-Might attacker)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
      .hand(P1, CARD, "shark")
      .build();
    await game.p1.play("shark", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.p1.can("move")).toBe(true);
    await game.p1.move("shark", "bf1");
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.locationOf("shark")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("shark").isExhausted).toBe(true); // the standard move exhausted it
  });

  test("without Accelerate the exhausted Sharkling cannot attack this turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3 }, "holder")
      .hand(P1, CARD, "shark")
      .build();
    await game.p1.play("shark", { to: "base" });
    await game.settle();
    const r = await game.p1.try((p) => p.move("shark", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("shark")).toBe("base");
  });

  test("807.2 stacking with Cleave: Assault 4 + Assault 3 → an 8-Might attacker that kills a 7-Might defender", async () => {
    const game = await attackInto(7).resources(P1, { energy: 1 }).hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "shark" });
    await game.settle();
    expect(game.state("shark").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("shark").might).toBe(1); // still not an attacker
    await game.p1.move("shark", "bf1");
    expect(game.state("shark").might).toBe(8);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("shark")).toBe("bf1");
  });

  test("the granted Assault expires with the turn; the printed Assault 4 does not", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", CARD, "shark").hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "shark" });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("shark").grantedKeywords).toEqual([]);
    expect(game.state("shark").keywords).toContain("Assault");
  });

  test("registry payload: Accelerate keyword with cost [1][fury] and Assault with value 4; unit stats match the print", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 3, might: 1, name: "Sharkling" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { cost: { energy: 1, power: ["fury"] }, keyword: "Accelerate", type: "keyword" },
      { keyword: "Assault", type: "keyword", value: 4 },
    ]);
  });
});
