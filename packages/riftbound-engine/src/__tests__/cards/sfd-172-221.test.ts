/**
 * Sacred Shears — sfd-172-221 · Gear (Equipment) · Order · 2 energy + [order] · Might bonus +1
 *
 *   [Equip] [order] ([order]: Attach this to a unit you control.)
 *
 * Rules: 149.1 (gear enters ready), 818 (Equip = "[order]: Attach this gear to a unit you control", a
 * targeted activated ability), 434.1.d/718.4 (attached → +1 to the wearer only), 137.3.a (unattached
 * bonus does nothing), 434.4 (attach relocates, not a Move), 719.3.a (rides along), 719.5 + 457.1
 * (wearer leaves the board → detach in place, recalled to base at the next Cleanup), 135.2.e.5.b
 * (pooled [rainbow] pays an [order] pip — for the PLAY pip and for the EQUIP pip alike), gear
 * activated abilities: your turn, open state, not in a showdown; 718.2 (attached → Equip inactive).
 *
 * Head-judge checklist for THIS card:
 *  1. Unlike most cheap Equipment its PLAY cost carries a power pip: [2][order] to play, then ANOTHER
 *     [order] to Equip — a +1 wearer costs [2][order][order] in total. 2 energy alone, or [1][order],
 *     does not play it; calm power pays neither pip; rainbow pays either.
 *  2. +1 thresholds: a 3-Might wearer kills a 3-Might defender and survives (takes 3 < 4); into a
 *     4-Might defender it merely trades.
 *  3. Only "a unit you control" (base or battlefield); relocation to a battlefield opens no showdown.
 *  4. Timing negatives: opponent's turn, showdown Focus, already attached.
 *  5. Wearer dies → Shears survive, recalled to base unattached, re-equippable for another [order].
 *  6. Partner (Order): Emperor of the Sands — playing the Shears IS "played an Equipment this turn"
 *     (unlocks the Sand Soldier ability), and the Soldier's granted Weaponmaster may take the Shears
 *     for [order] − [rainbow] = free → a 3-Might token.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-172-221";
const EMPEROR = "sfd-197-221"; // Legend (Azir) · Your Sand Soldiers have [Weaponmaster]. [1],[Exhaust]: Play a 2-Might Sand Soldier token to base. Use only if you've played an Equipment this turn.

async function equip(game: Game, unitId: string): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "shears", unitId } });
  await game.settle();
}

describe("Sacred Shears (sfd-172-221)", () => {
  test("registry payload: Order equipment, 2 energy + [order] to play, +1 Might bonus, exactly one [Equip] keyword ability costed [order]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "order", energyCost: 2, mightBonus: 1, name: "Sacred Shears", powerCost: ["order"] });
    // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "[Deathknell] — Draw 1. (When I die, get the effect.)" —
    // conferred on the equipped unit while attached, hence the `effectText: true` entries.
    expect(def?.abilities).toEqual([
      { cost: { power: ["order"] }, keyword: "Equip", type: "keyword" },
      { effect: { amount: 1, type: "draw" }, effectText: true, name: "Deathknell", trigger: { event: "die", on: "self" }, type: "triggered" },
    ] as never);
  });

  test("play: costs 2 energy AND 1 order power; enters base READY, unattached, bonus dormant; the Equip then needs a SECOND order power", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).unit(P1, "base", { might: 3 }, "ally").hand(P1, CARD, "shears").build();
    expect(game.p1.can("play", "shears")).toBe(true);
    await game.p1.play("shears");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("shears")).toBe("base");
    expect(game.state("shears")).toMatchObject({ attachedTo: undefined, isReady: true, keywords: ["Equip"] });
    expect(game.state("ally").might).toBe(3);
    expect(game.p1.can("equipCard")).toBe(false); // the play pip is spent; nothing left for [Equip]
  });

  test("play-cost negatives: 2 energy with no power, [1][order], or [2]+calm cannot play it; [2]+pooled rainbow can", async () => {
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "shears").build()).p1.can("play", "shears")).toBe(false);
    expect((await scenario().resources(P1, { energy: 1, power: { order: 2 } }).hand(P1, CARD, "shears").build()).p1.can("play", "shears")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { calm: 1 } }).hand(P1, CARD, "shears").build()).p1.can("play", "shears")).toBe(false);
    const rainbow = await scenario().resources(P1, { energy: 2, power: { rainbow: 1 } }).hand(P1, CARD, "shears").build();
    expect(rainbow.p1.can("play", "shears")).toBe(true);
    await rainbow.p1.play("shears");
    expect([rainbow.p1.energy(), rainbow.p1.power()]).toEqual([0, 0]);
    await rainbow.settle();
    expect(rainbow.zoneOf("shears")).toBe("base");
  });

  test("full price of a +1 from hand: [2][order][order] — play, then Equip; only the wearer grows (3 → 4), pool empty", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 2 } })
      .unit(P1, "base", { might: 3, name: "Wearer" }, "wearer")
      .unit(P1, "base", { might: 3, name: "Bystander" }, "by")
      .hand(P1, CARD, "shears")
      .build();
    await game.p1.play("shears");
    await game.settle();
    expect(game.p1.can("equipCard")).toBe(true);
    await equip(game, "wearer");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("shears").attachedTo).toBe("wearer");
    expect(game.state("wearer")).toMatchObject({ attachments: ["shears"], baseMight: 3, might: 4 });
    expect(game.state("by").might).toBe(3);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("Equip cost domain: calm or energy cannot pay [order]; pooled [rainbow] can", async () => {
    expect((await scenario().resources(P1, { energy: 5, power: { calm: 2 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "shears").build()).p1.can("equipCard")).toBe(false);
    const rainbow = await scenario().resources(P1, { power: { rainbow: 1 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "shears").build();
    await equip(rainbow, "ally");
    expect(rainbow.state("ally").might).toBe(3);
    expect(rainbow.p1.power()).toBe(0);
  });

  test("'a unit you control': friendly units in base or at a battlefield are offered, enemies never; equipping afield relocates the Shears (434.4) with no showdown", async () => {
    const game = await scenario()
      .resources(P1, { power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2 }, "home")
      .unit(P1, "bf1", { might: 3 }, "afield")
      .unit(P2, "base", { might: 2 }, "enemy")
      .gear(P1, CARD, "shears")
      .build();
    const units = game.p1.option("equipCard")?.fields.find((f) => f.name === "unitId")?.options as string[] | undefined;
    expect([...(units ?? [])].toSorted()).toEqual(["afield", "home"]);
    expect((await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "shears", unitId: "enemy" } }))).ok).toBe(false);
    await equip(game, "afield");
    expect(game.zoneOf("shears")).toBe("battlefield-bf1");
    expect(game.state("afield").might).toBe(4);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("+1 threshold in combat: a 3+1 wearer kills a 3-Might defender, SURVIVES (3 < 4) and conquers with the Shears along", async () => {
    const game = await scenario()
      .resources(P1, { power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Duelist" }, "duelist")
      .unit(P2, "bf1", { might: 3, name: "Mirror" }, "mirror")
      .gear(P1, CARD, "shears")
      .build();
    await equip(game, "duelist");
    await game.p1.move("duelist", "bf1");
    expect(game.zoneOf("shears")).toBe("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("mirror")).toBe("trash");
    expect(game.locationOf("duelist")).toBe("bf1");
    expect(game.state("duelist")).toMatchObject({ attachments: ["shears"], damage: 0, might: 4 }); // combat damage heals at cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative space: the same bare 3-vs-3 fight without the Shears attached is a mutual kill and no conquer", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Duelist" }, "duelist")
      .unit(P2, "bf1", { might: 3, name: "Mirror" }, "mirror")
      .gear(P1, CARD, "shears")
      .build();
    await game.p1.move("duelist", "bf1");
    await game.settle();
    expect(game.zoneOf("mirror")).toBe("trash");
    expect(game.zoneOf("duelist")).toBe("trash");
    expect(game.p1.points()).toBe(0);
    expect(game.zoneOf("shears")).toBe("base");
  });

  test("wearer dies (3+1 into a 4-Might wall trades): the Shears detach, are recalled to base unattached, and re-equip for another [order]", async () => {
    const game = await scenario()
      .resources(P1, { power: { order: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Duelist" }, "duelist")
      .unit(P1, "base", { might: 1, name: "Heir" }, "heir")
      .unit(P2, "bf1", { might: 4, name: "Wall" }, "wall")
      .gear(P1, CARD, "shears")
      .build();
    await equip(game, "duelist");
    await game.p1.move("duelist", "bf1");
    await game.settle();
    expect(game.zoneOf("duelist")).toBe("trash"); // took 4 ≥ 4
    expect(game.zoneOf("wall")).toBe("trash"); // took 4 ≥ 4
    expect(game.zoneOf("shears")).toBe("base");
    expect(game.state("shears").attachedTo).toBeUndefined();
    await equip(game, "heir");
    expect(game.state("heir").might).toBe(2);
    expect(game.p1.power("order")).toBe(0);
  });

  test("timing: not on the opponent's turn, not with Focus in a showdown, not while attached (cannot hop to another unit)", async () => {
    const opp = await scenario().active(P2).resources(P1, { power: { order: 1 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "shears").build();
    expect(opp.p1.legal().some((o) => o.moveId === "equipCard")).toBe(false);

    const attached = await scenario().resources(P1, { power: { order: 2 } }).unit(P1, "base", { might: 2 }, "a").unit(P1, "base", { might: 2 }, "b").gear(P1, CARD, "shears").build();
    await equip(attached, "a");
    expect(attached.p1.can("equipCard")).toBe(false);
    expect((await attached.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "shears", unitId: "b" } }))).ok).toBe(false);
    expect([attached.state("a").might, attached.state("b").might]).toEqual([3, 2]);

    const sd = await scenario()
      .resources(P1, { power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "attacker")
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 3 }, "def")
      .gear(P1, CARD, "shears")
      .build();
    expect(sd.p1.can("equipCard")).toBe(true);
    await sd.p1.move("attacker", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("equipCard")).toBe(false);
  });

  test("Emperor of the Sands' 'Use only if you've played an Equipment this turn' should lock the token ability until the Shears are played (377.2.b)", async () => {
    // Expected: not activatable before any Equipment was played this turn; playing the Shears unlocks it.
    // Actual: the `played-equipment-this-turn` restriction is not enforced — the ability is offered immediately.
    const game = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).legend(P1, EMPEROR, "azir").hand(P1, CARD, "shears").build();
    expect(game.p1.can("activate", "azir")).toBe(false); // no Equipment played yet this turn
    await game.p1.play("shears");
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("activate", "azir")).toBe(true);
  });

  test("Emperor of the Sands → the played Sand Soldier token has [Weaponmaster] and should offer to take the Shears for [order] − [rainbow] = free (185.2.a / 821)", async () => {
    // Expected: the token is PLAYED (185.2.a), carries the granted Weaponmaster, so P1 is offered the Shears; taking
    // them costs nothing and makes a 3-Might Soldier. Actual: the token shows the keyword but no Weaponmaster
    // prompt ever appears; the Shears stay unattached.
    const game = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).legend(P1, EMPEROR, "azir").hand(P1, CARD, "shears").build();
    await game.p1.play("shears");
    await game.settle();
    await game.p1.activate("azir");
    for (let i = 0; i < 8; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || d?.kind !== "pick" || d.seat !== P1) {
        break;
      }
      await game.p1.pick(d.options.find((o) => (o.card ?? o.key) === "shears") ? "shears" : (d.options[0]?.key as string));
    }
    const soldier = game.findAll({ name: "Sand Soldier", owner: P1 }).find((id) => game.locationOf(id) === "base");
    expect(soldier).toBeDefined();
    expect(game.state("azir").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("shears").attachedTo).toBe(soldier);
    expect(game.state(soldier as string).might).toBe(3);
  });
});
