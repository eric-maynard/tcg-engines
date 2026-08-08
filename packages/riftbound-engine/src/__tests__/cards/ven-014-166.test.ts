/**
 * Shadow Fiend — ven-014-166 · Unit · Fury · 2 energy · 2 Might
 *
 *   [Empower] [2][fury] ([2][fury]: Empower me. Use only if not Empowered.)
 *   [Empowered][>] I have [Assault 3]. (+3 [Might] while I'm an attacker.)
 *
 * Head-judge notes (the tricky spots this file pins down):
 *   1. [Empower] is an ACTIVATED ability of a unit (827.1, 145.2): it uses the chain, and may only be
 *      used on your turn in a Neutral Open state — NOT during the showdown after the Fiend attacks.
 *      You must empower BEFORE moving in; there is no mid-combat pump.
 *   2. Assault only counts while the Fiend holds the ATTACKER designation (807.1.c): an empowered
 *      Fiend defends at 2 Might, and sits in base at 2 Might.
 *   3. Exactly-lethal math: empowered attacker is 5 → kills a 4 and survives (4 < 5), trades with a 5.
 *      Un-empowered it is a plain 2 and dies to the same 4.
 *   4. Empowered is a binary status with no built-in expiry (441.1.a) — it survives turn changes —
 *      but it is a status of the board object: bounce + replay yields a fresh, un-empowered Fiend.
 *   5. Assault stacks (807.2): Cleave's Assault 3 on an empowered Fiend → Assault 6 → 8 as attacker.
 *   6. "Use only if not Empowered": once empowered the ability is no longer offered, even with
 *      another [2][fury] floating.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-014-166";
const CLEAVE = "ogn-004-298"; // [Action] Give a unit [Assault 3] this turn — 1 energy
const RETREAT = "ogn-104-298"; // [Reaction] Return a friendly unit to its owner's hand — 1 energy

function board(opts: { energy?: number; fury?: number; foeMight?: number; empowered?: boolean } = {}) {
  return scenario()
    .resources(P1, { energy: opts.energy ?? 2, power: { fury: opts.fury ?? 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: opts.foeMight ?? 4, name: "Defender" }, "foe")
    .unit(P1, "base", CARD, "fiend", opts.empowered ? { empowered: true } : undefined);
}

describe("Shadow Fiend (ven-014-166)", () => {
  test("registry payload: activated Empower [2][fury] gated on not-empowered + static Assault 3 while empowered", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 2, might: 2 });
    expect(def?.powerCost).toBeUndefined();
    expect(def?.abilities).toEqual([
      { cost: { energy: 2, power: ["fury"] }, effect: { target: "self", type: "empower" }, restrictions: [{ type: "not-empowered" }], type: "activated" },
      { condition: { type: "while-empowered" }, effect: { keyword: "Assault", target: { type: "self" }, type: "grant-keyword", value: 3 }, type: "static" },
    ]);
  });

  test("plays for 2 energy as a 2-Might unit with no Assault and not empowered; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "fiend").build();
    await game.p1.play("fiend");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("fiend")).toBe("base");
    expect(game.state("fiend")).toMatchObject({ isEmpowered: false, keywords: [], might: 2 });
    expect((await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "fiend").build()).p1.can("play", "fiend")).toBe(false);
  });

  test("[Empower]: pays [2][fury], goes on the chain (not yet empowered), resolves → Empowered with Assault 3; might in base still 2", async () => {
    const game = await board().build();
    await game.p1.activate("fiend");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiend", controller: P1, triggered: false })]);
    expect(game.state("fiend").isEmpowered).toBe(false); // 377.3 — opponents may still respond
    await game.settle();
    expect(game.state("fiend").isEmpowered).toBe(true);
    expect(game.state("fiend").grantedKeywords).toEqual([{ duration: "static", keyword: "Assault", value: 3 }]);
    expect(game.state("fiend").might).toBe(2); // not an attacker → Assault contributes nothing
  });

  test("Empower cost gate: 2 energy without fury, or 1 energy + fury → not offered; an enemy Fiend is never mine to empower", async () => {
    expect((await board({ fury: 0 }).build()).p1.can("activate", "fiend")).toBe(false);
    expect((await board({ energy: 1 }).build()).p1.can("activate", "fiend")).toBe(false);
    const theirs = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).unit(P2, "base", CARD, "fiend").build();
    expect(theirs.p1.can("activate", "fiend")).toBe(false);
  });

  test("'Use only if not Empowered': an already-empowered Fiend does not offer the ability even with [2][fury] available", async () => {
    const game = await board({ empowered: true, energy: 4, fury: 2 }).build();
    expect(game.state("fiend").isEmpowered).toBe(true);
    expect(game.p1.can("activate", "fiend")).toBe(false);
  });

  test("empowered attacker: 2+3 = 5 Might in the showdown — kills a 4-Might defender, survives (4 < 5), conquers", async () => {
    const game = await board().build();
    await game.p1.activate("fiend");
    await game.settle();
    await game.p1.move("fiend", "bf1");
    expect(game.state("fiend")).toMatchObject({ combatRole: "attacker", might: 5 });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("fiend")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative space: NOT empowered, the same attack is a plain 2 into 4 — Fiend dies, defender keeps the field", async () => {
    const game = await board().build();
    await game.p1.move("fiend", "bf1");
    expect(game.state("fiend")).toMatchObject({ combatRole: "attacker", might: 2 });
    await game.settle();
    expect(game.zoneOf("fiend")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("exactly lethal both ways: empowered 5 into a 5-Might defender — both die, bf1 ends uncontrolled, no conquer", async () => {
    const game = await board({ empowered: true, foeMight: 5 }).build();
    await game.p1.move("fiend", "bf1");
    await game.settle();
    expect(game.zoneOf("fiend")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
  });

  test("Assault is attacker-only (807.1.c): an empowered Fiend DEFENDING is 2 Might and dies to a 2-Might attacker", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "fiend", { empowered: true })
      .unit(P2, "base", { might: 2, name: "Poker" }, "poker")
      .build();
    await game.p2.move("poker", "bf1");
    expect(game.state("fiend")).toMatchObject({ combatRole: "defender", isEmpowered: true, might: 2 });
    await game.settle();
    expect(game.zoneOf("fiend")).toBe("trash");
    expect(game.zoneOf("poker")).toBe("trash");
  });

  test("timing (145.2/381): Empower is not usable during the showdown after attacking, nor on the opponent's turn", async () => {
    const game = await board({ energy: 4, fury: 2 }).build();
    await game.p1.move("fiend", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "fiend")).toBe(false);
    const opp = await board({ energy: 4, fury: 2 }).active(P2).build();
    expect(opp.p1.can("activate", "fiend")).toBe(false);
  });

  test("Empowered persists across turns (441.1.a): two turns later the Fiend still has Assault 3 and attacks at 5", async () => {
    const game = await board().build();
    await game.p1.activate("fiend");
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("fiend")).toMatchObject({ isEmpowered: true, keywords: ["Assault"] });
    await game.p1.move("fiend", "bf1");
    expect(game.state("fiend").might).toBe(5);
  });

  test("Assault stacks (807.2): Cleave on an empowered attacking Fiend → Assault 6 → 8 Might in the showdown", async () => {
    const game = await board({ empowered: true, energy: 1, fury: 0, foeMight: 7 }).hand(P1, CLEAVE, "cleave").build();
    await game.p1.move("fiend", "bf1");
    expect(game.state("fiend").might).toBe(5);
    await game.p1.cast("cleave", { targets: "fiend" });
    await game.p1.pass();
    await game.p2.pass(); // Cleave resolves, showdown still open
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("fiend").might).toBe(8);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // 8 ≥ 7
    expect(game.zoneOf("fiend")).toBe("battlefield-bf1"); // 7 < 8
  });

  test("status lives on the board object: Retreat + replay gives a fresh un-empowered 2-Might Fiend with no Assault", async () => {
    const game = await board({ empowered: true, energy: 3, fury: 1 }).hand(P1, RETREAT, "retreat").build();
    await game.p1.cast("retreat", { targets: "fiend" });
    await game.settle();
    expect(game.zoneOf("fiend")).toBe("hand");
    await game.p1.play("fiend");
    await game.settle();
    expect(game.zoneOf("fiend")).toBe("base");
    expect(game.state("fiend")).toMatchObject({ grantedKeywords: [], isEmpowered: false, keywords: [], might: 2 });
    expect(game.p1.can("activate", "fiend")).toBe(false); // 0 energy left — but the ability exists again once affordable
    await game.p1.do("addResources", { energy: 2, power: { fury: 1 } });
    expect(game.p1.can("activate", "fiend")).toBe(true);
  });
});
