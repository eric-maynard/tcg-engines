/**
 * Skyfall of Areion — sfd-030-221 · Gear (Equipment) · Fury · 3 energy · Might bonus +2
 *
 *   [Equip] [1][fury] ([1][fury]: Attach this to a unit you control.)
 *
 * Rules: 818 Equip (activated ability of an Equipment; its choice is a TARGET — 818.1.b.1 — and
 * only "a unit you control"); 149.1 gear enters ready; 137.3.a the Might bonus applies only while
 * attached; 377.3 / 818.1.c.1 the activation uses the chain; 151.2 / 381 gear abilities are usable
 * only on your turn in an Open, non-showdown state; 718.2 an attached Equipment's text is inactive
 * (no hopping); 719.5 + 457.1 when the wearer leaves the board the Equipment stays, detached, and is
 * recalled to base; 821 Weaponmaster pays the Equip cost minus [rainbow] (one power of any domain).
 *
 * Head-judge corner cases covered here:
 *   1. Two different costs: [3] (no power) PLAYS it — never attaches; [1][fury] EQUIPS it. Each
 *      resource is checked separately: 0 energy + fury ✗, 1 energy + calm ✗, 1 energy + fury ✓.
 *   2. Weaponmaster reduces [1][fury] by [rainbow] → the [1] Energy REMAINS owed: Sentinel Adept
 *      with exactly 3 energy cannot take it; with 4 it can and ends at 0.
 *   3. +2 rides into combat (2+2 beats a 3), and drops off the moment the wearer dies (Skyfall goes
 *      home to base, unattached, and can be equipped again for another [1][fury]).
 *   4. Enemy units are never Equip targets; with no friendly unit the ability is not offered.
 *   5. Timing: illegal on the opponent's turn, inside a showdown, and while a chain is open.
 *   6. Partner Gearhead doubles the BASE bonus: +4.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-030-221";
const SENTINEL_ADEPT = "sfd-008-221"; // Fury 3-cost 3-Might [Weaponmaster]
const GEARHEAD = "sfd-068-221"; // Mind 5-cost 3-Might: each Equipment attached gives double its base bonus
const CLEAVE = "ogn-004-298"; // Fury Action spell, 1 energy

type Built = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

async function equip(game: Built, unitId: string): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "sky", unitId } });
  await game.settle();
}

function withSky(res: { energy?: number; power?: Record<string, number> } = { energy: 1, power: { fury: 1 } }) {
  return scenario().resources(P1, res).unit(P1, "base", { might: 2, name: "Ally" }, "ally").gear(P1, CARD, "sky");
}

describe("Skyfall of Areion (sfd-030-221)", () => {
  test("registry payload: Fury equipment, 3 energy, +2 Might bonus, an [Equip] keyword ability costing 1 energy + [fury] and the conferred hold↔conquer static", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "fury", energyCost: 3, mightBonus: 2, name: "Skyfall of Areion" });
    expect(def?.abilities).toEqual([
      { cost: { energy: 1, power: ["fury"] }, keyword: "Equip", type: "keyword" },
      // rule 136.2.d / 718 — "My hold effects are also conquer effects, and vice versa" is Effect Text conferred on the wearer.
      { effect: { type: "hold-conquer-equivalence" }, effectText: true, type: "static" },
    ]);
  });

  test("play cost is 3 energy and no power: it enters the base ready and UNATTACHED (playing never equips); 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "sky").build();
    await game.p1.play("sky");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("sky")).toBe("base");
    expect(game.state("sky")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.state("ally").might).toBe(2);
    expect(game.p1.can("equipCard")).toBe(false); // nothing left to pay [1][fury]
    const poor = await scenario().resources(P1, { energy: 2, power: { fury: 2 } }).hand(P1, CARD, "sky").build();
    expect(poor.p1.can("play", "sky")).toBe(false);
  });

  test("Equip [1][fury]: exactly 1 energy + 1 fury paid on activation, one chain item the opponent can answer, attaches on resolution for +2 Might", async () => {
    const game = await withSky({ energy: 2, power: { fury: 2 } }).build();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "sky", unitId: "ally" } });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sky", controller: P1, triggered: false })]);
    expect(game.state("sky").attachedTo).toBeUndefined();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.settle();
    expect(game.state("sky").attachedTo).toBe("ally");
    expect(game.state("ally")).toMatchObject({ attachments: ["sky"], baseMight: 2, might: 4 });
    expect(game.violations()).toEqual([]);
  });

  test("each resource is required: 0 energy + [fury] ✗, 1 energy + [calm] ✗, 1 energy + [fury] ✓", async () => {
    expect((await withSky({ energy: 0, power: { fury: 2 } }).build()).p1.can("equipCard")).toBe(false);
    expect((await withSky({ energy: 5, power: { calm: 2 } }).build()).p1.can("equipCard")).toBe(false);
    expect((await withSky({ energy: 1, power: { fury: 1 } }).build()).p1.can("equipCard")).toBe(true);
  });

  test("'a unit you control': enemy units are never offered; with no friendly unit on the board there is nothing to equip", async () => {
    const game = await withSky().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 3 }, "afield").unit(P2, "base", { might: 2 }, "enemy").build();
    const units = game.p1.option("equipCard")?.fields.find((f) => f.name === "unitId")?.options;
    expect([...(units ?? [])].toSorted()).toEqual(["afield", "ally"]);
    const r = await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "sky", unitId: "enemy" } }));
    expect(r.ok).toBe(false);
    const lonely = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).unit(P2, "base", { might: 2 }, "enemy").gear(P1, CARD, "sky").build();
    expect(lonely.p1.can("equipCard")).toBe(false);
  });

  test("+2 counts in combat and the gear rides along: a 2+2 wearer kills a 3-Might defender, survives (3 < 4) and conquers", async () => {
    const game = await withSky().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3, name: "Defender" }, "def").build();
    await equip(game, "ally");
    await game.p1.move("ally", "bf1");
    expect(game.zoneOf("sky")).toBe("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.state("sky").attachedTo).toBe("ally");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("wearer dies (2+2 into a 5): Skyfall detaches, is recalled to base unattached, and can be equipped to another unit for another [1][fury]", async () => {
    const game = await withSky({ energy: 2, power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 1, name: "Heir" }, "heir")
      .build();
    await equip(game, "ally");
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.zoneOf("sky")).toBe("base");
    expect(game.state("sky").attachedTo).toBeUndefined();
    await equip(game, "heir");
    expect(game.state("heir").might).toBe(3);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("while attached its Equip is inactive (718.2): it cannot hop to a second unit even with resources to spare", async () => {
    const game = await withSky({ energy: 3, power: { fury: 3 } }).unit(P1, "base", { might: 2 }, "second").build();
    await equip(game, "ally");
    expect(game.p1.can("equipCard")).toBe(false);
    const r = await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "sky", unitId: "second" } }));
    expect(r.ok).toBe(false);
    expect(game.state("second").might).toBe(2);
  });

  test("timing (151.2 / 381): not on the opponent's turn, not with Focus in a showdown, not while a chain is open — legal again once it resolves", async () => {
    const opp = await withSky().active(P2).build();
    expect(opp.p1.legal().map((o) => o.moveId)).not.toContain("equipCard");

    const sd = await withSky().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3 }, "def").unit(P1, "base", { might: 3 }, "atk").build();
    await sd.p1.move("atk", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("equipCard")).toBe(false);

    const chain = await withSky({ energy: 2, power: { fury: 1 } }).hand(P1, CLEAVE, "cleave").build();
    await chain.p1.cast("cleave", { targets: "ally" });
    expect(chain.chain()).toHaveLength(1);
    expect(chain.p1.can("equipCard")).toBe(false);
    await chain.settle();
    expect(chain.p1.can("equipCard")).toBe(true);
  });

  test("Weaponmaster (Sentinel Adept): [1][fury] − [rainbow] leaves [1] owed — with 4 energy it equips (ending at 0) for 3+2 = 5 Might", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).gear(P1, CARD, "sky").hand(P1, SENTINEL_ADEPT, "adept").build();
    await game.p1.play("adept");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect((game.decision() as { options: { card?: string }[] }).options.map((o) => o.card)).toEqual(["sky"]);
    await game.p1.pick("sky");
    await game.settle();
    expect(game.state("sky").attachedTo).toBe("adept");
    expect(game.state("adept").might).toBe(5);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("Weaponmaster with exactly 3 energy (all spent on the Adept): the remaining [1] cannot be paid, so Skyfall is not offered and stays loose", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).gear(P1, CARD, "sky").hand(P1, SENTINEL_ADEPT, "adept").build();
    await game.p1.play("adept");
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card)).not.toContain("sky");
      await game.p1.decline();
    }
    await game.settle();
    expect(game.state("sky").attachedTo).toBeUndefined();
    expect(game.state("adept").might).toBe(3);
  });

  test("partner Gearhead: 'double its base Might bonus' turns Skyfall's +2 into +4 (3 → 7)", async () => {
    const game = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).unit(P1, "base", GEARHEAD, "gh").gear(P1, CARD, "sky").build();
    await equip(game, "gh");
    expect(game.state("sky").attachedTo).toBe("gh");
    expect(game.state("gh").might).toBe(7);
  });
});
