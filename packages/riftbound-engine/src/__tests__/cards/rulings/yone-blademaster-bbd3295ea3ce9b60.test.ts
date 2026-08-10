/**
 * Ruling bbd3295ea3ce9b60 — Yone, Blademaster (SFD-116 → sfd-116-221) · Champion Unit · Body · 5+[body] · 5 Might · [Weaponmaster]
 *   × Blade of the Ruined King (SFD-178 → sfd-178-221) · Equipment · Order · 3+[order] · +4
 *     "[Equip] — [order], Kill a friendly unit (Pay the cost: Attach this to a unit you control.)"
 *
 * Q: Yone is in base and I play Blade of the Ruined King — must I still kill a unit to attach it? With no other unit, can I?
 * A: PLAYING the Blade needs no kill (the gear just enters). Equipping is a separate activated ability whose cost is [order] +
 *    kill a friendly unit; the kill is mandatory (Weaponmaster only waives [rainbow], never the kill) and the killed unit can't
 *    be the one you equip — so with Yone as your only unit you cannot attach it.
 * Rules: 826 / 818.1.b–c (Equip = activated ability with a cost), 356–358 (costs; target must stay legal), 825 (Weaponmaster
 *        reduces the power cost only).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YONE = "sfd-116-221";
const BOTRK = "sfd-178-221";

const equipLines = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants.map((v) => v.params as { unitId?: string; sacrificeId?: string; equipmentId?: string }))
    .filter((p) => p.equipmentId === "botrk");

/** P1's turn: Yone alone in base, Blade of the Ruined King in hand, [3] + [order]×2 (play cost + a spare [order] for Equip). */
function yoneAlone() {
  return scenario()
    .resources(P1, { energy: 3, power: { order: 2 } })
    .unit(P1, "base", YONE, "yone")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P1, BOTRK, "botrk");
}

describe("Ruling bbd3295ea3ce9b60 — playing the Blade is free of kills; Equipping always kills ANOTHER friendly unit, Weaponmaster or not", () => {
  test("playing Blade of the Ruined King from hand: pays 3+[order], the gear enters P1's base detached — nobody is killed and nothing is asked", async () => {
    const game = await yoneAlone().build();
    await game.p1.play("botrk");
    await game.settle();
    expect(game.zoneOf("botrk")).toBe("base");
    expect(game.state("botrk").attachedTo).toBeUndefined();
    expect(game.p1.gear()).toEqual(["botrk"]);
    expect(game.zoneOf("yone")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("with Yone as the ONLY friendly unit the Equip ability cannot be activated at all (he can't be both the kill and the holder) — even with [order] ready; forcing it is rejected", async () => {
    const game = await yoneAlone().build();
    await game.p1.play("botrk");
    await game.settle();
    expect(game.p1.power("order")).toBe(1);
    expect(equipLines(game)).toEqual([]);
    const r = await game.p1.try((p) => p.do("equipCard", { equipmentId: "botrk", sacrificeId: "yone", unitId: "yone" }));
    expect(r.ok).toBe(false);
    expect(game.state("yone")).toMatchObject({ attachments: [], might: 5, zone: "base" });
    expect(game.p1.power("order")).toBe(1);
  });

  test("with a second friendly unit (Fodder) the only lines offered kill one unit and equip the OTHER; killing Fodder puts the Blade on Yone (5 → 9) for [order]", async () => {
    const game = await yoneAlone().unit(P1, "base", { might: 1, name: "Fodder" }, "fodder").build();
    await game.p1.play("botrk");
    await game.settle();
    const lines = equipLines(game);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((p) => p.unitId !== p.sacrificeId)).toBe(true);
    await game.p1.choose("equipCard:-", { params: { equipmentId: "botrk", sacrificeId: "fodder", unitId: "yone" } });
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.p1.power("order")).toBe(0);
    await game.settle();
    expect(game.state("botrk").attachedTo).toBe("yone");
    expect(game.state("yone")).toMatchObject({ attachments: ["botrk"], might: 9 });
    expect(game.violations()).toEqual([]);
  });

  test("Weaponmaster (playing Yone with the Blade already in base + a Fodder): the Equip is offered for [rainbow] LESS — no [order] spent — but the Fodder is STILL killed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { body: 1, order: 1 } })
      .gear(P1, BOTRK, "botrk")
      .unit(P1, "base", { might: 1, name: "Fodder" }, "fodder")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P1, YONE, "yone")
      .build();
    await game.p1.play("yone");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "equip", source: { cardId: "yone" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["botrk"]);
    await game.p1.pick("botrk");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("fodder")).toBe("trash"); // the kill is not waived
    expect(game.state("botrk").attachedTo).toBe("yone");
    expect(game.state("yone").might).toBe(9);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 1 } }); // [order] untouched: rainbow less
  });

  test("Weaponmaster with NO other friendly unit: the equip offer has nothing selectable (the kill can't be paid) — declining leaves the Blade detached and Yone a bare 5", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { body: 1, order: 1 } })
      .gear(P1, BOTRK, "botrk")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P1, YONE, "yone")
      .build();
    await game.p1.play("yone");
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.semantics === "equip") {
      expect(d.options).toEqual([]);
      await game.p1.decline();
    }
    await game.settle();
    expect(game.state("botrk").attachedTo).toBeUndefined();
    expect(game.state("yone")).toMatchObject({ attachments: [], might: 5, zone: "base" });
    expect(game.p1.power("order")).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
