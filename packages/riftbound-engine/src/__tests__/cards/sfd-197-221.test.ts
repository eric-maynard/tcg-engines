/**
 * Emperor of the Sands — sfd-197-221 · Legend (Azir) · Calm/Order
 *
 *   Your Sand Soldiers have [Weaponmaster].
 *   [1], [Exhaust]: Play a 2 [Might] Sand Soldier unit token to your base. Use only if you've played
 *   an Equipment this turn.
 *
 * Rules: 377.2.b ("Use only if …" must be TRUE to activate at all), 377.3 (activated ability → chain →
 * opponent may respond → token on resolution), 187.3 + 359.2.c (Sand Soldier = 2-Might unit token; a
 * played unit enters exhausted), 419 (an Equipment is "played" when it is played from hand — activating
 * [Equip] on one already on the board is not playing it; a plain gear is not an Equipment), 821 (the
 * granted Weaponmaster is a Play Effect: when a Sand Soldier is played its controller may Equip one of
 * their Equipment to it for [rainbow] less), 316.5.b / 813 (no [Reaction]: own turn, open state only).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. The gate is per TURN and about PLAYING an Equipment: nothing played → illegal; a plain gear played
 *     → illegal; Equip-activating a pre-existing Equipment → illegal; Equipment played LAST turn → illegal.
 *  2. Costs: exactly [1] + exhaust; 0 energy → illegal even after an Equipment; exhausted legend → once
 *     per turn; Awaken readies it.
 *  3. The token: P1's, in BASE (even with a controlled battlefield), exhausted, 2 Might, tagged Sand
 *     Soldier and therefore showing Weaponmaster; the opponent's Sand Soldiers get nothing from MY legend.
 *  4. Synergy the card is built for: Doran's Shield played this turn (Equip [calm]) → legend → token is
 *     PLAYED → its Weaponmaster offers the Shield for [calm]−[rainbow] = free → a 3-Might soldier.
 *  5. The static reaches Sand Soldiers from any source (Desert's Call), not just the legend's own.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-197-221";
const DORANS_SHIELD = "sfd-033-221"; // Equipment · Calm · 1 energy · +1 · Equip [calm]
const SEAL = "ogn-120-298"; // Seal of Insight — a plain (non-Equipment) gear, 2 energy? (cost read from state)
const DESERTS_CALL = "sfd-031-221"; // Spell · 2 · Play a 2-Might Sand Soldier unit token

const soldiers = (game: Game, owner = P1) =>
  game.findAll({ name: "Sand Soldier", owner }).filter((id) => game.state(id).isToken && game.locationOf(id) !== undefined);

/** P1's turn, legend ready, Doran's Shield in hand, 3 energy + 1 calm. */
function board(energy = 3) {
  return scenario().resources(P1, { energy, power: { calm: 1 } }).legend(P1, CARD, "emp").hand(P1, DORANS_SHIELD, "shield");
}

async function playShield(game: Game): Promise<void> {
  await game.p1.play("shield");
  await game.settle();
  expect(game.zoneOf("shield")).toBe("base");
}

