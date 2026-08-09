/**
 * Purifier — sfd-183-221 · Legend (Lucian) · Fury/Body
 *
 *   Your Equipment each give [Assault]. (+1 [Might] while equipped unit is an attacker.)
 *
 * Rules: 807 (Assault: passive, "+X Might while I am an attacker"; X omitted = 1; multiple grants SUM,
 * 807.2), 818.3 (Equipped = a unit with one or more Equipment attached), 137.3 / 718 (what an attached
 * Equipment "gives" goes to its Top-Most card, and only while attached), 459 (attacker/defender
 * designations exist only during a combat), 522 (statics apply continuously — no chain item).
 *
 * Head-judge checklist — trickiest situations for THIS card:
 *  1. The Assault must land on the EQUIPPED UNIT, not sit on the gear: a Dirk (+0) wearer attacking a
 *     same-size defender must win 4 v 3 (probed: the engine tags the Equipment card with "Assault" and
 *     the wearer fights at 3 → BUG).
 *  2. Attacker only: the same wearer DEFENDING gets nothing (trade 3 v 3).
 *  3. "each": two Equipment on one unit = Assault 2 (807.2); a wearer with printed Assault stacks to 2.
 *  4. Only while attached: an unattached Equipment in base gives nobody anything.
 *  5. "Your Equipment": the opponent's equipped attacker gets no Assault from my legend.
 *  6. Static, not triggered: equipping / attacking under Purifier adds no chain item of its own.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-183-221";
const DIRK = "sfd-009-221"; // Serrated Dirk — Fury Equipment, +0 Might, [Equip] [fury]
const SHIELD = "sfd-033-221"; // Doran's Shield — Calm Equipment, +1 Might, [Equip] [calm]

/** P1 (Purifier) with a 3-Might Gunner + unattached Dirk in base; P2 holds bf1 with a 3-Might Guard. */
function board() {
  return scenario()
    .legend(P1, CARD, "lucian")
    .resources(P1, { energy: 0, power: { calm: 1, fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", { might: 3, name: "Gunner" }, "gunner")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Reserve" }, "reserve")
    .gear(P1, DIRK, "dirk");
}

async function equip(game: Game, equipment: string, unit: string): Promise<void> {
  await game.p1.choose("equipCard", { params: { equipmentId: equipment, unitId: unit } });
  await game.settle();
  expect(game.state(equipment).attachedTo).toBe(unit);
}

describe("Purifier (sfd-183-221)", () => {
  test("registry payload: a single STATIC ability granting the Assault keyword, scoped to my (friendly) Equipment", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Lucian", domain: ["fury", "body"], name: "Purifier" });
    expect(def?.abilities).toHaveLength(1);
    const [ability] = (def?.abilities ?? []) as { type: string; effect?: { type?: string; keyword?: string; target?: { controller?: string } } }[];
    expect(ability).toMatchObject({ effect: { keyword: "Assault", type: "grant-keyword" }, type: "static" });
    expect(ability?.effect?.target?.controller).toBe("friendly");
    expect(JSON.stringify(ability?.effect?.target)).toMatch(/gear|equipment/i);
  });

  test("static, not triggered: equipping the Dirk under Purifier resolves exactly one chain item (the Equip) and attacking adds none", async () => {
    const game = await board().build();
    await game.p1.choose("equipCard", { params: { equipmentId: "dirk", unitId: "gunner" } });
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    await game.p1.move("gunner", "bf1");
    expect(game.chain().filter((c) => c.cardId === "lucian")).toEqual([]);
  });

  test("only while attached: with the Dirk lying unattached in base the Gunner attacks at a plain 3 and trades with the Guard", async () => {
    const game = await board().build();
    await game.p1.move("gunner", "bf1");
    expect(game.state("gunner")).toMatchObject({ combatRole: "attacker", might: 3 });
    await game.settle();
    expect(game.zoneOf("gunner")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("attacker only: the Dirk-wearing Gunner DEFENDING bf2 gets no bonus — a 3-Might attacker trades with it", async () => {
    const game = await board().unit(P1, "bf2", { might: 3, name: "Holder" }, "holder").build();
    await equip(game, "dirk", "holder");
    await game.advanceTurn(); // → P2
    await game.p2.move("reserve", "bf2");
    expect(game.state("holder")).toMatchObject({ combatRole: "defender", might: 3 });
    await game.settle();
    expect(game.zoneOf("reserve")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("trash");
  });

  test("'YOUR Equipment': the opponent's Dirk-wearing attacker gets nothing from my legend (3 v 3 trade at my battlefield)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .legend(P1, CARD, "lucian")
      .resources(P2, { power: { fury: 1 } })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 3, name: "Reserve" }, "reserve")
      .gear(P2, DIRK, "theirDirk")
      .build();
    await game.p2.choose("equipCard", { params: { equipmentId: "theirDirk", unitId: "reserve" } });
    await game.settle();
    expect(game.state("theirDirk").attachedTo).toBe("reserve");
    await game.p2.move("reserve", "bf2");
    expect(game.state("reserve")).toMatchObject({ combatRole: "attacker", might: 3 });
    await game.settle();
    expect(game.zoneOf("reserve")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.p2.points()).toBe(0);
  });

  test("the equipped unit HAS Assault — a Dirk (+0) wearer shows Assault 1 among its keywords even before combat", async () => {
    // Expected: gunner.keywords includes "Assault" (value 1) once the Dirk is attached; the Dirk itself is not a unit and has no use for it.
    // Actual: "Assault" is granted to the Dirk card; the Gunner's keyword list stays empty.
    const game = await board().build();
    await equip(game, "dirk", "gunner");
    expect(game.state("gunner").keywords).toContain("Assault");
    expect(game.state("gunner").might).toBe(3); // Assault is not a flat Might bonus
  });

  test("the payoff — Dirk-wearing Gunner attacks at 3 + 1 = 4, kills the 3-Might Guard, survives and conquers bf1", async () => {
    // Expected (807.1.c): +1 Might while attacker → 4 v 3, Guard dies, Gunner lives, P1 scores bf1.
    // Actual: fights at 3, both die, no conquer.
    const game = await board().build();
    await equip(game, "dirk", "gunner");
    expect(game.state("gunner").might).toBe(3); // no bonus outside combat
    await game.p1.move("gunner", "bf1");
    expect(game.state("gunner")).toMatchObject({ combatRole: "attacker", might: 4 });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("gunner")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("'each' — two Equipment on one unit give Assault twice (807.2): Dirk (+0) + Shield (+1) → 3 + 1 + 2 = 6 while attacking", async () => {
    // Expected: 3 base + 1 (Shield bonus) = 4 at rest; attacking: + Assault 2 = 6.
    // Actual: 4 while attacking (no Assault reaches the unit).
    const game = await board().gear(P1, SHIELD, "shield").build();
    await equip(game, "dirk", "gunner");
    await equip(game, "shield", "gunner");
    expect(game.state("gunner")).toMatchObject({ attachments: ["dirk", "shield"], might: 4 });
    await game.p1.move("gunner", "bf1");
    expect(game.state("gunner")).toMatchObject({ combatRole: "attacker", might: 6 });
  });

  test("stacks with printed Assault (807.2): an Assault Gunner wearing the Dirk attacks with Assault 2 → 3 + 2 = 5", async () => {
    // Expected: printed Assault (1) + Purifier's granted Assault via the Dirk (1) = Assault 2 → 5 while attacking.
    // Actual: only the printed Assault applies → 4.
    const game = await board().unit(P1, "base", { keywords: ["Assault"], might: 3, name: "Ace" }, "ace").build();
    await equip(game, "dirk", "ace");
    await game.p1.move("ace", "bf1");
    expect(game.state("ace")).toMatchObject({ combatRole: "attacker", might: 5 });
  });
});
