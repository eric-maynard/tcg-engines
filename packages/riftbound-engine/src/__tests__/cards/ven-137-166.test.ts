/**
 * Shady Spectacles — ven-137-166 · Gear (Equipment) · Order · 4 energy · Might bonus +0
 *
 *   [Equip] [1][order] ([1][order]: Attach this to a unit you control.)
 *   As this is attached to a unit, choose another friendly unit. The equipped unit becomes a copy of
 *   that unit for as long as this is attached to it.
 *
 * Head-judge notes (the tricky spots this file pins down):
 *  1. Two costs: [4] PLAYS the gear (base, ready, unattached — nothing is copied); [1][order] is the
 *     Equip activation (chain item; attaches on resolution). Equip only targets units YOU control.
 *  2. "choose ANOTHER FRIENDLY unit": the holder itself and enemy units are never choices. One other
 *     friendly unit → bound automatically; none → the Spectacles still attach and the holder is simply
 *     itself (no prompt, no crash).
 *  3. Copy (477.1.b): the holder takes the model's copyable traits — name, cost, rules text/keywords and
 *     (as the engine and the Reflection precedent treat it) printed Might — but keeps its OWN statuses:
 *     damage, buff, exhaustion, location, attachments. The model is untouched. Copyable = PRINTED
 *     (477.1.b.1.b): a buffed / pumped model hands over its printed Might only.
 *  4. Rules text is copied: a vanilla holder copying Baccai Witherclaw gains its [Empower] ability and
 *     can activate it. A copy of a copy (second Spectacles choosing the first holder) is the model again.
 *  5. Duration = "as long as this is attached": when the holder dies the gear falls off (recalled to
 *     base, unattached) and the card in the trash is its printed self again; re-equipping asks anew.
 *     The MODEL leaving the board later does not end the copy (traits were already received).
 *  6. Might bonus is +0: the holder's Might is exactly the model's printed Might (+ the holder's own buff).
 */

import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-137-166";
const WITHERCLAW = "ven-078-166"; // Body unit · 4 Might · [Empower] [1][rainbow][rainbow] · [Empowered] +2 Might
const VENGEANCE = "ogn-229-298"; // Order spell · 4 + [order][order] · Kill a unit.

function board(opts: { energy?: number; power?: Record<string, number> } = {}) {
  return scenario()
    .resources(P1, { energy: opts.energy ?? 1, power: opts.power ?? { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Blank" }, "blank", { buffed: true, damage: 1 })
    .unit(P1, "bf1", { energyCost: 6, keywords: ["Tank"], might: 5, name: "Model" }, "model", { damage: 2 })
    .unit(P1, "base", WITHERCLAW, "claw")
    .unit(P2, "bf2", { might: 4, name: "Enemy" }, "enemy")
    .gear(P1, CARD, "specs");
}

/** Activate Equip onto `holder`, let it resolve, and answer the copy choice with `model` if asked. Returns what was offered. */
async function equip(game: Game, holder: string, model?: string, gear = "specs"): Promise<string[] | undefined> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: gear, unitId: holder } });
  let offered: string[] | undefined;
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      offered = (d as PickDecision).options.map((o) => o.card ?? o.key);
      expect(model).toBeDefined();
      await game.p1.pick(model as string);
      continue;
    }
    if (r.reason !== "unanswered") {
      break;
    }
  }
  return offered;
}

