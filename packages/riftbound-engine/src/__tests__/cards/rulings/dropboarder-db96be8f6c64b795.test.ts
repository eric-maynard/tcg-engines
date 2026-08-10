/**
 * Ruling db96be8f6c64b795 — Dropboarder (SFD-072 → sfd-072-221) · Unit · Mind · 4 · 4 Might
 *     "When you play me, if you control two or more gear, ready me."
 *   × Doran's Shield (SFD-033 → sfd-033-221) · Equipment · +1 Might · "[Equip] [calm] … [Tank] (I must be assigned combat damage first.)"
 *
 * Q: Does a unit with Tank (Dropboarder wearing Doran's Shield) still get the +1 Might from the Shield even though Tank
 *    changes how combat damage is assigned to it?
 * A: Yes. An Equipment's Might bonus is separate from its effect text and is always granted to the equipped unit;
 *    Tank only orders combat-damage assignment.
 * Rules: 144.3 / 716 (Equipment Might bonus), 727 (Tank).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DROPBOARDER = "sfd-072-221";
const DORANS_SHIELD = "sfd-033-221";

/** P2's turn. P1 holds bf1 with Dropboarder wearing Doran's Shield next to a vanilla 2-Might Buddy; P2's 4-Might Raider in base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", DROPBOARDER, "drop", { equippedWith: ["shield"] })
    .card("shield", { def: DORANS_SHIELD, meta: { attachedTo: "drop" }, owner: P1, zone: "bf1" })
    .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider");
}

describe("Ruling db96be8f6c64b795 — Doran's Shield gives BOTH Tank and its +1 Might", () => {
  test("static state: Dropboarder wearing Doran's Shield is 5 Might (4 + 1) AND has Tank", async () => {
    const game = await board().build();
    const s = game.state("drop");
    expect(s.attachments).toEqual(["shield"]);
    expect(s.baseMight).toBe(4);
    expect(s.might).toBe(5);
    expect(s.keywords).toContain("Tank");
  });

  test("in combat the +1 is real: a 4-Might Raider attacks; Tank forces its 4 onto Dropboarder first (Buddy untouched), 4 < 5 so Dropboarder survives while dealing lethal back — Raider dies, bf1 stays P1's", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.state("drop")).toMatchObject({ combatRole: "defender", might: 5 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("drop")).toBe("battlefield-bf1");
    expect(game.zoneOf("buddy")).toBe("battlefield-bf1");
    const combatHits = (game.gameState.damageLog ?? []).filter((r) => r.combat && (r.target === "drop" || r.target === "buddy"));
    expect(combatHits.every((r) => r.target === "drop")).toBe(true); // Tank: assigned to Dropboarder first (all 4 of it)
    expect(game.state("drop").damage).toBe(0); // survivors are healed after combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without the Shield a 4-Might attacker trades with the bare 4-Might Dropboarder (both die): the survival above came from the +1", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", DROPBOARDER, "drop")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    expect(game.state("drop").might).toBe(4);
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("drop")).toBe("trash");
  });
});
