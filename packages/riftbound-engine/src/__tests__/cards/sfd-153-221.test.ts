/**
 * Eye of the Herald — sfd-153-221 · Gear (Equipment) · Order · 1 energy (no power) · Might bonus +0
 *
 *   [Equip] [order] ([order]: Attach this to a unit you control.)
 *   Effect Text: When I move, play a 1 [Might] Recruit unit token here.
 *
 * (+0 bonus: as a stat stick it does nothing; its Effect Text — the WEARER's move trigger while attached,
 * rule 150.2 / 718.3 — is what the card is for.)
 *
 * Rules: 359.2.d (gear enters READY in base, no chain), 818.1 ([Equip] is an activated ability: cost
 * on activation, chain item, target = a unit you control, attach on resolution), 818.3 (Equipped = has
 * an Equipment attached — independent of any Might bonus), 718.4 (a +0 Might Bonus modulates by 0),
 * 718.5.a/b (an attached card keeps its types and can still be chosen — "kill a gear" may pick it off
 * a unit), 719.5 / 457.1 (holder leaves the board at a battlefield → the Equipment detaches there and is
 * recalled to base in the next Cleanup), 151.2 (timing), 165 (pools empty at end of turn).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Two separate 1-unit payments in different currencies: 1 ENERGY to play, 1 ORDER power to Equip;
 *     neither substitutes for the other; 0 of either → that half is illegal.
 *  2. +0 means the holder's Might must be EXACTLY unchanged (not +1, not NaN) while `attachments`
 *     shows the Eye — "equipped" is a status, not a stat.
 *  3. It still counts as an Equipment you control whether loose in base or worn (Arise! counts both).
 *  4. An attached Eye is still a gear on the board: an enemy "kill a gear" trashes it off the holder,
 *     who is otherwise untouched; the holder dying instead leaves the Eye on the board, recalled home.
 *  5. Partner (Order): Emperor of the Sands — playing the 1-cost Eye is "played an Equipment this
 *     turn", unlocking the Sand Soldier ability the same turn.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-153-221";
const EMPEROR = "sfd-197-221"; // Legend · Calm/Order · [1],[Exhaust]: Sand Soldier token — only if you've played an Equipment this turn
const ARISE = "sfd-198-221"; // Spell · Calm/Order · 6 + hybrid pip · a 2-Might Sand Soldier per Equipment you control; then ready up to two
const SMASH = {
  abilities: [{ effect: { target: { type: "gear" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Smash",
  rulesText: "[Action] Kill a gear.",
  timing: "action",
};

function onBoard(pool: { energy?: number; power?: Record<string, number> } = { power: { order: 1 } }) {
  return scenario()
    .resources(P1, { energy: pool.energy ?? 0, power: pool.power ?? {} })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Knight" }, "knight")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .gear(P1, CARD, "eye");
}

const pairs = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants.map((v) => `${String(v.params.equipmentId)}->${String(v.params.unitId)}`))
    .sort();

async function equip(game: Game, unit = "knight"): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "eye", unitId: unit } });
  await game.settle();
}

describe("Eye of the Herald (sfd-153-221)", () => {
  test("registry payload: Order Equipment, 1 energy, no power cost, Might bonus exactly 0, one [Equip] keyword ability costing [order]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "order", energyCost: 1, mightBonus: 0, name: "Eye of the Herald" });
    expect(def?.powerCost ?? []).toEqual([]);
    // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "When I move, play a 1 [Might] Recruit unit token here." —
    // conferred on the equipped unit while attached, hence the `effectText: true` entries.
    expect(def?.abilities).toEqual([
      { cost: { power: ["order"] }, keyword: "Equip", type: "keyword" },
      { effect: { location: "here", token: { might: 1, name: "Recruit", type: "unit" }, type: "create-token" }, effectText: true, trigger: { event: "move", on: "self" }, type: "triggered" },
    ] as never);
  });

  test("play cost: exactly 1 energy (order power can't pay it), no chain item, READY and unattached in base; 0 energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 1, power: { order: 1 } }).unit(P1, "base", { might: 3, name: "Knight" }, "knight").hand(P1, CARD, "eye").build();
    await game.p1.play("eye");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("eye")).toMatchObject({ attachedTo: undefined, isReady: true, zone: "base" });
    expect(game.state("knight")).toMatchObject({ attachments: [], might: 3 });
    expect((await scenario().resources(P1, { energy: 0, power: { order: 3 } }).hand(P1, CARD, "e").build()).p1.can("play", "e")).toBe(false);
  });

  test("[Equip] [order]: pays exactly the order power, waits on the chain (P2 may respond), then attaches — the Knight is EQUIPPED yet still exactly 3 Might (+0)", async () => {
    const game = await onBoard({ energy: 1, power: { fury: 1, order: 1 } }).build();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "eye", unitId: "knight" } });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "eye", controller: P1 })]);
    expect(game.state("eye").attachedTo).toBeUndefined();
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.state("eye").attachedTo).toBe("knight");
    expect(game.state("knight")).toMatchObject({ attachments: ["eye"], baseMight: 3, might: 3, staticMightBonus: 0 });
    expect(game.violations()).toEqual([]);
  });

  test("Equip cost negative space: energy, fury power or nothing cannot pay [order] — never offered, forced attempts rejected, nothing spent", async () => {
    for (const pool of [{ energy: 4 }, { power: { fury: 2 } }, {}]) {
      const game = await onBoard(pool).build();
      expect(pairs(game)).toEqual([]);
      expect((await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "eye", unitId: "knight" } }))).ok).toBe(false);
      expect(game.state("eye").attachedTo).toBeUndefined();
    }
  });

  test("targets 'a unit you control': only the Knight is offered — the enemy Guard is rejected and the power stays", async () => {
    const game = await onBoard().build();
    expect(pairs(game)).toEqual(["eye->knight"]);
    expect((await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "eye", unitId: "guard" } }))).ok).toBe(false);
    expect(game.p1.power("order")).toBe(1);
    expect(game.state("guard").attachments).toEqual([]);
  });

  test("timing (151.2): nothing on the opponent's turn, nothing inside a showdown, nothing while already attached (718.2)", async () => {
    expect(pairs(await onBoard().active(P2).build())).toEqual([]);
    const sd = await onBoard().unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await sd.p1.move("scout", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(pairs(sd)).toEqual([]);
    const worn = await onBoard({ power: { order: 2 } }).unit(P1, "base", { might: 2, name: "Page" }, "page").build();
    await equip(worn, "knight");
    expect(worn.p1.power("order")).toBe(1);
    expect(pairs(worn)).toEqual([]);
  });

  test("Effect Text 'When I move, play a 1 [Might] Recruit unit token here': the equipped Knight's move raises ITS trigger; the Recruit lands at bf1 and joins the attack, so 3+1 into the 3-Might Guard conquers; the +0 Knight still dies and the Eye is recalled to base unattached (457.1)", async () => {
    const game = await onBoard().build();
    await equip(game);
    await game.p1.move("knight", "bf1");
    expect(game.locationOf("eye")).toBe("bf1");
    expect(game.state("knight").might).toBe(3); // +0
    // rule 150.2 / 718.3: the trigger's source is the wearer, not the gear. While it is Pending the
    // contested battlefield stays Staged (401.1) — no showdown, no combat roles yet.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "knight", controller: P1, triggered: true })]);
    expect(game.state("knight").meta.combatRole ?? null).toBeNull();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const [recruit] = game.findAll({ name: "Recruit", owner: P1 });
    expect(recruit).toBeDefined();
    expect(game.locationOf(recruit!)).toBe("bf1"); // "here" = where the wearer moved to
    expect(game.state("knight")).toMatchObject({ combatRole: "attacker", might: 3 });
    expect(game.state(recruit!)).toMatchObject({ combatRole: "attacker", might: 1 });
    await game.settle();
    expect(game.zoneOf("knight")).toBe("trash"); // takes 3 ≥ 3
    expect(game.zoneOf("guard")).toBe("trash"); // takes 3 + 1
    expect(game.zoneOf(recruit!)).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("eye")).toBe("base");
    expect(game.state("eye")).toMatchObject({ attachedTo: undefined, controller: P1, owner: P1 });
    expect(game.p1.points()).toBe(1); // the surviving Recruit conquers
    // Unattached, the Eye confers nothing: a bare Knight's move raises no trigger and mints no token.
    const bare = await onBoard().build();
    await bare.p1.move("knight", "bf1");
    expect(bare.chain()).toEqual([]);
    expect(bare.findAll({ name: "Recruit", owner: P1 })).toEqual([]);
  });

  test("718.5.a/b — a worn Eye is still a gear on the board: the opponent's 'kill a gear' picks it off the Knight, who stays a bare 3", async () => {
    const game = await onBoard().resources(P2, { energy: 0 }).hand(P2, SMASH, "smash").build();
    await equip(game);
    await game.advanceTurn();
    const targets = game.p2.option("cast", "smash")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["eye"]]);
    await game.p2.cast("smash", { targets: "eye" });
    await game.settle();
    expect(game.zoneOf("eye")).toBe("trash");
    expect(game.state("knight")).toMatchObject({ attachments: [], might: 3, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("it is an 'Equipment you control' loose OR worn: Arise! with one loose Eye and one worn Eye plays exactly two Sand Soldiers", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { order: 1 } })
      .unit(P1, "base", { might: 3, name: "Bearer" }, "bearer", { equippedWith: ["worn"] })
      .gear(P1, CARD, "worn", { attachedTo: "bearer" })
      .gear(P1, CARD, "loose")
      .gear(P2, CARD, "theirs")
      .hand(P1, ARISE, "arise")
      .build();
    expect(game.state("bearer")).toMatchObject({ attachments: ["worn"], might: 3 });
    await game.p1.cast("arise");
    await game.settle({ policy: "first" });
    const soldiers = game.findAll({ name: "Sand Soldier", owner: P1 }).filter((id) => game.locationOf(id) !== undefined);
    expect(soldiers).toHaveLength(2);
    expect(game.findAll({ name: "Sand Soldier", owner: P2 })).toHaveLength(0);
  });

  test("partner — Emperor of the Sands is LOCKED until an Equipment was played this turn: with the Eye still in hand (or played on an earlier turn) the ability must not be offered", async () => {
    // Expected: "Use only if you've played an Equipment this turn" — not activatable before the Eye is
    // played, and not on a later turn when the Eye merely sits in base. Actual: the parsed restriction
    // `played-equipment-this-turn` is never checked; the ability is always offered.
    const game = await scenario().resources(P1, { energy: 2 }).legend(P1, EMPEROR, "azir").hand(P1, CARD, "eye").build();
    expect(game.p1.can("activate", "azir")).toBe(false);
    await game.p1.play("eye");
    await game.settle();
    expect(game.p1.can("activate", "azir")).toBe(true);
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.do("addResources", { energy: 1 });
    expect(game.state("azir").isReady).toBe(true);
    expect(game.p1.can("activate", "azir")).toBe(false);
  });

  test("partner — Emperor of the Sands: after playing the 1-cost Eye this turn, [1],[Exhaust] makes a 2-Might Sand Soldier in base (1 + 1 energy total)", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).legend(P1, EMPEROR, "azir").hand(P1, CARD, "eye").build();
    await game.p1.play("eye");
    await game.settle();
    expect(game.zoneOf("eye")).toBe("base");
    expect(game.p1.can("activate", "azir")).toBe(true);
    await game.p1.activate("azir");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("azir").isExhausted).toBe(true);
    await game.settle({ policy: "first" }); // a Weaponmaster offer for the token (if any) is simply taken/declined
    const soldiers = game.findAll({ name: "Sand Soldier", owner: P1 }).filter((id) => game.locationOf(id) === "base");
    expect(soldiers).toHaveLength(1);
    expect(game.state(soldiers[0] as string).might).toBe(2); // even if Weaponmaster hung the Eye on it: +0
  });
});
