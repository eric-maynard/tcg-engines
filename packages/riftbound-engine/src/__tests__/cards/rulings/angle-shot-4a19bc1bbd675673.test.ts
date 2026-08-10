/**
 * Ruling 4a19bc1bbd675673 — Angle Shot (SFD-011 → sfd-011-221) · [Reaction] · 2 "Choose a unit and an Equipment with the
 *   same controller. Attach that Equipment to that unit or detach that Equipment from that unit. Draw 1."
 *   × Relentless Pursuit (sfd-184-221) × Strike Down (SFD-107 → sfd-107-221) "Choose an equipped friendly unit. It deals
 *   damage equal to its Might to an enemy unit. Then detach an Equipment from it." × Veiled Temple (sfd-221-221)
 *   (+ Long Sword sfd-022-221 · Equipment · +2 · "[Quick-Draw] [Equip] [fury]" as the equipment in question)
 *
 * Q: My equipment is already attached to a unit. May I pay its Equip cost again to move it to another unit?
 * A: No. While attached its Equip ability is inactive; you cannot activate it. Only external effects move attached gear
 *    (Angle Shot / Relentless Pursuit / Weaponmaster …). To re-Equip you must first detach it (unit dies, Strike Down,
 *    Veiled Temple) — it returns to base, and then the Equip cost can be paid fresh.
 * Rules: 718.2 / 135.4 (attached equipment's text inactive), 826 (Equip), 716–719 (attach / detach → base).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ANGLE_SHOT = "sfd-011-221";
const STRIKE_DOWN = "sfd-107-221";
const LONG_SWORD = "sfd-022-221";

/** P1: Squire (2) and Knight (3) in base, a loose Long Sword, Angle Shot + Strike Down in hand, plenty of resources. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { body: 1, fury: 3 } })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P1, "base", { might: 3, name: "Knight" }, "knight")
    .unit(P2, "base", { might: 6, name: "Enemy Brute" }, "brute")
    .gear(P1, LONG_SWORD, "sword")
    .hand(P1, ANGLE_SHOT, "shot")
    .hand(P1, STRIKE_DOWN, "strike");
}

const equipVariants = (game: Game) =>
  (game.p1.option("equipCard")?.variants ?? []).map((v) => `${String(v.params.equipmentId)}->${String(v.params.unitId)}`).sort();

/** Pay [fury] to Equip the loose Long Sword onto the Squire. */
async function swordOnSquire(): Promise<Game> {
  const game = await board().build();
  expect(equipVariants(game)).toEqual(["sword->knight", "sword->squire"]); // loose: Equip is available to either unit
  await game.p1.do("equipCard", { equipmentId: "sword", unitId: "squire" });
  await game.settle();
  expect(game.state("sword").attachedTo).toBe("squire");
  expect(game.state("squire").might).toBe(4);
  expect(game.p1.power("fury")).toBe(2); // paid [fury] once
  return game;
}

describe("Ruling 4a19bc1bbd675673 — an attached Equipment's Equip cost cannot be paid again to hop it to another unit", () => {
  test("once Long Sword is on the Squire, no Equip activation is offered at all (not onto Knight, not 're-onto' Squire) even with [fury] to spare, and forcing it is rejected", async () => {
    const game = await swordOnSquire();
    expect(equipVariants(game)).toEqual([]);
    expect(game.p1.can("equipCard")).toBe(false);
    const r = await game.p1.try((p) => p.do("equipCard", { equipmentId: "sword", unitId: "knight" }));
    expect(r.ok).toBe(false);
    expect(game.state("sword").attachedTo).toBe("squire");
    expect(game.state("knight").attachments).toEqual([]);
    expect(game.p1.power("fury")).toBe(2); // nothing was charged
  });

  test("an external effect CAN move it: Angle Shot choosing [Knight, Long Sword] attaches the Sword to the Knight (and draws 1)", async () => {
    const game = await swordOnSquire();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("shot", { targets: ["knight", "sword"] });
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const attach = d.options.find((o) => /attach/i.test(o.label) && !/detach/i.test(o.label)) ?? d.options[0]!;
      await game.p1.answer({ keys: [attach.key], kind: "pick" });
      await game.settle();
    }
    expect(game.zoneOf("shot")).toBe("trash");
    expect(game.state("sword").attachedTo).toBe("knight");
    expect(game.state("knight").might).toBe(5);
    expect(game.state("squire").might).toBe(2);
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1);
  });

  test("to re-use the Equip ability, detach first: Strike Down (Squire hits the Brute, then detaches) sends the Sword back to base unattached — and NOW Equip [fury] is offered again and attaches it to the Knight", async () => {
    const game = await swordOnSquire();
    await game.p1.cast("strike", { targets: ["squire", "brute"] });
    await game.settle();
    for (let i = 0; i < 3 && game.decision()?.kind === "pick" && game.decision()?.seat === P1; i++) {
      const d = game.decision()!;
      if (d.kind === "pick") {
        await game.p1.answer({ keys: [d.options[0]!.key], kind: "pick" });
        await game.settle();
      }
    }
    expect(game.zoneOf("strike")).toBe("trash");
    expect(game.state("brute").damage).toBe(4); // Squire's 2 + Sword's 2
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.zoneOf("sword")).toBe("base");
    expect(game.state("squire").might).toBe(2);
    // Fresh Equip is legal again.
    expect(equipVariants(game)).toEqual(["sword->knight", "sword->squire"]);
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "knight" });
    await game.settle();
    expect(game.state("sword").attachedTo).toBe("knight");
    expect(game.state("knight").might).toBe(5);
    expect(game.p1.power("fury")).toBe(1); // paid [fury] a second time
    expect(game.violations()).toEqual([]);
  });
});
