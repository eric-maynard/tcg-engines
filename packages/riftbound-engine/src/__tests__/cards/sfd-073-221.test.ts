/**
 * Experimental Hexplate — sfd-073-221 · Gear (Equipment) · Mind · 1 energy (no power) · +1 Might bonus
 *
 *   [Equip] [mind] ([mind]: Attach this to a unit you control.)
 *
 * Rules: 818 (Equip is an ACTIVATED ability of the gear: "[Cost]: Attach this to a unit you control";
 * 818.1.b.1 the unit is a target), 151.2 (a gear's activated ability: your Main Phase, Open State, no
 * showdown), 377.3 (activated abilities use the chain — pay first, attach on resolution), 434/716–719
 * (attachment: the Might Bonus modulates the Top-Most card while attached; the attached card shares its
 * location; 718.2/721.2 an ATTACHED card's rules text — its own [Equip] — is Inactive), 818.3.b (a unit
 * may carry "one or more" Equipment), 719.5/457.1 (holder leaves the board → Equipment detaches, stays
 * on the board, is recalled to base at the next Cleanup), 135.2.e.5.b (universal power pays any pip),
 * 355.8 (target gone on resolution → the attach does nothing).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Two separate costs: PLAY is 1 energy / no power; EQUIP is one [mind] / no energy. Fury power
 *     never pays the [mind] pip, universal ([rainbow]) power does.
 *  2. Equip is a chain item: after activation the pip is gone but nothing is attached; P2 may respond,
 *     and if the target dies in response the Hexplate simply stays in base, cost not refunded.
 *  3. "a unit you control": enemy units are never legal; with no friendly unit the ability is absent.
 *  4. Attached → its [Equip] is Inactive (cannot hop to another unit by re-activating), but a SECOND
 *     Hexplate can stack onto the same unit (+2 total).
 *  5. Holder dies in combat → Hexplate survives unattached in P1's base and can be equipped again
 *     (paying [mind] again).
 *  6. Partners (Mind): Gearhead doubles the BASE bonus (+2); Ornn's Weaponmaster equips it for
 *     [rainbow] less = free, and Ornn counts it as a friendly gear (+1) on top of the bonus (+1).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-073-221";
const GEARHEAD = "sfd-068-221"; // 3 Might · Each Equipment attached to me gives double its base Might bonus
const ORNN = "sfd-085-221"; // 4 Might · Deflect 2 · Weaponmaster · +1 Might per friendly gear
const BOLT3 = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Reaction Bolt",
  rulesText: "[Reaction] Deal 3 to a unit.",
  timing: "reaction",
};

/** P1's turn: Hexplate in base (unattached), a 2-Might Squire, an enemy 2-Might Pawn, `power` in pool. */
function board(power: Record<string, number> = { mind: 1 }) {
  return scenario()
    .resources(P1, { energy: 0, power })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "bf1", { might: 2, name: "Pawn" }, "pawn")
    .gear(P1, CARD, "hex");
}

const equipOption = (game: Game) => game.p1.legal().find((o) => o.moveId === "equipCard");
const equipUnits = (game: Game) => (equipOption(game)?.fields.find((f) => f.name === "unitId")?.options ?? []) as string[];

async function equip(game: Game, unitId: string, equipmentId = "hex"): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId, unitId } });
}