describe("Emperor of the Sands (sfd-197-221)", () => {
  test("registry payload: static grant-keyword Weaponmaster to friendly Sand Soldier units + activated {[1], exhaust} create 2-Might Sand Soldier token in base, restricted to played-equipment-this-turn", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Azir", domain: ["calm", "order"], name: "Emperor of the Sands" });
    expect(def?.abilities).toEqual([
      {
        effect: { keyword: "Weaponmaster", target: { controller: "friendly", filter: { tag: "Sand Soldier" }, type: "unit" }, type: "grant-keyword" },
        type: "static",
      },
      {
        cost: { energy: 1, exhaust: true },
        effect: { location: "base", token: { might: 2, name: "Sand Soldier", type: "unit" }, type: "create-token" },
        restrictions: [{ type: "played-equipment-this-turn" }],
        type: "activated",
      },
    ]);
  });

  test("after playing Doran's Shield this turn: activation pays [1] + exhausts the legend, the ability waits on the chain (P2 may respond), then ONE exhausted 2-Might Sand Soldier token appears in P1's base", async () => {
    const game = await board().build();
    await playShield(game);
    expect(game.p1.energy()).toBe(2);
    await game.p1.activate("emp");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.state("emp").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "emp", controller: P1, triggered: false })]);
    expect(soldiers(game)).toEqual([]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    await game.settle(); // decline any Weaponmaster offer
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.state(made[0] as string)).toMatchObject({ baseMight: 2, cardType: "unit", controller: P1, isExhausted: true, isToken: true, might: 2, owner: P1, zone: "base" });
    expect(soldiers(game, P2)).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("377.2.b — 'Use only if you've played an Equipment this turn': with nothing played the ability is not activatable and no token can be made", async () => {
    // Expected: activate is illegal (not offered / rejected); energy and legend untouched; no token.
    // Actual: the `played-equipment-this-turn` restriction is never checked — the ability is always offered.
    const game = await board().build();
    expect(game.p1.can("activate", "emp")).toBe(false);
    const r = await game.p1.try((p) => p.activate("emp"));
    expect(r.ok).toBe(false);
    await game.settle();
    expect(soldiers(game)).toEqual([]);
    expect(game.state("emp").isReady).toBe(true);
    expect(game.p1.energy()).toBe(3);
  });

  test("playing a plain (non-Equipment) gear does not satisfy the gate", async () => {
    // Expected: Seal of Insight is a gear but not an Equipment → still illegal. Actual: always legal.
    const game = await scenario().resources(P1, { energy: 6, power: { calm: 1, mind: 1 } }).legend(P1, CARD, "emp").hand(P1, SEAL, "seal").build();
    await game.p1.play("seal");
    await game.settle();
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.p1.can("activate", "emp")).toBe(false);
  });

  test("activating [Equip] on an Equipment that was already on the board is not PLAYING an Equipment — the gate stays shut", async () => {
    // Expected: after equipCard resolves the legend is still not activatable. Actual: always legal.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .legend(P1, CARD, "emp")
      .gear(P1, DORANS_SHIELD, "shield")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .build();
    await game.p1.do("equipCard", { equipmentId: "shield", unitId: "squire" });
    await game.settle();
    expect(game.state("shield").attachedTo).toBe("squire");
    expect(game.p1.can("activate", "emp")).toBe(false);
  });

  test("'this turn' — an Equipment played LAST turn does not unlock the ability on my next turn", async () => {
    // Expected: turn N play Shield (legal that turn), turn N+2 (mine again, legend ready, 1+ energy) → illegal
    // until I play another Equipment. Actual: always legal.
    const game = await board().build();
    await playShield(game);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("emp").isReady).toBe(true);
    await game.p1.do("addResources", { energy: 2 });
    expect(game.p1.can("activate", "emp")).toBe(false);
  });

  test("costs: 0 energy after the Equipment → not activatable; an exhausted legend → not activatable (once per turn); Awaken readies it for next turn", async () => {
    const broke = await board(1).build();
    await playShield(broke); // spends the only energy
    expect(broke.p1.energy()).toBe(0);
    expect(broke.p1.can("activate", "emp")).toBe(false);

    const game = await board(3).build();
    await playShield(game);
    await game.p1.activate("emp");
    await game.settle();
    await game.p1.decline(); // rule 821.1.c — the token's [Weaponmaster] offer is a "may"
    expect(soldiers(game)).toHaveLength(1);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("activate", "emp")).toBe(false); // exhausted
    expect((await game.p1.try((p) => p.activate("emp"))).ok).toBe(false);
    await game.advanceTurn();
    expect(game.state("emp").isExhausted).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("emp").isReady).toBe(true);
    expect(game.state(soldiers(game)[0] as string).isReady).toBe(true); // the token readied too
  });

  test("no [Reaction]: not activatable on the opponent's turn (open state or in response), nor while I hold Focus in a showdown on my turn", async () => {
    const opp = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .resources(P2, { energy: 2 })
      .legend(P1, CARD, "emp")
      .unit(P1, "base", { might: 2 }, "squire")
      .hand(P2, DESERTS_CALL, "dc")
      .build();
    expect(opp.p1.can("activate", "emp")).toBe(false);
    await opp.p2.cast("dc");
    await opp.p2.passPriority();
    expect(opp.actingSeat()).toBe(P1);
    expect(opp.p1.can("activate", "emp")).toBe(false);

    const mine = await board()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 3, name: "Knight" }, "knight")
      .build();
    await playShield(mine);
    await mine.p1.move("knight", "bf1");
    expect(mine.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(mine.p1.can("activate", "emp")).toBe(false);
  });

  test("'to your base': even with a controlled battlefield the token lands in base without asking", async () => {
    const game = await board().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 3 }, "holder").build();
    await playShield(game);
    await game.p1.activate("emp");
    await game.settle();
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.zoneOf(made[0] as string)).toBe("base");
    expect(game.p1.units("bf1")).toEqual(["holder"]);
  });

  test("static: MY Sand Soldiers (a pre-existing one, a Desert's Call token) show Weaponmaster; the opponent's Sand Soldier and my non-Soldier units do not", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .legend(P1, CARD, "emp")
      .unit(P1, "base", { might: 2, name: "Sand Soldier", tags: ["Sand Soldier"] }, "mine")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .unit(P2, "base", { might: 2, name: "Sand Soldier", tags: ["Sand Soldier"] }, "theirs")
      .hand(P1, DESERTS_CALL, "dc")
      .build();
    expect(game.state("mine").keywords).toContain("Weaponmaster");
    expect(game.state("squire").keywords).not.toContain("Weaponmaster");
    expect(game.state("theirs").keywords).not.toContain("Weaponmaster");
    await game.p1.cast("dc");
    await game.settle();
    const fresh = soldiers(game).filter((s) => s !== "mine");
    expect(fresh).toHaveLength(1);
    expect(game.state(fresh[0] as string).keywords).toContain("Weaponmaster");
  });

  test("the built-in combo — Shield played this turn, legend makes a Sand Soldier, its granted [Weaponmaster] (821, a Play Effect) offers the Shield for [calm]−[rainbow] = free → a 3-Might soldier", async () => {
    // Expected: as the token is PLAYED its Weaponmaster triggers: P1 may pick Doran's Shield; it attaches
    // for free (calm power untouched) and the token is 2+1 = 3. Actual: tokens created by an effect never
    // raise their play effects, so no Weaponmaster offer ever appears and the Shield stays loose.
    const game = await board().build();
    await playShield(game);
    await game.p1.activate("emp");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["shield"]);
    await game.p1.pick("shield");
    await game.settle();
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.state("shield").attachedTo).toBe(made[0]);
    expect(game.state(made[0] as string).might).toBe(3);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
  });

  test("same grant via Desert's Call — the spell-played Sand Soldier's Weaponmaster offers my loose Doran's Shield", async () => {
    // Expected: after Desert's Call resolves, a Weaponmaster pick (shield) for P1. Actual: straight back to the main phase.
    const game = await scenario().resources(P1, { energy: 2, power: { calm: 1 } }).legend(P1, CARD, "emp").gear(P1, DORANS_SHIELD, "shield").hand(P1, DESERTS_CALL, "dc").build();
    await game.p1.cast("dc");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("shield");
    await game.settle();
    const made = soldiers(game);
    expect(game.state("shield").attachedTo).toBe(made[0]);
    expect(game.state(made[0] as string).might).toBe(3);
  });
});
