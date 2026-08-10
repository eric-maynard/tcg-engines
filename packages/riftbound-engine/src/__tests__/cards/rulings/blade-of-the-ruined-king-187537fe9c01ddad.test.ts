/**
 * Ruling 187537fe9c01ddad — Blade of the Ruined King (SFD-178 → sfd-178-221) · Equipment · Order · 3+[order] · +4
 *   "[Equip] — [order], Kill a friendly unit (Pay the cost: Attach this to a unit you control.)"
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) "If a friendly unit would die, kill this instead. Heal that unit,
 *     exhaust it, and recall it."  × Guardian Angel (SFD-051 → sfd-051-221) same replacement for the equipped unit.
 *
 * Q: Can the unit killed to pay the Equip cost be the same unit you equip? Can you Equip with 0 or 1 friendly units?
 * A: No. The holder is a target chosen BEFORE costs are paid; killing it during payment makes the target illegal at the
 *    final legality check and the activation rewinds — so you need at least 2 friendly units. Nuance: if Zhonya's
 *    Hourglass / Guardian Angel replaces that death, the unit survives (recalled, exhausted), the target stays legal
 *    and the Blade attaches as planned.
 * Rules: 356 / 358.1 (targets chosen, costs paid, legality re-checked before finalizing), 818.1.b–c (Equip cost),
 *        372/373 (death replacement).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BOTRK = "sfd-178-221";
const ZHONYAS = "ogn-077-298";
const GUARDIAN_ANGEL = "sfd-051-221";

const equipVariants = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants.map((v) => v.params as { unitId?: string; sacrificeId?: string; equipmentId?: string }))
    .filter((p) => p.equipmentId === "botrk");

describe("Ruling 187537fe9c01ddad — Blade of the Ruined King needs a second friendly unit; the fodder can't be the holder", () => {
  test("ZERO friendly units: no Equip is offered at all", async () => {
    const game = await scenario().resources(P1, { power: { order: 1 } }).unit(P2, "base", { might: 2 }, "foe").gear(P1, BOTRK, "botrk").build();
    expect(equipVariants(game)).toEqual([]);
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "botrk", unitId: "foe" }))).ok).toBe(false);
  });

  test("ONE friendly unit: it would have to be both the sacrifice and the holder → no Equip offered; forcing it is rejected and the unit stays a bare 2", async () => {
    const game = await scenario()
      .resources(P1, { power: { order: 1 } })
      .unit(P1, "base", { might: 2, name: "Heir" }, "heir")
      .gear(P1, BOTRK, "botrk")
      .build();
    expect(equipVariants(game)).toEqual([]);
    const r = await game.p1.try((p) => p.do("equipCard", { equipmentId: "botrk", sacrificeId: "heir", unitId: "heir" }));
    expect(r.ok).toBe(false);
    await game.settle();
    expect(game.zoneOf("heir")).toBe("base");
    expect(game.state("heir")).toMatchObject({ attachments: [], might: 2 });
    expect(game.state("botrk").attachedTo).toBeUndefined();
    expect(game.p1.power("order")).toBe(1); // nothing was paid
  });

  test("TWO friendly units: every offered line pairs a holder with a DIFFERENT sacrifice — never the same unit for both", async () => {
    const game = await scenario()
      .resources(P1, { power: { order: 1 } })
      .unit(P1, "base", { might: 2, name: "Heir" }, "heir")
      .unit(P1, "base", { might: 1, name: "Fodder" }, "fodder")
      .gear(P1, BOTRK, "botrk")
      .build();
    const lines = equipVariants(game);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((p) => p.unitId !== p.sacrificeId)).toBe(true);
    expect(lines.map((p) => `${p.sacrificeId}→${p.unitId}`).sort()).toEqual(["fodder→heir", "heir→fodder"]);
    // Same-unit line is rejected outright.
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "botrk", sacrificeId: "heir", unitId: "heir" }))).ok).toBe(false);
  });

  test("TWO friendly units: kill the Fodder, equip the Heir → Fodder in trash, [order] paid, Heir wears the Blade as a 6", async () => {
    const game = await scenario()
      .resources(P1, { power: { order: 1 } })
      .unit(P1, "base", { might: 2, name: "Heir" }, "heir")
      .unit(P1, "base", { might: 1, name: "Fodder" }, "fodder")
      .gear(P1, BOTRK, "botrk")
      .build();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "botrk", sacrificeId: "fodder", unitId: "heir" } });
    expect(game.zoneOf("fodder")).toBe("trash"); // cost paid on activation
    expect(game.p1.power("order")).toBe(0);
    await game.settle();
    expect(game.state("botrk").attachedTo).toBe("heir");
    expect(game.state("heir")).toMatchObject({ attachments: ["botrk"], might: 6 });
    expect(game.violations()).toEqual([]);
  });

  // Ruling nuance: with Zhonya's Hourglass out, the lone Heir may be named as BOTH the sacrifice and the holder — the kill is
  // replaced (Zhonya's dies instead; Heir healed, exhausted, recalled), the Heir is still a legal target and the Blade attaches.
  test("nuance — with Zhonya's Hourglass the lone Heir may pay its own kill cost (death replaced: Zhonya's dies, Heir exhausted in base) and still gets the Blade (6)", async () => {
    const game = await scenario()
      .resources(P1, { power: { order: 1 } })
      .unit(P1, "base", { might: 2, name: "Heir" }, "heir")
      .gear(P1, ZHONYAS, "zhonya")
      .gear(P1, BOTRK, "botrk")
      .build();
    const viaMenu = await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "botrk", sacrificeId: "heir", unitId: "heir" } }));
    if (!viaMenu.ok) {
      await game.p1.do("equipCard", { equipmentId: "botrk", sacrificeId: "heir", unitId: "heir" });
    }
    await game.settle({ policy: "first" });
    expect(game.zoneOf("zhonya")).toBe("trash"); // killed instead
    expect(game.zoneOf("heir")).toBe("base");
    expect(game.state("heir").isExhausted).toBe(true);
    expect(game.state("botrk").attachedTo).toBe("heir");
    expect(game.state("heir").might).toBe(6);
  });

  // Same nuance with Guardian Angel already worn by the Heir: GA dies instead, the Heir survives and takes the Blade.
  test("nuance — with Guardian Angel equipped the Heir may pay its own kill cost (GA dies instead) and still gets the Blade (6)", async () => {
    const game = await scenario()
      .resources(P1, { power: { order: 1 } })
      .unit(P1, "base", { might: 2, name: "Heir" }, "heir", { equippedWith: ["ga"] })
      .gear(P1, GUARDIAN_ANGEL, "ga", { attachedTo: "heir" })
      .gear(P1, BOTRK, "botrk")
      .build();
    expect(game.state("heir").attachments).toEqual(["ga"]);
    const viaMenu = await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "botrk", sacrificeId: "heir", unitId: "heir" } }));
    if (!viaMenu.ok) {
      await game.p1.do("equipCard", { equipmentId: "botrk", sacrificeId: "heir", unitId: "heir" });
    }
    await game.settle({ policy: "first" });
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("heir")).toBe("base");
    expect(game.state("botrk").attachedTo).toBe("heir");
    expect(game.state("heir").might).toBe(6);
  });
});
