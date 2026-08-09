/**
 * Blighted Battleaxe — unl-019-219 · Gear (Equipment) · Fury · 4 energy (no power) · Might bonus +4
 *
 *   [Equip] [1][fury] ([1][fury]: Attach this to a unit you control.)
 *
 * Rules: 818 (Equip: activated gear ability "[cost]: Attach this to a unit you control" — chain item,
 * target = a unit you control), 137.3 (bonus only while attached), 149.1 (gear enters the base ready),
 * 151.2 (gear abilities: your Main Phase, Open State, not in a Showdown), 718.2 (attached → own Equip
 * inactive), 457.1 (loose gear at a battlefield is recalled), 821 (Weaponmaster: Equip on play for
 * [rainbow] less — the [1] remains), 435 (Detach leaves the gear where the unit is).
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. Two costs, both with energy: [4] PLAYS it (nothing attaches); Equip is [1] energy AND one fury.
 *     4 energy exactly cannot play-then-equip the same turn; 5 + fury can. Calm power never pays [fury];
 *     a pooled [rainbow] does; energy alone never does.
 *  2. Weaponmaster (Sentinel Adept, 3): the discount eats the [fury] pip only — the leftover [1] must
 *     still be paid (3 + 1 = 4 energy total) and with exactly 3 energy the axe is NOT offered (821.1.c.5).
 *  3. Rell, Magnetic's free play is capped at Energy cost [2]: the 4-cost axe in hand is never eligible.
 *  4. +4 is huge and only while attached: 2+4 into a 5 wins; when the wearer dies the axe drops to base
 *     unattached (+4 gone) and re-equips for another [1][fury]. An enemy Angle Shot can DETACH it
 *     mid-showdown as counterplay, turning a won combat into a lost one.
 *  5. Negative space: enemy units never targets; no hop while attached; not on the opponent's turn;
 *     not inside a showdown; the Equip is a chain item the opponent may respond to before +4 lands.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-019-219";
const SENTINEL_ADEPT = "sfd-008-221"; // Fury · 3 · 3 Might · [Weaponmaster]
const RELL = "sfd-024-221"; // Fury · 4 · 4 Might · [Tank] · When I attack, you may play an Equipment (energy ≤ 2) ignoring its cost, attach it to me.
const ANGLE_SHOT = "sfd-011-221"; // Fury · 2 · [Reaction] attach/detach an Equipment ↔ unit with the same controller. Draw 1.

async function equip(game: Game, unitId: string): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "axe", unitId } });
  await game.settle();
}

describe("Blighted Battleaxe (unl-019-219)", () => {
  test("registry payload: a 4-cost fury Equipment with +4 Might bonus whose only ability is [Equip] costing [1][fury]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ domain: "fury", energyCost: 4, mightBonus: 4, name: "Blighted Battleaxe" });
    expect(["gear", "equipment"]).toContain(def?.cardType as string);
    expect(def?.powerCost ?? []).toEqual([]);
    // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "At the end of your turn, if I didn't conquer this turn, unattach this and deal 4 to me." —
    // conferred on the equipped unit while attached, hence the `effectText: true` entries.
    expect(def?.abilities).toEqual([
      { cost: { energy: 1, power: ["fury"] }, keyword: "Equip", type: "keyword" },
      { effect: { text: "if I didn't conquer this turn, unattach this and deal 4 to me.", type: "raw" }, effectText: true, trigger: { event: "end-of-turn", on: "controller", timing: "at" }, type: "triggered" },
    ] as never);
  });

  test("play cost: exactly 4 energy, no power; enters the base READY and unattached; with 4 energy + fury you cannot also Equip it this turn; 3 energy cannot play it", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "axe").build();
    await game.p1.play("axe");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    await game.settle();
    expect(game.zoneOf("axe")).toBe("base");
    expect(game.state("axe")).toMatchObject({ attachedTo: undefined, isReady: true, keywords: ["Equip"] });
    expect(game.state("ally").might).toBe(2);
    expect(game.p1.can("equipCard")).toBe(false); // the Equip needs [1] more
    expect((await scenario().resources(P1, { energy: 3, power: { fury: 3 } }).hand(P1, CARD, "axe").build()).p1.can("play", "axe")).toBe(false);
  });

  test("play then Equip in one turn takes 5 energy + 1 fury in total: 2-Might ally becomes 6", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "axe").build();
    await game.p1.play("axe");
    await game.settle();
    await equip(game, "ally");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.state("axe").attachedTo).toBe("ally");
    expect(game.state("ally")).toMatchObject({ baseMight: 2, might: 6 });
  });

  test("Equip [1][fury]: exactly 1 energy + 1 fury, one chain item the opponent may answer (no +4 yet), attaches on resolution", async () => {
    const game = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "axe").build();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "axe", unitId: "ally" } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "axe", controller: P1 })]);
    expect(game.state("ally").might).toBe(2);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.settle();
    expect(game.state("axe").attachedTo).toBe("ally");
    expect(game.state("ally")).toMatchObject({ attachments: ["axe"], might: 6 });
    expect(game.violations()).toEqual([]);
  });

  test("cost negative space: energy without fury, fury without the [1], or calm power → no Equip; a pooled [rainbow] + 1 energy → Equip", async () => {
    const mk = (r: { energy?: number; power?: Record<string, number> }) => scenario().resources(P1, r).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "axe").build();
    expect((await mk({ energy: 9 })).p1.can("equipCard")).toBe(false);
    expect((await mk({ energy: 0, power: { fury: 2 } })).p1.can("equipCard")).toBe(false);
    expect((await mk({ energy: 1, power: { calm: 1 } })).p1.can("equipCard")).toBe(false);
    const rainbow = await mk({ energy: 1, power: { rainbow: 1 } });
    expect(rainbow.p1.can("equipCard")).toBe(true);
    await equip(rainbow, "ally");
    expect(rainbow.state("ally").might).toBe(6);
    expect(rainbow.p1.resources().energy).toBe(0);
    expect(rainbow.p1.power()).toBe(0);
  });

  test("'a unit you control': enemy units are never offered; equipping a friendly unit at a battlefield relocates the axe there with no showdown", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2 }, "home")
      .unit(P1, "bf1", { might: 3 }, "afield")
      .unit(P2, "base", { might: 2 }, "enemy")
      .gear(P1, CARD, "axe")
      .build();
    expect([...(game.p1.option("equipCard")?.fields.find((f) => f.name === "unitId")?.options ?? [])].map(String).sort()).toEqual(["afield", "home"]);
    expect((await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "axe", unitId: "enemy" } }))).ok).toBe(false);
    await equip(game, "afield");
    expect(game.zoneOf("axe")).toBe("battlefield-bf1");
    expect(game.state("afield").might).toBe(7);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("+4 wins fights and only while attached: a 2+4 wearer kills a 5-Might defender and conquers; a doomed 1+4 wearer into a 6 dies and the axe returns to base unattached, re-equippable", async () => {
    const win = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 2, name: "Wearer" }, "wearer").unit(P2, "bf1", { might: 5, name: "Guard" }, "guard").gear(P1, CARD, "axe").build();
    await equip(win, "wearer");
    await win.p1.move("wearer", "bf1");
    await win.settle();
    expect(win.zoneOf("guard")).toBe("trash");
    expect(win.locationOf("wearer")).toBe("bf1"); // took 5 < 6
    expect(win.state("axe")).toMatchObject({ attachedTo: "wearer", zone: "battlefield-bf1" });
    expect(win.gameState.battlefields.bf1?.controller).toBe(P1);

    const lose = await scenario().resources(P1, { energy: 2, power: { fury: 2 } }).battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 1, name: "Doomed" }, "doomed").unit(P1, "base", { might: 2, name: "Heir" }, "heir").unit(P2, "bf1", { might: 6, name: "Wall" }, "wall").gear(P1, CARD, "axe").build();
    await equip(lose, "doomed");
    expect(lose.state("doomed").might).toBe(5);
    await lose.p1.move("doomed", "bf1");
    await lose.settle();
    expect(lose.zoneOf("doomed")).toBe("trash");
    expect(lose.zoneOf("wall")).toBe("battlefield-bf1"); // took 5 < 6
    expect(lose.zoneOf("axe")).toBe("base");
    expect(lose.state("axe").attachedTo).toBeUndefined();
    expect(lose.state("heir").might).toBe(2);
    await equip(lose, "heir");
    expect(lose.state("heir").might).toBe(6);
    expect(lose.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("while attached its Equip is inactive (718.2) — no hop to a second unit; timing (151.2): not on the opponent's turn, not during a showdown", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { fury: 3 } }).unit(P1, "base", { might: 2 }, "first").unit(P1, "base", { might: 2 }, "second").gear(P1, CARD, "axe").build();
    await equip(game, "first");
    expect(game.p1.can("equipCard")).toBe(false);
    expect((await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "axe", unitId: "second" } }))).ok).toBe(false);
    expect((await scenario().active(P2).resources(P1, { energy: 1, power: { fury: 1 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "axe").build()).p1.can("equipCard")).toBe(false);
    const sd = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3 }, "guard").unit(P1, "base", { might: 3 }, "runner").unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "axe").build();
    expect(sd.p1.can("equipCard")).toBe(true);
    await sd.p1.move("runner", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("equipCard")).toBe(false);
  });

  test("Weaponmaster (Sentinel Adept): [1][fury] − [rainbow] leaves [1] — 4 energy plays the Adept (3) and pays the leftover 1: attached, 3 → 7, pool empty", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).gear(P1, CARD, "axe").hand(P1, SENTINEL_ADEPT, "adept").build();
    await game.p1.play("adept");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect((game.decision() as { options: { card?: string }[] }).options.map((o) => o.card)).toEqual(["axe"]);
    await game.p1.pick("axe");
    await game.settle();
    expect(game.state("axe").attachedTo).toBe("adept");
    expect(game.state("adept").might).toBe(7);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("Weaponmaster with exactly 3 energy (821.1.c.5): the leftover [1] is unpayable — the axe is not offered / a pick is refused, energy never goes negative, nothing attaches", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).gear(P1, CARD, "axe").hand(P1, SENTINEL_ADEPT, "adept").build();
    await game.p1.play("adept");
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).not.toContain("axe");
      expect((await game.p1.try((p) => p.pick("axe"))).ok).toBe(false);
      if (game.decision()?.kind === "pick") {
        await game.p1.decline();
      }
    }
    await game.settle();
    expect(game.zoneOf("adept")).toBe("base");
    expect(game.state("axe").attachedTo).toBeUndefined();
    expect(game.state("adept").might).toBe(3);
    expect(game.p1.energy()).toBe(0);
  });

  test("Rell, Magnetic's 'Equipment with Energy cost no more than [2]': the 4-cost axe in hand is never eligible — whatever P1 answers, nothing is played and Rell (4) dies into the 5", async () => {
    const game = await scenario().resources(P1, { energy: 9, power: { fury: 3 } }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 5, name: "Foe" }, "foe").unit(P1, "base", RELL, "rell").hand(P1, CARD, "axe").build();
    await game.p1.move("rell", "bf1");
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || !d || d.seat !== P1) {
        break;
      }
      if (d.kind === "yes-no") {
        await game.p1.yes();
      } else if (d.kind === "pick") {
        expect(d.options.map((o) => o.card ?? o.key)).not.toContain("axe");
        await game.p1.decline();
      } else {
        break;
      }
    }
    expect(game.zoneOf("axe")).toBe("hand");
    expect(game.zoneOf("rell")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.p1.resources()).toEqual({ energy: 9, power: { fury: 3 } });
  });

  test("counterplay — enemy Angle Shot ('same controller', Reaction) DETACHES the axe mid-showdown: the 2+4 attacker drops to 2 and dies into the 3-Might defender; the axe is left behind and recalled", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Wearer" }, "wearer")
      .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
      .gear(P1, CARD, "axe")
      .hand(P2, ANGLE_SHOT, "shot")
      .build();
    await equip(game, "wearer");
    expect(game.state("wearer").might).toBe(6);
    await game.p1.move("wearer", "bf1");
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("shot", { targets: ["wearer", "axe"] });
    await game.settle({ policy: "first" });
    expect(game.state("axe").attachedTo).toBeUndefined();
    expect(game.zoneOf("wearer")).toBe("trash"); // fought at 2 into 3
    expect(game.zoneOf("guard")).toBe("battlefield-bf1"); // took 2 < 3
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("axe")).toBe("base"); // 457.1
  });
});
