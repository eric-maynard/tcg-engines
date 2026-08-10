/**
 * Ruling c233bb45831e2a3c — Fiora, Victorious (OGN-232 → ogn-232-298) · Champion Unit · Order · 4 · 4 Might
 *   "While I'm [Mighty], I have [Deflect], [Ganking], and [Shield]. (I'm Mighty while I have 5+ [Might].)"
 *   × Forbidding Waste (UNL-210 → unl-210-219) · Battlefield
 *   "While a unit here is defending alone, it has -2 [Might]."
 *   (equipment: Doran's Blade sfd-095-221 · "+2 [Might]")
 *
 * Q: Fiora with a +2 Equipment defends alone at the Forbidding Waste — does she keep being Mighty?
 * A: Yes, she ends at 5: increases first (4 + 2 equipment + 1 Shield = 7), then decreases (− 2 Waste = 5). She was
 *    already Mighty (6) before defending, so Shield is live and its +1 counts; at 5 she stays Mighty and keeps Deflect,
 *    Ganking and Shield.
 * Rules: 476–478 (arithmetic layer: all increases before all decreases), 741 (alone), 726 (Shield), 730 (Mighty = 5+).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA = "ogn-232-298";
const FORBIDDING_WASTE = "unl-210-219";
const DORANS_BLADE = "sfd-095-221";

/** P2's turn. P1 holds the LIVE Forbidding Waste with Fiora alone, wearing Doran's Blade (+2). P2's Raider (4) attacks from base. */
function board(raiderMight = 4) {
  return scenario()
    .active(P2)
    .battlefield("waste", { controller: P1, def: FORBIDDING_WASTE, inert: false })
    .unit(P1, "waste", FIORA, "fiora", { equippedWith: ["blade"] })
    .card("blade", { def: DORANS_BLADE, meta: { attachedTo: "fiora" }, owner: P1, zone: "waste" })
    .unit(P2, "base", { might: raiderMight, name: "Raider" }, "raider");
}

async function raiderAttacks(raiderMight = 4): Promise<Game> {
  const game = await board(raiderMight).build();
  await game.p2.move("raider", "waste");
  expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "waste", isCombatShowdown: true });
  return game;
}

describe("Ruling c233bb45831e2a3c — Fiora + 2 defending alone at the Forbidding Waste stays Mighty at 5", () => {
  test("before combat: 4 + 2 (Blade) = 6 → Mighty, so she already has Deflect, Ganking and Shield; not defending, so no Waste penalty and no Shield bonus yet", async () => {
    const game = await board().build();
    expect(game.state("fiora")).toMatchObject({ attachments: ["blade"], baseMight: 4, might: 6 });
    expect(game.state("fiora").keywords).toEqual(expect.arrayContaining(["Deflect", "Ganking", "Shield"]));
    expect(game.state("fiora").combatRole).not.toBe("defender");
  });

  test("defending ALONE at the Waste: increases first (4 + 2 + 1 Shield = 7), then − 2 = 5 — she is a 5-Might defender, still Mighty, still holding Deflect / Ganking / Shield", async () => {
    const game = await raiderAttacks();
    expect(game.p1.units("waste")).toEqual(["fiora"]); // alone
    expect(game.state("fiora").combatRole).toBe("defender");
    expect(game.state("fiora").might).toBe(5);
    expect(game.state("fiora").keywords).toEqual(expect.arrayContaining(["Deflect", "Ganking", "Shield"]));
  });

  test("it holds up through combat: the 4-Might Raider deals 4 < 5 and dies to her 5; Fiora survives undamaged (healed) and P1 keeps the Waste", async () => {
    const game = await raiderAttacks(4);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("fiora")).toMatchObject({ damage: 0, location: "waste", zone: "battlefield-waste" });
    expect(game.gameState.battlefields.waste?.controller).toBe(P1);
    // out of combat again: back to 6, no Waste penalty, no Shield bonus
    expect(game.state("fiora").might).toBe(6);
    expect(game.violations()).toEqual([]);
  });

  test("and 5 really is her number: a 5-Might Raider trades with her (5 lethal on a 5-Might Fiora; her 5 kills it)", async () => {
    const game = await raiderAttacks(5);
    expect(game.state("fiora").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("fiora")).toBe("trash");
  });
});
