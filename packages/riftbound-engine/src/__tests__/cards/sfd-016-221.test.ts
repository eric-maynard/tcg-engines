/**
 * Recurve Bow — sfd-016-221 · Gear (Equipment) · Fury · 2 energy · Might bonus +0
 *
 *   [Equip] [fury] ([fury]: Attach this to a unit you control.)
 *   Effect Text: When I attack or defend, deal 2 to an enemy unit here.
 *
 * Rules: 136 / 150.2 / 718.3 (the Effect Text is appended to the WEARER while attached: "I" is the
 * equipped unit, so its attack/defend raises the trigger, sourced from the unit), 149.1 (gear enters ready), 818 (Equip = "[fury]: Attach this gear to a unit you control", a
 * targeted activated ability), 434.4 (attaching relocates the gear to the wearer's location — not a
 * Move), 718.2/718.4 (attached: rules text inactive, Might bonus applies — here +0), 719.3.a (rides
 * along with the wearer), 719.5 + 457.1 (wearer leaves the board → detaches in place, recalled to base
 * at the next Cleanup), 135.2.e.5.b (pooled [rainbow] pays a [fury] pip), gear activated abilities:
 * controller's turn, open state, never in a showdown.
 *
 * Head-judge checklist for THIS card:
 *  1. Two costs: [2] to PLAY it (never attaches), [fury] to EQUIP it (never energy). Mind power can't
 *     pay [fury]; pooled rainbow can.
 *  2. +0 Might bonus: the wearer's Might is unchanged, yet it IS "equipped" (attachments list) — that
 *     status is what Strike Down / Purifier key off. Purifier ("Your Equipment each give [Assault]")
 *     is the natural reason to run a +0 bow.
 *  3. Only "a unit you control": enemy units never offered; a friendly unit at a battlefield is fine
 *     and the Bow relocates there without opening a showdown.
 *  4. Timing: not on the opponent's turn, not with Focus in a showdown; not re-activatable while
 *     attached (inactive text).
 *  5. Wearer dies in combat → Bow survives, detaches, is recalled to base and can be equipped again.
 *  6. Partners: Sentinel Adept's Weaponmaster takes it for [fury]−[rainbow] = free; Rell, Magnetic
 *     ("Equipment with Energy cost no more than [2]") plays it from hand for free on attack — 2 is
 *     exactly the cap; Angle Shot attaches it by spell without paying [fury].
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-016-221";
const SENTINEL_ADEPT = "sfd-008-221"; // Fury unit · 3 · 3 Might · [Weaponmaster]
const RELL = "sfd-024-221"; // Fury champion · 4 · 4 Might · [Tank] When I attack, you may play an Equipment (energy ≤ 2) ignoring its cost, attach it to me.
const ANGLE_SHOT = "sfd-011-221"; // Fury spell · [Reaction] · 2 · attach/detach an Equipment to/from a same-controller unit. Draw 1.
const PURIFIER = "sfd-183-221"; // Legend (Lucian) · Your Equipment each give [Assault].

async function equip(game: Game, unitId: string): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "bow", unitId } });
  await game.settle();
}

describe("Recurve Bow (sfd-016-221)", () => {
  test("registry payload: Fury equipment, 2 energy, no power to play, +0 Might bonus, exactly one [Equip] keyword ability costed [fury]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "fury", energyCost: 2, mightBonus: 0, name: "Recurve Bow" });
    expect(def?.powerCost ?? []).toEqual([]);
    // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "When I attack or defend, deal 2 to an enemy unit here." —
    // conferred on the equipped unit while attached, hence the `effectText: true` entries.
    expect(def?.abilities).toEqual([
      { cost: { power: ["fury"] }, keyword: "Equip", type: "keyword" },
      { effect: { amount: 2, target: { controller: "enemy", location: "here", type: "unit" }, type: "damage" }, effectText: true, trigger: { event: "attack-or-defend", on: "self" }, type: "triggered" },
    ] as never);
  });

  test("play: costs exactly 2 energy (no power), lands in base READY and unattached; 1 energy + lots of fury is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "bow").build();
    await game.p1.play("bow");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("bow")).toBe("base");
    expect(game.p1.gear()).toEqual(["bow"]);
    expect(game.state("bow")).toMatchObject({ attachedTo: undefined, isReady: true, keywords: ["Equip"] });
    expect(game.state("ally").attachments).toEqual([]);
    expect(game.p1.can("equipCard")).toBe(false); // no [fury] floating
    const poor = await scenario().resources(P1, { energy: 1, power: { fury: 3 } }).hand(P1, CARD, "bow").build();
    expect(poor.p1.can("play", "bow")).toBe(false);
  });

  test("[Equip] [fury]: spends one fury (energy untouched), attaches to the chosen friendly unit; +0 bonus → Might unchanged but the unit is equipped", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "bow").build();
    expect(game.p1.can("equipCard")).toBe(true);
    await equip(game, "ally");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 0 } });
    expect(game.state("bow").attachedTo).toBe("ally");
    expect(game.state("ally")).toMatchObject({ attachments: ["bow"], baseMight: 2, might: 2 });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("cost domain: mind power or plain energy cannot pay [fury]; pooled [rainbow] power can (135.2.e.5.b)", async () => {
    const mind = await scenario().resources(P1, { energy: 5, power: { mind: 2 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "bow").build();
    expect(mind.p1.can("equipCard")).toBe(false);
    const rainbow = await scenario().resources(P1, { power: { rainbow: 1 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "bow").build();
    expect(rainbow.p1.can("equipCard")).toBe(true);
    await equip(rainbow, "ally");
    expect(rainbow.state("bow").attachedTo).toBe("ally");
    expect(rainbow.p1.power()).toBe(0);
  });

  test("'a unit you control': only friendly units are offered (base or battlefield); an enemy unit is rejected; no friendly unit → nothing to Equip", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2 }, "home")
      .unit(P1, "bf1", { might: 3 }, "afield")
      .unit(P2, "base", { might: 2 }, "enemy")
      .gear(P1, CARD, "bow")
      .build();
    const units = game.p1.option("equipCard")?.fields.find((f) => f.name === "unitId")?.options as string[] | undefined;
    expect([...(units ?? [])].toSorted()).toEqual(["afield", "home"]);
    expect((await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "bow", unitId: "enemy" } }))).ok).toBe(false);
    const lonely = await scenario().resources(P1, { power: { fury: 1 } }).unit(P2, "base", { might: 2 }, "enemy").gear(P1, CARD, "bow").build();
    expect(lonely.p1.can("equipCard")).toBe(false);
  });

  test("equipping a unit AT A BATTLEFIELD relocates the Bow there (434.4) — no move, no showdown, no chain left over", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "afield")
      .gear(P1, CARD, "bow")
      .build();
    await equip(game, "afield");
    expect(game.zoneOf("bow")).toBe("battlefield-bf1");
    expect(game.state("afield")).toMatchObject({ attachments: ["bow"], might: 3 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("rides along and survives the wearer: a 2-Might wearer dies into a 5-Might wall → Bow detaches, is recalled to base unattached, and re-equips for another [fury]", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Doomed" }, "doomed")
      .unit(P1, "base", { might: 2, name: "Heir" }, "heir")
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .gear(P1, CARD, "bow")
      .build();
    await equip(game, "doomed");
    await game.p1.move("doomed", "bf1");
    expect(game.zoneOf("bow")).toBe("battlefield-bf1"); // 719.3.a
    await game.settle();
    expect(game.zoneOf("doomed")).toBe("trash"); // took 5 ≥ 2 (+0 bonus did not help)
    expect(game.zoneOf("wall")).toBe("battlefield-bf1"); // took 2 < 5
    expect(game.zoneOf("bow")).toBe("base");
    expect(game.state("bow").attachedTo).toBeUndefined();
    await equip(game, "heir");
    expect(game.state("bow").attachedTo).toBe("heir");
    expect(game.p1.power("fury")).toBe(0);
  });

  test("timing: no Equip on the opponent's turn, none with Focus in a showdown, and none while already attached (718.2)", async () => {
    const opp = await scenario().active(P2).resources(P1, { power: { fury: 1 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "bow").build();
    expect(opp.p1.legal().some((o) => o.moveId === "equipCard")).toBe(false);

    const game = await scenario()
      .resources(P1, { power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "attacker")
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 3 }, "def")
      .gear(P1, CARD, "bow")
      .build();
    await equip(game, "ally");
    expect(game.p1.can("equipCard")).toBe(false); // attached → inactive, cannot hop to "attacker"
    expect((await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "bow", unitId: "attacker" } }))).ok).toBe(false);

    const sd = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "attacker")
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "bf1", { might: 3 }, "def")
      .gear(P1, CARD, "bow")
      .build();
    expect(sd.p1.can("equipCard")).toBe(true);
    await sd.p1.move("attacker", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("equipCard")).toBe(false);
  });

  test("Weaponmaster (Sentinel Adept): may take the Bow on play for [fury] − [rainbow] = nothing; Adept stays 3 Might but is equipped", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).gear(P1, CARD, "bow").hand(P1, SENTINEL_ADEPT, "adept").build();
    await game.p1.play("adept");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.pick("bow");
    await game.settle();
    expect(game.state("bow").attachedTo).toBe("adept");
    expect(game.state("adept")).toMatchObject({ attachments: ["bow"], might: 3 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("Rell, Magnetic: 'Equipment with Energy cost no more than [2]' — the 2-cost Bow is played from hand for free on attack and attached to Rell at the battlefield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .unit(P1, "base", RELL, "rell")
      .hand(P1, CARD, "bow")
      .build();
    await game.p1.move("rell", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rell", triggered: true })]);
    expect((await game.settle()).reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    for (let i = 0; i < 4; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || d?.kind !== "pick" || d.seat !== P1) {
        break;
      }
      await game.p1.pick("bow");
    }
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("bow").attachedTo).toBe("rell");
    expect(game.zoneOf("bow")).toBe("battlefield-bf1");
    expect(game.zoneOf("foe")).toBe("trash"); // 4 ≥ 3
    expect(game.locationOf("rell")).toBe("bf1"); // 3 < 4
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Angle Shot attaches the Bow by spell — no [fury] paid, Equip never activated; then draw 1", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "bow").hand(P1, ANGLE_SHOT, "shot").build();
    await game.p1.cast("shot", { targets: ["ally", "bow"] });
    await game.settle({ policy: "first" });
    expect(game.state("bow").attachedTo).toBe("ally");
    expect(game.state("ally")).toMatchObject({ attachments: ["bow"], might: 2 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.zoneOf("shot")).toBe("trash");
  });

  test("Purifier ('Your Equipment each give [Assault]') should make the +0 Bow's WEARER attack at +1 (818.3 / 718.3) — a 3-Might wearer trades into a 6-Might defender already hit for 2 by the Bow's own trigger", async () => {
    // The Bow's effect text deals 2 to the Brute when the Archer attacks (6 − 2 → needs 4 more).
    // With Purifier: 3 (printed) + 0 (bonus) + 1 (Assault while attacking) = 4 → the Brute dies; the wearer takes 6 ≥ 3 and dies too.
    // Without the legend the same fight leaves the Brute alive on 2 + 3 = 5 damage.
    const build = (withLegend: boolean) => {
      const b = scenario()
        .resources(P1, { power: { fury: 1 } })
        .battlefield("bf1", { controller: P2 })
        .unit(P1, "base", { might: 3, name: "Archer" }, "archer")
        .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
        .gear(P1, CARD, "bow");
      return withLegend ? b.legend(P1, PURIFIER, "purifier") : b;
    };
    const plain = await build(false).build();
    await equip(plain, "archer");
    await plain.p1.move("archer", "bf1");
    await plain.settle();
    expect(plain.zoneOf("brute")).toBe("battlefield-bf1");
    expect(plain.zoneOf("archer")).toBe("trash");

    const game = await build(true).build();
    await equip(game, "archer");
    expect(game.state("archer").might).toBe(3); // Assault only counts while attacking
    await game.p1.move("archer", "bf1");
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("archer")).toBe("trash");
    expect(game.zoneOf("bow")).toBe("base"); // recalled after the wearer died
  });

  test("Effect Text — 'When I attack or defend, deal 2 to an enemy unit here': the WEARER's attack raises its trigger, targeting an enemy at that battlefield, before combat damage (150.2 / 718.3)", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Archer" }, "archer")
      .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
      .unit(P2, "base", { might: 1, name: "Camper" }, "camper") // not "here" — never a target
      .gear(P1, CARD, "bow")
      .build();
    await equip(game, "archer");
    await game.p1.move("archer", "bf1");
    // One triggered item sourced from the wearer, auto-bound to the only enemy unit here.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "archer", controller: P1, targets: ["brute"], triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("brute").damage).toBe(2);
    expect(game.state("camper").damage).toBe(0);
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash"); // 2 + 3 ≥ 4
    expect(game.zoneOf("archer")).toBe("trash"); // takes 4 ≥ 3
    expect(game.zoneOf("bow")).toBe("base");
  });

  test("Effect Text — the WEARER defending raises it too: the attacker takes 2 before combat", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Archer" }, "archer")
      .unit(P2, "base", { might: 4, name: "Brute" }, "brute")
      .gear(P1, CARD, "bow")
      .build();
    await equip(game, "archer");
    await game.advanceTurn();
    await game.p2.move("brute", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "archer", controller: P1, targets: ["brute"], triggered: true })]);
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash"); // 2 + 3 ≥ 4
    expect(game.zoneOf("archer")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P2);
  });

  test("unattached, the Bow confers nothing: a bare attacker raises no trigger", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Archer" }, "archer")
      .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
      .gear(P1, CARD, "bow")
      .build();
    await game.p1.move("archer", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("brute")).toBe("battlefield-bf1"); // only 3 damage
  });
});
