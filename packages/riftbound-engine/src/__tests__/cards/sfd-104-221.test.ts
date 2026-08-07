/**
 * Petricite Monument — sfd-104-221 · Gear · Body · 2 energy
 *
 *   [Temporary] (Kill this at the start of its controller's Beginning Phase, before scoring.)
 *   Friendly units have [Deflect]. (Opponents must pay [rainbow] to choose them with a spell or
 *   ability.)
 *
 * Head-judge notes (the tricky cases covered below):
 *  - Temporary (816) keys off ITS CONTROLLER's Beginning Phase: played on your turn it survives the
 *    opponent's whole turn (that is the point — a one-round shield) and dies as your next turn
 *    starts; an opponent's Monument must NOT die when your turn begins.
 *  - The grant is a continuous static (522): every friendly unit — including one played after the
 *    Monument — has Deflect while it is on the board, enemy units never do, and the moment the
 *    Monument is killed (Temporary or a gear-removal spell) the keyword is gone.
 *  - "Friendly UNITS": the Monument itself is gear and gets no Deflect — an opponent's "kill a
 *    gear" chooses it at no extra cost.
 *  - Deflect economics (809): opponents pay 1 power of ANY domain per protected unit chosen; the
 *    controller's own spells are free; Deflect from several sources SUMS (809.2): Navori Scout
 *    (printed Deflect) under a Monument is Deflect 2, and so is any unit under two Monuments.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-104-221";
const NAVORI_SCOUT = "sfd-037-221"; // 4-might unit with printed [Deflect]
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
};
const SMASH = {
  abilities: [{ effect: { target: { type: "gear" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Smash",
  rulesText: "[Action] Kill a gear.",
  timing: "action",
};
const DEFLECT = [{ duration: "static", keyword: "Deflect", value: undefined }];

/** P2's turn; P1 has the Monument, a vanilla ally and (optionally) more; P2 holds a Bolt with the given pool. */
function oppTurn(p2: { energy: number; power?: Record<string, number> }) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: p2.energy, power: p2.power ?? {} })
    .gear(P1, CARD, "mon")
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .hand(P2, BOLT, "bolt");
}

