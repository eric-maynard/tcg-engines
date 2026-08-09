/**
 * Interaction: Gearhead (sfd-068-221, Mind unit, 5, 3 Might)
 *     "[Accelerate] … Each Equipment attached to me gives double its base Might bonus."
 *   × Purifier (sfd-183-221, Legend — Lucian) "Your Equipment each give [Assault]."
 *   × Doran's Blade (sfd-095-221, Body Equipment, +2 Might, no Effect Text)
 *   × Serrated Dirk (sfd-009-221, Fury Equipment, +0 Might, Effect Text [Assault 2])
 *   with an inline plain 3-Might unit for comparison and Angle Shot (sfd-011-221) as the tool that moves
 *   the Blade from Gearhead onto the plain unit mid-turn (attach → 434.1.f detaches it from Gearhead).
 *
 * Question: P1's legend is Purifier; Gearhead wears Doran's Blade.
 *   (a) Gearhead's Might in base / defending / attacking?
 *   (b) Add Serrated Dirk as a second Equipment: attacking Might? Is the Dirk's Assault 2 or Purifier's
 *       Assault doubled by Gearhead?
 *   (c) Same two Equipment on a plain 3-Might unit attacking, for comparison.
 *   (d) Move the Blade off Gearhead onto the plain unit mid-turn: what does each have?
 *
 * Rules: 137.3 / 137.3.a / 434.1.d / 718.4 (Might Bonus modulates the wearer only while attached),
 * 807.1.b.3 (bare [Assault] = Assault 1), 807.1.c (Assault = +X Might only while an attacker), 807.2
 * (Assault from several sources sums), 435.1.e (detached → bonus stops), 818.3.b (Equipped), 434.1.f.
 *
 * Expected: (a) 3 + 2×2 = 7 at rest and while defending; attacking 7 + Assault 1 (Purifier via the Blade)
 * = 8 — Assault is a keyword, not a "base Might bonus", so Gearhead does not double it. (b) rest 7 (the
 * Dirk's +0 doubled is 0); attacking 7 + (2 Dirk + 1 + 1 Purifier per Equipment) = 11. (c) plain: 5 at
 * rest, 9 attacking. (d) Gearhead keeps only the Dirk → 3 at rest, 6 attacking (Assault 2 + 1); the plain
 * unit with the Blade → 5 at rest (not doubled), 6 attacking (Assault 1 from Purifier).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GEARHEAD = "sfd-068-221";
const PURIFIER = "sfd-183-221";
const DORANS_BLADE = "sfd-095-221";
const SERRATED_DIRK = "sfd-009-221";
const ANGLE_SHOT = "sfd-011-221";

/**
 * P1 (Purifier): Gearhead + a plain 3-Might unit in base, Doran's Blade + Serrated Dirk unattached in
 * base, exactly [body] + [fury] to Equip both and 2 energy for Angle Shot. P2 holds bf1 with a 20-Might
 * Wall (so attackers' Might can be read mid-combat without anything dying mattering) and has a 1-Might
 * Poker in base to attack P1's bf2 with.
 */
