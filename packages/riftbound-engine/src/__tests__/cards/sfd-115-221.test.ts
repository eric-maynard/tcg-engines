/**
 * Trinity Force — sfd-115-221 · Gear (Equipment) · Body · 4 energy · Might bonus +2
 *
 *   [Equip] [body] ([body]: Attach this to a unit you control.)
 *
 * Rules: 818 (Equip = activated ability of the gear, [body] to attach to a unit you control, target
 * chosen on activation, attach on resolution), 151.2 (activated abilities only in your Main Phase in an
 * OPEN state — not while a chain is pending, not in a showdown), 137.3 / 718.4 (+2 only while
 * attached), 709/710 (a 3-Might unit wearing it is [Mighty]), 719.3 / 434.4 (the Force travels with
 * its wearer), 719.5 (wearer leaves the board → the Force detaches and stays on the board), 821
 * (Weaponmaster: attach for [rainbow] less — a [body]-only Equip becomes free), 807 (Assault via the
 * Lucian legend Purifier, sfd-183-221: "Your Equipment each give [Assault]").
 *
 * Head-judge checklist — trickiest situations for THIS card:
 *  1. Two prices: 4 energy to PLAY (nothing attached yet, no bonus to anyone), [body] to EQUIP.
 *  2. Closed state: with anything on the chain (even my own spell) [Equip] is not offered (151.2).
 *  3. The wearer bounced to hand (Retreat) does not take the Force with it: it detaches and stays in
 *     base, unattached, its +2 gone from everybody (719.5) — and it is NOT trashed.
 *  4. Real combat: 3 + 2 = 5 attacker beats a 4-Might defender and the Force is now AT that battlefield,
 *     still attached after combat.
 *  5. Partners: Gearhead doubles the base bonus (+4); Armed Assailant's Weaponmaster equips it for free;
 *     under Purifier the wearer attacks with an extra +1 (Assault) but defends without it.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-115-221";
const GEARHEAD = "sfd-068-221"; // 3 Might: "Each Equipment attached to me gives double its base Might bonus."
const ARMED_ASSAILANT = "sfd-002-221"; // 6 Might, [Weaponmaster]
const PURIFIER = "sfd-183-221"; // Legend: "Your Equipment each give [Assault]."
const RETREAT = "ogn-104-298"; // [Reaction] 1: return a friendly unit to its owner's hand; its owner channels 1 rune exhausted
const SLOW_SPELL = { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", domain: "body", energyCost: 1, name: "Warm-Up", timing: "action" } as const;

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Brawler" }, "brawler")
    .unit(P2, "bf1", { might: 4, name: "Warden" }, "warden")
    .gear(P1, CARD, "tf");
}

const equipTargets = (game: Game, equipment = "tf") =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants)
    .filter((v) => v.params.equipmentId === equipment)
    .map((v) => v.params.unitId as string);

async function equip(game: Game, unit: string, equipment = "tf"): Promise<void> {
  await game.p1.choose("equipCard", { params: { equipmentId: equipment, unitId: unit } });
  await game.settle();
}

describe("Trinity Force (sfd-115-221)", () => {
  test("registry payload: Body Equipment, 4 energy, +2 Might bonus, one [Equip] keyword costing exactly [body]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "body", energyCost: 4, mightBonus: 2, name: "Trinity Force" });
    expect(def?.abilities).toEqual([{ cost: { power: ["body"] }, keyword: "Equip", type: "keyword" }]);
  });

  test("playing it costs exactly 4 energy (no power) and attaches to nothing; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { body: 1 } }).unit(P1, "base", { might: 3 }, "brawler").hand(P1, CARD, "tf").build();
    await game.p1.play("tf");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 1 } });
    expect(game.zoneOf("tf")).toBe("base");
    expect(game.state("tf").attachedTo).toBeUndefined();
    expect(game.state("brawler").might).toBe(3);
    const short = await scenario().resources(P1, { energy: 3, power: { body: 2 } }).hand(P1, CARD, "tf").build();
    expect(short.p1.can("play", "tf")).toBe(false);
  });

  test("[Equip] [body]: one body paid, energy untouched; on resolution the Brawler wears it as a Mighty 5 (3 + 2)", async () => {
    const game = await board().build();
    expect(equipTargets(game)).toEqual(["brawler"]); // the enemy Warden is never offered
    await game.p1.choose("equipCard", { params: { equipmentId: "tf", unitId: "brawler" } });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { body: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tf", controller: P1 })]);
    await game.settle();
    expect(game.state("tf").attachedTo).toBe("brawler");
    expect(game.state("brawler")).toMatchObject({ attachments: ["tf"], baseMight: 3, might: 5 });
  });

  test("no body power → not equippable, even with plenty of energy and other power", async () => {
    const game = await board().resources(P1, { energy: 9, power: { body: 0, fury: 3 } }).build();
    expect(equipTargets(game)).toEqual([]);
    expect((await game.p1.try((p) => p.choose("equipCard", { params: { equipmentId: "tf", unitId: "brawler" } }))).ok).toBe(false);
  });

  test("closed state (151.2): while my own spell sits on the chain [Equip] is not offered; once it resolves it is", async () => {
    const game = await board().hand(P1, SLOW_SPELL, "warmup").build();
    await game.p1.cast("warmup");
    expect(game.chain()).toHaveLength(1);
    expect(equipTargets(game)).toEqual([]);
    await game.settle();
    expect(equipTargets(game)).toEqual(["brawler"]);
  });

  test("combat: the 5-Might wearer attacks the 4-Might Warden, kills it, survives and conquers; the Force went along and is still attached at bf1", async () => {
    const game = await board().build();
    await equip(game, "brawler");
    await game.p1.move("brawler", "bf1");
    expect(game.state("brawler")).toMatchObject({ combatRole: "attacker", might: 5 });
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.locationOf("brawler")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("tf").attachedTo).toBe("brawler");
    expect(game.locationOf("tf")).toBe("bf1");
    expect(game.state("brawler").might).toBe(5);
  });

  test("wearer returned to hand (Retreat): the Force detaches and stays in base unattached — not in hand, not in trash (719.5)", async () => {
    const game = await board().resources(P1, { energy: 5, power: { body: 1 } }).hand(P1, RETREAT, "retreat").build();
    await equip(game, "brawler");
    expect(game.state("brawler").might).toBe(5);
    await game.p1.cast("retreat", { targets: "brawler" });
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("hand");
    expect(game.zoneOf("tf")).toBe("base");
    expect(game.state("tf")).toMatchObject({ attachedTo: undefined, controller: P1, zone: "base" });
    expect(game.state("brawler").attachments).toEqual([]);
  });

  test("partner — Gearhead doubles the base bonus: 3 + 2×2 = 7", async () => {
    const game = await board().unit(P1, "base", GEARHEAD, "gearhead").build();
    expect(equipTargets(game).sort()).toEqual(["brawler", "gearhead"]);
    await equip(game, "gearhead");
    expect(game.state("gearhead").might).toBe(7);
    expect(game.state("brawler").might).toBe(3);
  });

  test("partner — Armed Assailant's Weaponmaster equips the Force for [rainbow] less: [body] − 1 = free → 6 + 2 = 8, body power kept", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { body: 1, fury: 1 } }).gear(P1, CARD, "tf").hand(P1, ARMED_ASSAILANT, "aa").build();
    await game.p1.play("aa");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["tf"]);
    await game.p1.pick("tf");
    await game.settle();
    expect(game.state("tf").attachedTo).toBe("aa");
    expect(game.state("aa").might).toBe(8);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1, fury: 0 } });
  });

  test("partner — under Purifier (sfd-183-221) the Force gives [Assault]: the wearer attacks at 3 + 2 + 1 = 6", async () => {
    // Expected: Purifier makes each of my Equipment grant Assault to its wearer → +1 while attacking (807.1.c).
    // Actual: the static grants "Assault" to the Equipment card itself and never reaches the equipped unit (attacks at 5).
    const game = await board().legend(P1, PURIFIER, "lucian").build();
    await equip(game, "brawler");
    expect(game.state("brawler").might).toBe(5); // not attacking yet: no Assault bonus
    await game.p1.move("brawler", "bf1");
    expect(game.state("brawler").combatRole).toBe("attacker");
    expect(game.state("brawler").might).toBe(6);
  });
});
