/**
 * Ruling c41f85ab0029252d — Hidden Blade (OGN-213 → ogn-213-298) [Hidden] Action [2][order] "Kill a unit at a battlefield. Its controller
 *   draws 2." × Find Your Center (OGN-047 → ogn-047-298) Action [3] "… Draw 1 and channel 1 rune exhausted."
 *
 * Q: My only unit at a battlefield dies to Hidden Blade during a showdown. Can I play an Action (Find Your Center) I drew off the
 *    Blade before the showdown ends?
 * A: Yes. The showdown doesn't end the instant your last unit dies; after the Blade's chain completes, Focus passes back to you and
 *    you may play action-speed cards (even with no units left) — you keep control of the battlefield while it is contested.
 * Rules: 346–347 (Focus alternates in a showdown), 187.4.c (control persists while contested), 465+ (combat resolves at the end).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const FIND_YOUR_CENTER = "ogn-047-298";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/**
 * P2's turn. P1 holds bf1 with its ONLY unit there, Defender (3); P1 has [3] and an empty hand — the top of P1's deck is Find Your
 * Center then a filler. P2: Attacker (5) in base, Hidden Blade in hand + [2][order].
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Defender" }, "def")
    .unit(P2, "base", { might: 5, name: "Attacker" }, "atk")
    .deck(P1, [FIND_YOUR_CENTER, "ogn-175-298"], ["fyc", "d2"])
    .hand(P2, HIDDEN_BLADE, "blade");
}

/** P2 attacks bf1 and, holding Focus first, casts Hidden Blade on the Defender; both pass → it resolves. */
async function bladeKillsDefender(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("atk", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: true });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("blade", { targets: "def" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("blade")).toBe("trash");
  return game;
}

describe("Ruling c41f85ab0029252d — after Hidden Blade kills my last unit mid-showdown I still get Focus and can play the Action I drew", () => {
  test("Hidden Blade resolves: the Defender dies and P1 draws 2 (Find Your Center + d2); the chain is empty but the SHOWDOWN IS STILL OPEN and bf1 is still P1's", async () => {
    const game = await bladeKillsDefender();
    expect(game.zoneOf("def")).toBe("trash");
    expect(new Set(game.p1.hand())).toEqual(new Set(["fyc", "d2"]));
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 }); // 187.4.c
    expect(game.p2.points()).toBe(0); // nothing conquered yet
  });

  test("Focus passes back to P1 (unit-less), and Find Your Center — an ACTION drawn off the Blade — is legal and resolves: draw 1, channel 1 rune exhausted", async () => {
    const game = await bladeKillsDefender();
    for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
      await game.acting().passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "fyc")).toBe(true);
    const runes0 = game.p1.runes().length;
    await game.p1.cast("fyc");
    expect(game.p1.energy()).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("fyc")).toBe("trash");
    expect(game.p1.hand()).toContain("d2");
    expect(game.p1.hand()).toHaveLength(2); // d2 + the newly drawn card
    expect(game.p1.runes()).toHaveLength(runes0 + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1" }); // still not over
  });

  test("only when everyone then passes does the showdown end: with no defenders left the Attacker conquers bf1", async () => {
    const game = await bladeKillsDefender();
    for (let i = 0; i < 3 && game.actingSeat() !== P1; i++) {
      await game.acting().passFocus();
    }
    await game.p1.cast("fyc");
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