function board() {
  return scenario()
    .legend(P1, PURIFIER, "purifier")
    .resources(P1, { energy: 2, power: { body: 1, fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", GEARHEAD, "gearhead")
    .unit(P1, "base", { might: 3, name: "Plain" }, "plain")
    .unit(P2, "bf1", { might: 20, name: "Wall" }, "wall")
    .unit(P2, "base", { might: 1, name: "Poker" }, "poker")
    .gear(P1, DORANS_BLADE, "blade")
    .gear(P1, SERRATED_DIRK, "dirk")
    .hand(P1, ANGLE_SHOT, "shot");
}

/** [Equip] `equipment` onto `unit` via the printed Equip ability and let it resolve. */
async function equip(game: Game, equipment: string, unit: string): Promise<void> {
  await game.p1.choose("equipCard", { params: { equipmentId: equipment, unitId: unit } });
  await game.settle();
  expect(game.state(equipment).attachedTo).toBe(unit);
}

/** Sum of Assault values a unit currently carries (bare Assault = 1, 807.1.b.3). */
function assaultTotal(game: Game, unit: string): number {
  return game
    .state(unit)
    .grantedKeywords.filter((k) => k.keyword === "Assault")
    .reduce((s, k) => s + (typeof k.value === "number" ? k.value : 1), 0);
}

describe("Gearhead × Purifier × Doran's Blade / Serrated Dirk — doubling Might bonuses, not Assault", () => {
  test("(a) at rest: Gearhead + Doran's Blade = 3 + 2×2 = 7; Purifier makes the Blade give its wearer Assault (1) — a keyword on Gearhead, not extra resting Might", async () => {
    const game = await board().build();
    expect(game.state("gearhead").might).toBe(3);
    await equip(game, "blade", "gearhead");
    expect(game.state("gearhead")).toMatchObject({ attachments: ["blade"], baseMight: 3, might: 7 });
    expect(game.state("gearhead").keywords).toContain("Assault");
    expect(assaultTotal(game, "gearhead")).toBe(1);
    expect(game.p1.power("body")).toBe(0); // paid [body] for the Equip
  });

  test("(a) attacking: 7 + Assault 1 = 8 — Gearhead does NOT double Purifier's Assault (it is not a base Might bonus)", async () => {
    const game = await board().build();
    await equip(game, "blade", "gearhead");
    await game.p1.move("gearhead", "bf1");
    expect(game.state("gearhead")).toMatchObject({ combatRole: "attacker", might: 8 });
    expect(game.state("gearhead").might).not.toBe(9); // 9 would mean the Assault got doubled
  });

  test("(a) defending: Assault does nothing for a defender (807.1.c) — Gearhead defends bf2 at 7", async () => {
    const game = await scenario()
      .legend(P1, PURIFIER, "purifier")
      .resources(P1, { power: { body: 1 } })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", GEARHEAD, "gearhead")
      .unit(P2, "base", { might: 1, name: "Poker" }, "poker")
      .gear(P1, DORANS_BLADE, "blade")
      .build();
    await equip(game, "blade", "gearhead");
    expect(game.state("gearhead").might).toBe(7);
    await game.advanceTurn(); // → P2
    expect(game.state("gearhead").might).toBe(7); // static, not a this-turn effect
    await game.p2.move("poker", "bf2");
    expect(game.state("gearhead")).toMatchObject({ combatRole: "defender", might: 7 });
    await game.settle();
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.locationOf("gearhead")).toBe("bf2");
  });

  test("(b) second Equipment (Serrated Dirk, +0): resting Might stays 7 (2×0 = 0); Gearhead now carries Assault 2 (Dirk) + 1 + 1 (Purifier per Equipment) = Assault 4", async () => {
    const game = await board().build();
    await equip(game, "blade", "gearhead");
    await equip(game, "dirk", "gearhead");
    expect(game.state("gearhead")).toMatchObject({ attachments: ["blade", "dirk"], might: 7 });
    expect(assaultTotal(game, "gearhead")).toBe(4);
    expect(game.p1.resources().power).toMatchObject({ body: 0, fury: 0 });
  });

  test("(b) attacking with both: 7 + Assault 4 = 11 — neither the Dirk's Assault 2 nor Purifier's grants are doubled (807.2 sums them once)", async () => {
    const game = await board().build();
    await equip(game, "blade", "gearhead");
    await equip(game, "dirk", "gearhead");
    await game.p1.move("gearhead", "bf1");
    expect(game.state("gearhead")).toMatchObject({ combatRole: "attacker", might: 11 });
    // 13 (= doubling the Dirk's Assault 2) or 15 (= doubling every Assault) would be wrong.
    expect([13, 15]).not.toContain(game.state("gearhead").might);
  });

  test("(c) comparison — the same two Equipment on a plain 3-Might unit: 3 + 2 + 0 = 5 at rest, 5 + Assault 4 = 9 attacking", async () => {
    const game = await board().build();
    await equip(game, "blade", "plain");
    await equip(game, "dirk", "plain");
    expect(game.state("plain")).toMatchObject({ attachments: ["blade", "dirk"], might: 5 });
    expect(assaultTotal(game, "plain")).toBe(4);
    await game.p1.move("plain", "bf1");
    expect(game.state("plain")).toMatchObject({ combatRole: "attacker", might: 9 });
    // Gearhead, wearing nothing, is a plain 3 with no Assault at all.
    expect(game.state("gearhead")).toMatchObject({ attachments: [], might: 3 });
    expect(assaultTotal(game, "gearhead")).toBe(0);
  });

  test("(d) Angle Shot attaches the Blade to the plain unit → it detaches from Gearhead (434.1.f): Gearhead keeps only the Dirk = 3 (+0 doubled) with Assault 3; Plain = 3 + 2 = 5 (NOT doubled) with Assault 1", async () => {
    const game = await board().build();
    await equip(game, "blade", "gearhead");
    await equip(game, "dirk", "gearhead");
    expect(game.state("gearhead").might).toBe(7);
    await game.p1.cast("shot", { targets: ["plain", "blade"] });
    await game.settle();
    expect(game.zoneOf("shot")).toBe("trash");
    expect(game.state("blade").attachedTo).toBe("plain");
    expect(game.state("dirk").attachedTo).toBe("gearhead");
    expect(game.state("gearhead")).toMatchObject({ attachments: ["dirk"], might: 3 });
    expect(assaultTotal(game, "gearhead")).toBe(3); // Dirk 2 + Purifier 1 (via the Dirk only)
    expect(game.state("plain")).toMatchObject({ attachments: ["blade"], might: 5 });
    expect(assaultTotal(game, "plain")).toBe(1); // Purifier via the Blade
    expect(game.violations()).toEqual([]);
  });

  test("(d) …and attacking together afterwards: Gearhead 3 + Assault 3 = 6, Plain 5 + Assault 1 = 6 — the bonus and Purifier's Assault followed the Blade (137.3.a/435.1.e)", async () => {
    const game = await board().build();
    await equip(game, "blade", "gearhead");
    await equip(game, "dirk", "gearhead");
    await game.p1.cast("shot", { targets: ["plain", "blade"] });
    await game.settle();
    await game.p1.move(["gearhead", "plain"], "bf1");
    expect(game.state("gearhead")).toMatchObject({ combatRole: "attacker", might: 6 });
    expect(game.state("plain")).toMatchObject({ combatRole: "attacker", might: 6 });
  });
});