describe("Petricite Monument (sfd-104-221)", () => {
  test("cost: 2 energy; the gear lands in base without using the chain and friendly units immediately show Deflect", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P1, CARD, "mon")
      .build();
    await game.p1.play("mon");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("mon")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.state("mon").keywords).toEqual(["Temporary"]);
    expect(game.state("ally").grantedKeywords).toEqual(DEFLECT);
    expect(game.state("foe").grantedKeywords).toEqual([]);
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "mon").build();
    expect(poor.p1.can("play", "mon")).toBe(false);
  });

  test("Temporary: survives the opponent's entire turn, then is killed as its controller's next turn begins", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, CARD, "mon")
      .build();
    await game.p1.play("mon");
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("mon")).toBe("base");
    expect(game.state("ally").grantedKeywords).toEqual(DEFLECT);
    await game.advanceTurn(); // → P1: Beginning Phase kills it
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("mon")).toBe("trash");
    expect(game.state("ally").grantedKeywords).toEqual([]);
  });

  test("Temporary is tied to ITS controller: an opponent's Monument does not die when MY turn begins", async () => {
    const game = await scenario().turn(2).active(P2).gear(P2, CARD, "theirs").unit(P2, "base", { might: 2, name: "Guarded" }, "guarded").build();
    await game.advanceTurn(); // → P1's turn: P2's Monument must survive
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.state("guarded").grantedKeywords).toEqual(DEFLECT);
    await game.advanceTurn(); // → P2's turn: now it dies
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.state("guarded").grantedKeywords).toEqual([]);
  });

  test("Temporary happens in the same Beginning Phase that scores a hold: by Main Phase the Monument is dead and the hold point was scored", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .gear(P1, CARD, "mon")
      .build();
    await game.advanceTurn();
    expect(game.zoneOf("mon")).toBe("trash");
    expect(game.p1.points()).toBe(1);
    expect(game.state("holder").grantedKeywords).toEqual([]);
  });

  test("Deflect: on the opponent's turn their Bolt cannot choose a protected unit with no power; only their own unit is offered", async () => {
    const game = await oppTurn({ energy: 1 }).build();
    const targets = game.p2.option("cast", "bolt")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["foe"]]);
    const r = await game.p2.try((p) => p.cast("bolt", { targets: "ally" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("bolt")).toBe("hand");
    expect(game.p2.energy()).toBe(1);
  });

  test("Deflect: with one power of ANY domain (mind vs a Body gear / Fury spell) the opponent pays it and the Bolt lands", async () => {
    const game = await oppTurn({ energy: 1, power: { mind: 1 } }).build();
    await game.p2.cast("bolt", { targets: "ally" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.state("ally").damage).toBe(2);
    expect(game.locationOf("ally")).toBe("base");
  });

  test("Deflect taxes opponents only: the Monument's controller bolts their own unit for the bare 1 energy", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).gear(P1, CARD, "mon").unit(P1, "base", { might: 3, name: "Ally" }, "ally").hand(P1, BOLT, "bolt").build();
    await game.p1.cast("bolt", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("ally").damage).toBe(2);
  });

  test("'friendly UNITS': the Monument itself has no Deflect — an opponent's kill-a-gear chooses it untaxed, and the grant ends", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .gear(P1, CARD, "mon")
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .hand(P2, SMASH, "smash")
      .build();
    expect(game.state("mon").grantedKeywords).toEqual([]);
    await game.p2.cast("smash", { targets: "mon" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("mon")).toBe("trash");
    expect(game.state("ally").grantedKeywords).toEqual([]);
  });

  test("continuous: a unit played AFTER the Monument is protected at once", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .gear(P1, CARD, "mon")
      .hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Latecomer" }, "late")
      .build();
    await game.p1.play("late");
    expect(game.zoneOf("late")).toBe("base");
    expect(game.state("late").grantedKeywords).toEqual(DEFLECT);
  });

  test("Deflect sums across sources (809.2): Navori Scout (printed Deflect) under a Monument needs TWO power — one is refused, two are both spent", async () => {
    const one = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .gear(P1, CARD, "mon")
      .unit(P1, "base", NAVORI_SCOUT, "scout")
      .hand(P2, BOLT, "bolt")
      .build();
    expect(one.state("scout").keywords).toEqual(["Deflect"]);
    expect(one.state("scout").grantedKeywords).toEqual(DEFLECT);
    expect((await one.p2.try((p) => p.cast("bolt", { targets: "scout" }))).ok).toBe(false);

    const two = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1, calm: 1 } })
      .gear(P1, CARD, "mon")
      .unit(P1, "base", NAVORI_SCOUT, "scout")
      .hand(P2, BOLT, "bolt")
      .build();
    await two.p2.cast("bolt", { targets: "scout" });
    expect(two.p2.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    await two.settle();
    expect(two.state("scout").damage).toBe(2);
  });

  test("two Monuments are two Deflect sources — a vanilla ally has Deflect 2 and one power is not enough (809.2)", async () => {
    // Expected: granted Deflect from mon1 + mon2 sums to 2 → P2 (1 fury) cannot choose Ally.
    // Actual: identical granted keywords are collapsed into one; the Bolt is cast for a single power.
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .gear(P1, CARD, "mon1")
      .gear(P1, CARD, "mon2")
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .hand(P2, BOLT, "bolt")
      .build();
    const r = await game.p2.try((p) => p.cast("bolt", { targets: "ally" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("bolt")).toBe("hand");
  });

  test("no printed [Equip]: the Monument is a plain Gear and can never be attached to a unit (rule 476.1)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { body: 1 } })
      .gear(P1, CARD, "mon")
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .build();
    expect(game.p1.legal().filter((o) => o.moveId === "equipCard")).toEqual([]);
    const r = await game.p1.try((p) => p.do("equipCard", { equipmentId: "mon", unitId: "ally" }));
    expect(r.ok).toBe(false);
    expect(game.state("mon").meta.attachedTo).toBeUndefined();
    expect(game.state("ally").meta.equippedWith ?? []).toEqual([]);
  });

  test("parsed abilities: the Temporary keyword plus a static friendly-unit Deflect grant", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "body", energyCost: 2 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { keyword: "Temporary", type: "keyword" },
      {
        effect: { keyword: "Deflect", target: { controller: "friendly", type: "unit" }, type: "grant-keyword" },
        type: "static",
      },
    ]);
  });
});