describe("Experimental Hexplate (sfd-073-221)", () => {
  test("registry payload: 1-cost Mind equipment, +1 bonus, exactly one ability — the [Equip] keyword costed one [mind] pip and no energy", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "mind", energyCost: 1, mightBonus: 1, name: "Experimental Hexplate" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([{ cost: { power: ["mind"] }, keyword: "Equip", type: "keyword" }]);
  });

  test("PLAY cost: 1 energy and no power; it lands in base as an unattached, ready gear carrying the Equip keyword; 0 energy (even with mind power) cannot play it; not on the opponent's turn", async () => {
    const game = await scenario().resources(P1, { energy: 1, power: { mind: 1 } }).unit(P1, "base", { might: 2 }, "squire").hand(P1, CARD, "hex").build();
    await game.p1.play("hex");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    await game.settle();
    expect(game.zoneOf("hex")).toBe("base");
    expect(game.p1.gear()).toEqual(["hex"]);
    expect(game.state("hex")).toMatchObject({ attachedTo: undefined, cardType: "equipment", isReady: true });
    expect(game.state("hex").keywords).toContain("Equip");
    expect(game.state("squire").might).toBe(2); // merely owning it does nothing
    const broke = await scenario().resources(P1, { energy: 0, power: { mind: 3 } }).hand(P1, CARD, "hex").build();
    expect(broke.p1.can("play", "hex")).toBe(false);
    const oppTurn = await scenario().active(P2).resources(P1, { energy: 1 }).hand(P1, CARD, "hex").build();
    expect(oppTurn.p1.can("play", "hex")).toBe(false);
  });

  test("EQUIP: pays exactly one [mind] (energy untouched), goes on the chain unattached, P2 gets priority, then attaches on resolution — Squire 2 → 3, Hexplate reports attachedTo/attachments", async () => {
    const game = await board({ mind: 2 }).resources(P1, { energy: 3 }).build();
    await equip(game, "squire");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { mind: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hex", controller: P1, triggered: false })]);
    expect(game.state("hex").attachedTo).toBeUndefined();
    expect(game.state("squire").might).toBe(2);
    await game.p1.pass();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.pass();
    expect(game.state("hex")).toMatchObject({ attachedTo: "squire", zone: "base" });
    expect(game.state("squire")).toMatchObject({ attachments: ["hex"], baseMight: 2, isBuffed: false, might: 3 });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the [mind] pip: fury power cannot pay it (ability absent), no power at all cannot, but one universal [rainbow] power can (135.2.e.5.b) and is spent", async () => {
    expect(equipOption(await board({ fury: 2 }).build())).toBeUndefined();
    expect(equipOption(await board({}).resources(P1, { energy: 5 }).build())).toBeUndefined();
    const rainbow = await board({ rainbow: 1 }).build();
    expect(equipOption(rainbow)).toBeDefined();
    await equip(rainbow, "squire");
    expect(rainbow.p1.power()).toBe(0);
    await rainbow.settle();
    expect(rainbow.state("squire").might).toBe(3);
  });

  test("'a unit you control': the enemy Pawn is never a legal holder; with no friendly unit on the board the ability is not offered at all", async () => {
    const game = await board().build();
    expect(equipUnits(game)).toEqual(["squire"]);
    const r = await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "hex", unitId: "pawn" } }));
    expect(r.ok).toBe(false);
    expect(game.p1.power("mind")).toBe(1);
    const lonely = await scenario().resources(P1, { power: { mind: 1 } }).unit(P2, "base", { might: 2 }, "pawn").gear(P1, CARD, "hex").build();
    expect(equipOption(lonely)).toBeUndefined();
  });

  test("timing (151.2): not on the opponent's turn, not during a showdown, not while a chain is open — legal again once the chain resolves", async () => {
    expect(equipOption(await board().active(P2).build())).toBeUndefined();
    const sd = await board().battlefield("open", { controller: null }).unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await sd.p1.move("scout", "open");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(equipOption(sd)).toBeUndefined();
    const chain = await board().resources(P1, { energy: 1 }).hand(P1, BOLT3, "bolt").build();
    await chain.p1.cast("bolt", { targets: "pawn" });
    expect(chain.chain()).toHaveLength(1);
    expect(equipOption(chain)).toBeUndefined();
    await chain.settle();
    expect(equipOption(chain)).toBeDefined();
  });

  test("355.8 — P2 kills the Squire in response: the Equip item resolves into nothing, the Hexplate stays unattached in base and the [mind] is not refunded", async () => {
    const game = await board().resources(P2, { energy: 1 }).hand(P2, BOLT3, "bolt").build();
    await equip(game, "squire");
    await game.p1.pass();
    await game.p2.cast("bolt", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.state("hex")).toMatchObject({ attachedTo: undefined, controller: P1, zone: "base" });
    expect(game.p1.power("mind")).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("while attached its own [Equip] is Inactive (718.2/721.2) — no re-equip offer for it — but a SECOND Hexplate stacks onto the same Squire for +2 total (818.3.b)", async () => {
    const game = await scenario()
      .resources(P1, { power: { mind: 2 } })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["hex"] })
      .unit(P1, "base", { might: 1, name: "Page" }, "page")
      .gear(P1, CARD, "hex", { attachedTo: "squire" })
      .gear(P1, CARD, "hex2")
      .build();
    expect(game.state("squire").might).toBe(3);
    const ids = (equipOption(game)?.fields.find((f) => f.name === "equipmentId")?.options ?? []) as string[];
    expect(ids).toEqual(["hex2"]); // the attached one is not activatable
    await equip(game, "squire", "hex2");
    await game.settle();
    expect(game.state("squire").attachments.sort()).toEqual(["hex", "hex2"]);
    expect(game.state("squire").might).toBe(4);
    expect(game.state("page").might).toBe(1);
    expect(equipOption(game)).toBeUndefined(); // both attached now (and no mind left anyway)
  });

  test("rides along into combat and survives its holder: equipped Squire (3) attacks a 6-Might Wall and dies; the Hexplate detaches, is recalled to P1's base unattached (457.1) and can be equipped again next turn for another [mind]", async () => {
    const game = await scenario()
      .resources(P1, { power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["hex"] })
      .unit(P1, "base", { might: 2, name: "Backup" }, "backup", { exhausted: true })
      .gear(P1, CARD, "hex", { attachedTo: "squire" })
      .build();
    await game.p1.move("squire", "bf1");
    expect(game.locationOf("hex")).toBe("bf1"); // 719.3: shares the holder's location
    expect(game.state("squire").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.state("hex")).toMatchObject({ attachedTo: undefined, controller: P1, owner: P1, zone: "base" });
    expect(game.p1.gear()).toEqual(["hex"]);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { power: { mind: 1 } });
    expect(equipUnits(game)).toEqual(["backup"]);
    await equip(game, "backup");
    await game.settle();
    expect(game.state("backup")).toMatchObject({ attachments: ["hex"], might: 3 });
  });

  test("the bonus is real combat Might: an equipped 2-Might Squire (3) attacking a 2-Might Pawn kills it, survives (2 < 3) and conquers", async () => {
    const game = await board().build();
    await equip(game, "squire");
    await game.settle();
    // Squire is ready (scenario units start ready) → walk in.
    await game.p1.move("squire", "bf1");
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.state("squire")).toMatchObject({ damage: 0, might: 3, zone: "battlefield-bf1" });
    expect(game.locationOf("hex")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("partner — Gearhead doubles the BASE bonus: Hexplate on Gearhead gives +2 (3 → 5), while the same plate on a vanilla unit gives +1", async () => {
    const game = await scenario().resources(P1, { power: { mind: 1 } }).unit(P1, "base", GEARHEAD, "gearhead").gear(P1, CARD, "hex").build();
    await equip(game, "gearhead");
    await game.settle();
    expect(game.state("gearhead")).toMatchObject({ attachments: ["hex"], might: 5 });
  });

  test("partner — Ornn, Forge God: Weaponmaster equips the Hexplate for [rainbow] less (= free, no mind needed); Ornn ends at 6 = 4 + 1 (a friendly gear) + 1 (the bonus)", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).gear(P1, CARD, "hex").hand(P1, ORNN, "ornn").build();
    expect(game.p1.power()).toBe(0);
    await game.p1.play("ornn");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("hex");
    await game.settle();
    expect(game.state("hex").attachedTo).toBe("ornn");
    expect(game.state("ornn").might).toBe(6);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });
});
