/**
 * World Atlas — sfd-086-221 · Gear (Equipment) · Mind · 3 energy (no power) · Might bonus +2
 *
 *   [Equip] [mind] ([mind]: Attach this to a unit you control.)
 *
 * (The card data carries no Effect Text for this Equipment; only the printed [Equip] and +2 are tested.)
 *
 * Rules: 359.2.d (a non-unit gear enters READY in its controller's base and playing it uses no chain),
 * 818.1 / 818.1.c.2 ([Equip] = "[Cost]: Attach this gear to a unit you control" — an ACTIVATED ability:
 * cost paid on activation, a chain item, attach on resolution; 818.1.b.1 the unit is a target), 151.2
 * (gear abilities: your Main Phase, Open State, never in a showdown), 434.4 / 719.3.a (an attached card
 * is at the holder's location and travels with it), 718.4 / 434.1.d (Might Bonus modulates the holder),
 * 718.2 (an attached card's own rules text is Inactive), 818.3.b (a unit may hold "one or more"
 * Equipment), 719.5 / 435.4.b / 457.1 (holder leaves the board → the Equipment detaches, stays on the
 * board and is recalled to base), 143.2.a (lethal is checked against effective Might), 821 (Weaponmaster:
 * Equip on play for [rainbow] less — a lone [mind] pip becomes free).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Two payments in two currencies: 3 ENERGY to play (mind power can't help), then exactly one MIND
 *     power to Equip (energy, fury power can't pay it).
 *  2. Equip may target a unit you control ANYWHERE — including one already at a battlefield; the Atlas
 *     then relocates there (434.4) without that being a Move.
 *  3. The +2 exists only after the chain item resolves; a 1-Might holder then survives "deal 2" and
 *     dies to exactly 3.
 *  4. Stacking: two Atlases on one unit = +4 (818.3.b); a worn Atlas cannot be re-Equipped elsewhere.
 *  5. Holder bounced to hand → Atlas stays in base, unattached, printed self; holder walks/gets recalled →
 *     Atlas rides along.
 *  6. Partners (Mind): Ornn's Weaponmaster equips it for free on play; Gearhead doubles it to +4.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-086-221";
const ORNN = "sfd-085-221"; // Mind · 6 · 4 Might · Deflect 2 · Weaponmaster · +1 Might per friendly gear
const GEARHEAD = "sfd-068-221"; // Mind · 5 · 3 Might · Each Equipment attached to me gives double its base Might bonus
const BOLT = (n: number) => ({
  abilities: [{ effect: { amount: n, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: `Test Bolt ${n}`,
  rulesText: `[Action] Deal ${n} to a unit.`,
  timing: "action",
});
const BOUNCE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "return-to-hand" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Test Bounce",
  rulesText: "[Action] Return a unit to its owner's hand.",
  timing: "action",
};

function onBoard(power: Record<string, number> = { mind: 1 }) {
  return scenario()
    .resources(P1, { energy: 0, power })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 1, name: "Scholar" }, "scholar")
    .unit(P1, "bf1", { might: 3, name: "Ranger" }, "ranger")
    .unit(P2, "bf2", { might: 4, name: "Brute" }, "brute")
    .gear(P1, CARD, "atlas");
}

const pairs = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants.map((v) => `${String(v.params.equipmentId)}->${String(v.params.unitId)}`))
    .sort();

async function equip(game: Game, unit: string, gear = "atlas"): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: gear, unitId: unit } });
  await game.settle();
}

describe("World Atlas (sfd-086-221)", () => {
  test("registry payload: Mind Equipment, 3 energy, no power cost, +2 Might bonus, exactly one [Equip] keyword ability costing [mind]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "mind", energyCost: 3, mightBonus: 2, name: "World Atlas" });
    expect(def?.powerCost ?? []).toEqual([]);
    // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "When I hold, play two Gold gear tokens exhausted." —
    // conferred on the equipped unit while attached, hence the `effectText: true` entries.
    expect(def?.abilities).toEqual([
      { cost: { power: ["mind"] }, keyword: "Equip", type: "keyword" },
      { effect: { amount: 2, ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" }, effectText: true, trigger: { event: "hold", on: "self" }, type: "triggered" },
    ] as never);
  });

  test("play cost: exactly 3 energy (mind power can't substitute), no chain, enters the base READY and unattached; nobody's Might changes", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).unit(P1, "base", { might: 1, name: "Scholar" }, "scholar").hand(P1, CARD, "atlas").build();
    await game.p1.play("atlas");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("atlas")).toBe("base");
    expect(game.state("atlas")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.state("scholar").might).toBe(1);
    expect((await scenario().resources(P1, { energy: 2, power: { mind: 5 } }).hand(P1, CARD, "a").build()).p1.can("play", "a")).toBe(false);
  });

  test("[Equip] [mind]: spends exactly the mind power, is a P1 chain item the opponent may answer, and only on resolution attaches for +2 (1 → 3)", async () => {
    const game = await onBoard({ fury: 1, mind: 1 }).resources(P1, { energy: 2 }).build();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "atlas", unitId: "scholar" } });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1, mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "atlas", controller: P1 })]);
    expect(game.state("scholar").might).toBe(1);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2); // 377.3.b.2 — the opponent gets a response window
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("atlas").attachedTo).toBe("scholar");
    expect(game.state("scholar")).toMatchObject({ attachments: ["atlas"], baseMight: 1, might: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("Equip cost negative space: energy alone, fury power, or an empty pool cannot pay [mind] — nothing is offered and a forced attempt is rejected", async () => {
    for (const pool of [{ energy: 5 }, { energy: 0, power: { fury: 2 } }, { energy: 0 }]) {
      const game = await onBoard({}).resources(P1, pool).build();
      expect(pairs(game)).toEqual([]);
      const r = await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "atlas", unitId: "scholar" } }));
      expect(r.ok).toBe(false);
      expect(game.state("atlas").attachedTo).toBeUndefined();
    }
  });

  test("targets: every unit YOU control wherever it is (base Scholar, bf1 Ranger) — never the enemy Brute; equipping the Ranger relocates the Atlas to bf1 (434.4)", async () => {
    const game = await onBoard().build();
    expect(pairs(game)).toEqual(["atlas->ranger", "atlas->scholar"]);
    expect((await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "atlas", unitId: "brute" } }))).ok).toBe(false);
    await equip(game, "ranger");
    expect(game.state("atlas").attachedTo).toBe("ranger");
    expect(game.locationOf("atlas")).toBe("bf1");
    expect(game.state("ranger").might).toBe(5);
    expect(game.state("ranger").isReady).toBe(true); // attaching is not a Move and changes no status (434.5)
  });

  test("timing (151.2): not on the opponent's turn, not during a showdown, not while a spell sits on the chain", async () => {
    expect(pairs(await onBoard().active(P2).build())).toEqual([]);
    const sd = await onBoard().unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await sd.p1.move("scout", "bf2");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(pairs(sd)).toEqual([]);
    const closed = await onBoard().hand(P1, BOLT(1), "bolt").build();
    await closed.p1.cast("bolt", { targets: "brute" });
    expect(pairs(closed)).toEqual([]);
    await closed.settle();
    expect(pairs(closed)).toEqual(["atlas->ranger", "atlas->scholar"]);
  });

  test("the +2 is real for lethal checks (143.2.a): the 1-Might Scholar wearing the Atlas (3) survives 'deal 2' but dies to exactly 3 — and the Atlas then stays in base unattached", async () => {
    const game = await onBoard().hand(P1, BOLT(2), "b2").hand(P1, BOLT(3), "b3").build();
    await equip(game, "scholar");
    await game.p1.cast("b2", { targets: "scholar" });
    await game.settle();
    expect(game.state("scholar")).toMatchObject({ damage: 2, might: 3, zone: "base" });
    await game.p1.cast("b3", { targets: "scholar" });
    await game.settle();
    expect(game.zoneOf("scholar")).toBe("trash");
    expect(game.zoneOf("atlas")).toBe("base");
    expect(game.state("atlas")).toMatchObject({ attachedTo: undefined, owner: P1 });
  });

  test("718.2 + 818.3.b: a worn Atlas cannot be re-Equipped to someone else, but a SECOND Atlas can go on the same unit for +4 total", async () => {
    const game = await onBoard({ mind: 3 }).gear(P1, CARD, "atlas2").build();
    await equip(game, "scholar", "atlas");
    expect(pairs(game)).toEqual(["atlas2->ranger", "atlas2->scholar"]); // the attached copy offers nothing
    await equip(game, "scholar", "atlas2");
    expect([...game.state("scholar").attachments].sort()).toEqual(["atlas", "atlas2"]);
    expect(game.state("scholar").might).toBe(5);
    expect(game.p1.power("mind")).toBe(1);
  });

  test("travels with the holder (719.3.a): Ranger + Atlas (5) walks into bf2, kills the 4-Might Brute, survives healed, conquers; the Atlas ends at bf2 still attached", async () => {
    const fight = await scenario()
      .resources(P1, { power: { mind: 1 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Ranger" }, "ranger")
      .unit(P2, "bf2", { might: 4, name: "Brute" }, "brute")
      .gear(P1, CARD, "atlas")
      .build();
    await equip(fight, "ranger");
    await fight.p1.move("ranger", "bf2");
    expect(fight.locationOf("atlas")).toBe("bf2");
    expect(fight.state("ranger")).toMatchObject({ combatRole: "attacker", might: 5 });
    await fight.settle();
    expect(fight.zoneOf("brute")).toBe("trash");
    expect(fight.locationOf("ranger")).toBe("bf2");
    expect(fight.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(fight.p1.points()).toBe(1);
    expect(fight.state("atlas").attachedTo).toBe("ranger");
    expect(fight.locationOf("atlas")).toBe("bf2");
  });

  test("near miss: WITHOUT equipping (power kept), the same 3-Might Ranger dies to the 4-Might Brute and the Atlas never left base", async () => {
    const game = await scenario()
      .resources(P1, { power: { mind: 1 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Ranger" }, "ranger")
      .unit(P2, "bf2", { might: 4, name: "Brute" }, "brute")
      .gear(P1, CARD, "atlas")
      .build();
    await game.p1.move("ranger", "bf2");
    await game.settle();
    expect(game.zoneOf("ranger")).toBe("trash");
    expect(game.zoneOf("atlas")).toBe("base");
    expect(game.p1.power("mind")).toBe(1);
  });

  test("holder bounced to hand by the opponent (719.5): the Atlas detaches, stays in P1's base as its printed unattached self, and is Equip-able again next turn", async () => {
    const game = await onBoard({ mind: 1 }).resources(P2, { energy: 0 }).hand(P2, BOUNCE, "bounce").build();
    await equip(game, "scholar");
    await game.advanceTurn();
    await game.p2.cast("bounce", { targets: "scholar" });
    await game.settle();
    expect(game.zoneOf("scholar")).toBe("hand");
    expect(game.zoneOf("atlas")).toBe("base");
    expect(game.state("atlas")).toMatchObject({ attachedTo: undefined, controller: P1 });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(pairs(game)).toEqual([]); // pools emptied at end of turn (rule 165) — no mind power yet
    await game.p1.do("addResources", { power: { mind: 1 } });
    expect(pairs(game)).toEqual(["atlas->ranger"]);
  });

  test("partner — Ornn's Weaponmaster (821): playing Ornn for 6 with ZERO power offers the loose Atlas; taking it attaches for free → 4 + 2 (Atlas) + 1 (per friendly gear) = 7", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).gear(P1, CARD, "atlas").hand(P1, ORNN, "ornn").build();
    await game.p1.play("ornn", { answers: ["atlas"] });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("atlas");
      await game.settle();
    }
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("atlas").attachedTo).toBe("ornn");
    expect(game.state("ornn").might).toBe(7);
  });

  test("partner — Gearhead doubles the base bonus: Atlas on Gearhead is 3 + 2×2 = 7, on a plain 3-Might unit only 5", async () => {
    const game = await scenario().resources(P1, { power: { mind: 2 } }).unit(P1, "base", GEARHEAD, "gh").unit(P1, "base", { might: 3, name: "Plain" }, "plain").gear(P1, CARD, "atlas").gear(P1, CARD, "atlas2").build();
    await equip(game, "gh", "atlas");
    expect(game.state("gh").might).toBe(7);
    await equip(game, "plain", "atlas2");
    expect(game.state("plain").might).toBe(5);
  });
});