describe("Shady Spectacles (ven-137-166)", () => {
  test("registry payload: 4-cost order gear, +0 Might bonus, [Equip] costing [1][order], and the copy-the-chosen-unit-onto-the-holder marker", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "gear", copyChosenUnitToHolder: true, domain: "order", energyCost: 4, mightBonus: 0, name: "Shady Spectacles" });
    const abilities = def?.abilities as Record<string, unknown>[];
    expect(abilities[0]).toEqual({ cost: { energy: 1, power: ["order"] }, keyword: "Equip", type: "keyword" });
    expect(abilities).toHaveLength(2);
    expect(JSON.stringify(abilities[1])).toContain("becomes a copy of that unit");
  });

  test("play cost: 4 energy puts it in the base READY and unattached — nothing is copied by playing it; 3 energy is one short", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", { might: 2, name: "Blank" }, "blank").unit(P1, "base", { might: 5, name: "Model" }, "model").hand(P1, CARD, "specs").build();
    await game.p1.play("specs");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("specs")).toBe("base");
    expect(game.state("specs")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.state("blank")).toMatchObject({ might: 2, name: "Blank" });
    expect(game.p1.can("equipCard")).toBe(false); // no [1][order] left for the Equip
    expect((await scenario().resources(P1, { energy: 3, power: { order: 2 } }).hand(P1, CARD, "specs").build()).p1.can("play", "specs")).toBe(false);
  });

  test("Equip [1][order]: exactly 1 energy + 1 order is spent, one chain item, attaches on resolution; only units YOU control are Equip targets", async () => {
    const game = await board().build();
    expect(game.p1.option("equipCard")?.fields.find((f) => f.name === "unitId")?.options).toEqual(["blank", "claw", "model"]);
    await game.p1.choose("equipCard:-", { params: { equipmentId: "specs", unitId: "blank" } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toHaveLength(1);
    expect(game.state("specs").attachedTo).toBeUndefined();
    const bad = await (await board().build()).p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "specs", unitId: "enemy" } }));
    expect(bad.ok).toBe(false);
    expect((await board({ energy: 0 }).build()).p1.can("equipCard")).toBe(false);
    expect((await board({ power: { fury: 1 } }).build()).p1.can("equipCard")).toBe(false);
  });

  test("'choose another friendly unit': the prompt offers claw + model — never the holder, never the enemy — and the holder becomes Model: name, printed Might 5, Tank, cost 6", async () => {
    const game = await board().build();
    const offered = await equip(game, "blank", "model");
    expect([...(offered ?? [])].sort()).toEqual(["claw", "model"]);
    expect(game.state("specs").attachedTo).toBe("blank");
    expect(game.state("blank")).toMatchObject({ attachments: ["specs"], baseMight: 5, energyCost: 6, keywords: ["Tank"], name: "Model" });
    expect(game.violations()).toEqual([]);
  });

  test("the holder keeps its OWN statuses — damage 1, buffed (+1 → 6 Might), in base — and the model is untouched (still 5 Might, damage 2, at bf1)", async () => {
    const game = await board().build();
    await equip(game, "blank", "model");
    expect(game.state("blank")).toMatchObject({ damage: 1, isBuffed: true, isToken: false, location: "base", might: 6 });
    expect(game.state("model")).toMatchObject({ damage: 2, location: "bf1", might: 5, name: "Model" });
    expect(game.zoneOf("specs")).toBe("base"); // rides with the holder, who is in base
  });

  test("Might bonus is +0: an unbuffed 2-Might holder copying the 5-Might Model is exactly 5, and fights as 5 (kills the 4-Might Enemy, survives, conquers)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { order: 1 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Blank" }, "blank")
      .unit(P1, "base", { keywords: ["Tank"], might: 5, name: "Model" }, "model")
      .unit(P2, "bf2", { might: 4, name: "Enemy" }, "enemy")
      .gear(P1, CARD, "specs")
      .build();
    await equip(game, "blank", "model");
    expect(game.state("blank")).toMatchObject({ baseMight: 5, might: 5 });
    await game.p1.move("blank", "bf2");
    await game.settle();
    expect(game.zoneOf("enemy")).toBe("trash");
    expect(game.locationOf("blank")).toBe("bf2");
    expect(game.zoneOf("specs")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("exactly one other friendly unit → bound without a prompt; NO other friendly unit → still attaches, holder stays itself, no dangling prompt", async () => {
    const one = await scenario().resources(P1, { energy: 1, power: { order: 1 } }).unit(P1, "base", { might: 2, name: "Blank" }, "blank").unit(P1, "base", { might: 3, name: "Solo" }, "solo").unit(P2, "base", { might: 9, name: "Enemy" }, "enemy").gear(P1, CARD, "specs").build();
    expect(await equip(one, "blank")).toBeUndefined();
    expect(one.state("blank")).toMatchObject({ might: 3, name: "Solo" });
    const none = await scenario().resources(P1, { energy: 1, power: { order: 1 } }).unit(P1, "base", { might: 2, name: "Blank" }, "blank").unit(P2, "base", { might: 9, name: "Enemy" }, "enemy").gear(P1, CARD, "specs").build();
    expect(await equip(none, "blank")).toBeUndefined();
    expect(none.state("specs").attachedTo).toBe("blank");
    expect(none.state("blank")).toMatchObject({ might: 2, name: "Blank" });
    expect(none.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("477.1.b.1.b — copyable means PRINTED: a buffed Model pumped +2 this turn (5 → 8) hands over 5, not 8", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { order: 1 } })
      .unit(P1, "base", { might: 2, name: "Blank" }, "blank")
      .unit(P1, "base", { might: 5, name: "Model" }, "model", { buffed: true, mightModifier: 2 })
      .gear(P1, CARD, "specs")
      .build();
    expect(game.state("model").might).toBe(8);
    await equip(game, "blank", "model");
    expect(game.state("blank")).toMatchObject({ baseMight: 5, isBuffed: false, might: 5, name: "Model" });
  });

  test("rules text is copied: a vanilla holder copying Baccai Witherclaw gains [Empower] [1][rainbow][rainbow], activates it, and becomes an Empowered 6-Might 'Baccai Witherclaw'", async () => {
    const game = await board({ energy: 2, power: { order: 1, rainbow: 2 } }).build();
    expect(game.p1.can("activate", "blank")).toBe(false);
    await equip(game, "blank", "claw");
    expect(game.state("blank")).toMatchObject({ baseMight: 4, name: "Baccai Witherclaw" });
    expect(game.p1.can("activate", "blank")).toBe(true);
    await game.p1.activate("blank");
    await game.settle();
    expect(game.state("blank")).toMatchObject({ isEmpowered: true, might: 7 }); // 4 printed + 2 Empowered + 1 own buff
    expect(game.state("claw")).toMatchObject({ isEmpowered: false, might: 4 }); // the model is not the one empowered
  });

  test("duration — the holder dies: Spectacles fall off to the base unattached and can be re-equipped (the lone remaining model is bound to the new holder)", async () => {
    const game = await board({ energy: 6, power: { order: 4 } }).hand(P1, VENGEANCE, "veng").build();
    await equip(game, "blank", "model");
    expect(game.state("blank").name).toBe("Model");
    await game.p1.cast("veng", { targets: "blank" });
    await game.settle();
    expect(game.zoneOf("blank")).toBe("trash");
    expect(game.zoneOf("specs")).toBe("base");
    expect(game.state("specs").attachedTo).toBeUndefined();
    const offered = await equip(game, "claw", "model");
    expect(offered ?? ["model"]).toEqual(["model"]); // only one other friendly unit left → may be auto-bound
    expect(game.state("specs").attachedTo).toBe("claw");
    expect(game.state("claw")).toMatchObject({ baseMight: 5, name: "Model" });
  });

  // BUG — expected: "for as long as this is attached to it" — once the holder dies and the Spectacles
  // detach, the copy ends: the card in the trash is the printed 2-Might "Blank" (cost 0) again.
  // Actual: the death/detach path never reverts the copy, so the trash holds a 5-Might, 6-cost "Model".
  test("the copy ends with the attachment — a dead holder sits in the trash as its printed self (2 Might, cost 0 'Blank'), not as 'Model'", async () => {
    const game = await board({ energy: 5, power: { order: 3 } }).hand(P1, VENGEANCE, "veng").build();
    await equip(game, "blank", "model");
    await game.p1.cast("veng", { targets: "blank" });
    await game.settle();
    expect(game.zoneOf("blank")).toBe("trash");
    expect(game.state("specs").attachedTo).toBeUndefined();
    expect(game.state("blank")).toMatchObject({ baseMight: 2, energyCost: 0, keywords: [], name: "Blank" });
  });

  test("the MODEL leaving the board afterwards does not end the copy: kill Model, the holder is still a 5-Might Tank named Model", async () => {
    const game = await board({ energy: 5, power: { order: 3 } }).hand(P1, VENGEANCE, "veng").build();
    await equip(game, "blank", "model");
    await game.p1.cast("veng", { targets: "model" });
    await game.settle();
    expect(game.zoneOf("model")).toBe("trash");
    expect(game.state("blank")).toMatchObject({ baseMight: 5, keywords: ["Tank"], might: 6, name: "Model" });
    expect(game.state("specs").attachedTo).toBe("blank");
  });

  test("a copy of a copy (477.1.b.1.b): a second Spectacles on the Witherclaw choosing the first holder (currently 'Model') makes it Model too", async () => {
    const game = await board({ energy: 2, power: { order: 2 } }).gear(P1, CARD, "specs2").build();
    await equip(game, "blank", "model");
    const offered = await equip(game, "claw", "blank", "specs2");
    expect([...(offered ?? [])].sort()).toEqual(["blank", "model"]);
    expect(game.state("claw")).toMatchObject({ baseMight: 5, keywords: ["Tank"], might: 5, name: "Model" });
    expect(game.state("specs2").attachedTo).toBe("claw");
  });

  test("timing (381 / 151.2): Equip is not offered on the opponent's turn nor while a showdown is open", async () => {
    expect((await board().active(P2).build()).p1.can("equipCard")).toBe(false);
    const game = await board().unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await game.p1.move("scout", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("equipCard")).toBe(false);
  });
});
