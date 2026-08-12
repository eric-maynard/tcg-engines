/**
 * Ruling 2bac19339331c40b — Draven, Audacious (SFD-148 → sfd-148-221) · 6 + [chaos] · 6 Might
 *   "[Deflect] — The first time I win a combat each turn, you score 1 point.
 *    When I die in combat, choose an opponent. They score 1 point."
 *   × Rune Prison (OGN-050 → ogn-050-298) · Action · [2][calm] "Stun a unit."
 *
 * Q: I defend with Draven and stun the bigger attacking unit, then let combat resolve. Do I win the
 *    combat and score a point?
 * A: Yes. A stunned attacker deals no combat damage but stays present through the damage step; with
 *    Draven surviving, combat cleanup recalls the attacker to its owner's base, only P1's units are
 *    left, and P1 wins the combat — which fires Draven's "first time I win a combat" point.
 * Rules: 423.1.b (a stunned unit deals no combat damage), 461.1 (combat cleanup: heal, then recall
 *        the attacker when defenders remain), 461.3.a / 466.5 (the side left standing wins).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN = "sfd-148-221";
const RUNE_PRISON = "ogn-050-298";

/**
 * P2's turn. P1 holds bf1 with Draven (6 Might) and has Rune Prison plus exactly [2][calm].
 * P2's 10-Might Brute — which would otherwise flatten Draven — walks in from base.
 */
function board() {
  return scenario()
    .active(P2)
    .victoryScore(20)
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", DRAVEN, "draven")
    .unit(P2, "base", { might: 10, name: "Brute" }, "brute")
    .hand(P1, RUNE_PRISON, "prison");
}

/** The Brute attacks; P1 answers with Rune Prison on it and lets the chain empty (showdown still open). */
async function stunnedAttacker(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("brute", "bf1");
  expect(game.state("brute").combatRole).toBe("attacker");
  expect(game.state("draven").combatRole).toBe("defender");
  await game.p2.passFocus();
  expect(game.actingSeat()).toBe(P1);
  await game.p1.cast("prison", { targets: "brute" });
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
  expect(game.state("brute").isStunned).toBe(true);
  return game;
}

describe("Ruling 2bac19339331c40b — a stunned attacker still loses the combat to the surviving defender", () => {
  test("control: without the stun the 10-Might Brute kills Draven and conquers bf1", async () => {
    const game = await board().build();
    await game.p2.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("the stun lands while the showdown is open, and the Brute is still ON the battlefield for the damage step", async () => {
    const game = await stunnedAttacker();
    expect(game.locationOf("brute")).toBe("bf1");
    expect(game.state("brute").combatRole).toBe("attacker");
    expect(game.zoneOf("prison")).toBe("trash");
  });

  test("combat resolves: the stunned Brute deals nothing, Draven survives undamaged and P1 keeps bf1; the Brute is recalled to its owner's base", async () => {
    const game = await stunnedAttacker();
    await game.settle();
    expect(game.zoneOf("draven")).toBe("battlefield-bf1");
    expect(game.state("draven").damage).toBe(0); // healed in combat cleanup, and nothing was dealt
    expect(game.zoneOf("brute")).toBe("base");
    expect(game.p2.base()).toContain("brute");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // Expected (461.3.a + Draven's own text): P1 is the winner of that combat, so "The first time I
  // win a combat each turn, you score 1 point" fires and P1 goes to 1 point.
  // Actual: no win-combat event is emitted for a defender who simply survives, so Draven's trigger
  // never reaches the chain and P1 stays on 0.
  test.failing(
    "BUG: ruling 2bac19339331c40b — Draven wins the combat but his 'first time I win a combat' point never fires (P1 stays on 0)",
    async () => {
      const game = await stunnedAttacker();
      await game.settle();
      expect(game.zoneOf("draven")).toBe("battlefield-bf1");
      expect(game.p1.points()).toBe(1);
    },
  );
});
