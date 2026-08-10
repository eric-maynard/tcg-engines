/**
 * Ruling a1bbe536e8a210c7 — Mageseeker Warden (OGN-070 → ogn-070-298) · 5 Might
 *     "While I'm at a battlefield, opponents can only play units to their base. While I'm at a battlefield, spells and
 *      abilities can't ready enemy units and gear."
 *   × Darius, Trifarian (OGN-027 → ogn-027-298) · 5 Might · "When you play your second card in a turn, give me +2 [Might]
 *     this turn and ready me."
 *   Spells: Vengeance (ogn-229-298, "Kill a unit.") / Falling Star (ogn-029-298, "Deal 3 to a unit. Deal 3 to a unit.").
 *
 * Q: Opponent's Warden is at a battlefield. I play Darius, then kill the Warden with a damage spell or a kill spell as
 *    my second card. Does Darius untap?
 * A: Yes, in both cases. Darius's trigger goes on the chain when the spell has been played; by the time it resolves the
 *    Warden is already dead (killed outright, or by Cleanup from lethal damage), so nothing stops the ready. (Were the
 *    Warden still there, Darius would still get +2 but not ready.)
 * Rules: 383 (triggered ability → chain, resolves later), 322–323 (Cleanup kills lethally damaged units before the
 *        trigger resolves), 361/522 (a static applies only while its source is on the board at a battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MAGESEEKER = "ogn-070-298";
const DARIUS = "ogn-027-298";
const VENGEANCE = "ogn-229-298";
const FALLING_STAR = "ogn-029-298";

/** P1's turn. P2's Warden (5) at P2's bf1 (+ a Pawn so P2 keeps bf1). P1: Darius + the spell in hand, exact resources. */
function board(spell: string, res: { energy: number; power: Record<string, number> }) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", MAGESEEKER, "warden")
    .unit(P2, "bf1", { might: 2, name: "Pawn" }, "pawn")
    .hand(P1, DARIUS, "darius")
    .hand(P1, spell, "spell")
    .resources(P1, res);
}

/** Play Darius (card #1, enters exhausted), then cast the spell at the Warden (card #2); stop with the spell on the chain. */
async function dariusThenSpell(spell: string, res: { energy: number; power: Record<string, number> }, targets: string | string[]): Promise<Game> {
  const game = await board(spell, res).build();
  await game.p1.play("darius");
  await game.settle();
  expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5, zone: "base" });
  expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 1 });
  await game.p1.cast("spell", { targets });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spell", controller: P1 })]);
  expect(game.chain().some((c) => c.cardId === "darius")).toBe(false); // not yet: the spell has not been "played" until it resolves
  return game;
}

describe("Ruling a1bbe536e8a210c7 — Darius readies off the spell that kills Mageseeker Warden (kill spell or damage spell)", () => {
  test("kill spell (Vengeance): the spell resolves and kills the Warden; THEN Darius's trigger is on the chain with the Warden already in the trash", async () => {
    const game = await dariusThenSpell(VENGEANCE, { energy: 9, power: { fury: 1, order: 2 } }, "warden");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Vengeance resolves
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 }); // +2 AND readied
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("damage spell (Falling Star, 3 + 3 to the Warden): lethal damage is marked, Cleanup kills the Warden, and only then does Darius's trigger resolve — +2 and readied", async () => {
    const game = await dariusThenSpell(FALLING_STAR, { energy: 7, power: { fury: 3 } }, ["warden", "warden"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Falling Star resolves → 6 on a 5 → dead at Cleanup
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", triggered: true })]);
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if the second card leaves the Warden alive at bf1 (Falling Star split 3/3 onto Warden and Pawn), Darius still gets +2 but is NOT readied", async () => {
    const game = await dariusThenSpell(FALLING_STAR, { energy: 7, power: { fury: 3 } }, ["warden", "pawn"]);
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.state("warden")).toMatchObject({ damage: 3, zone: "battlefield-bf1" }); // alive, at a battlefield
    expect(game.chain()).toEqual([]);
    expect(game.state("darius").might).toBe(7); // the Might half is not a "ready"
    expect(game.state("darius").isExhausted).toBe(true); // "spells and abilities can't ready enemy units"
  });
});
