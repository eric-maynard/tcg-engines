/**
 * Interaction: the second player's one-off extra rune (rule 485.7 / 486.7) × Obelisk of Power
 *
 *   Obelisk of Power (ogn-284-298, Battlefield)
 *     "At the start of each player's first Beginning Phase, that player channels 1 rune."
 *   Loose Cannon (ogn-251-298, Legend — seat 1, going first)
 *     "At start of your Beginning Phase, draw 1 if you have one or fewer cards in your hand."
 *   Relentless Storm (ogn-249-298, Legend — seat 2, going second)
 *     "When you play a [Mighty] unit, you may exhaust me to channel 1 rune exhausted."
 *
 * Rules: 118 (First Player takes the first turn), 115.2 + 485.7/486.7 (the player going
 * SECOND channels one extra rune during their FIRST Channel Phase of the game — once),
 * 315.2.a.1 (start-of-Beginning-Phase effects), 315.3 / 430.4.a (Turn Player channels 2 in
 * their Channel Phase).
 *
 * Question: with Obelisk of Power in play, are the rune totals after each Channel Phase
 *   S1T1 = 1 (Obelisk) + 2 = 3, S2T1 = 1 (Obelisk) + 2 + 1 (485.7) = 4, S1T2 = 5, S2T2 = 6?
 * i.e. seat 1 never gets the 485.7 rune, seat 2 gets it exactly once, and it stacks with (is
 * neither replaced nor consumed by) Obelisk's separate Beginning-Phase channel. Edge: seat 2's
 * Relentless Storm channelling an extra exhausted rune on its first turn is an unrelated
 * trigger — the 485.7 flag is still spent after seat 2's first Channel Phase and never
 * migrates to seat 1.
 *
 * The 485.7 bookkeeping is written during real game setup, so this file uses the harness'
 * constructed-deck entry point (`Game.fromDecks`, P1 = first player) rather than `scenario()`.
 */
import { describe, expect, test } from "bun:test";
import { Game, P1, P2, basicRuneDef, loadDefaultCardPool } from "../../../harness";

const OBELISK_OF_POWER = "ogn-284-298";
const LOOSE_CANNON = "ogn-251-298";
const RELENTLESS_STORM = "ogn-249-298";
const TRIFARIAN_WAR_CAMP = "ogn-294-298"; // second battlefield: "+1 Might here" — no rune interaction
const SHIPYARD_SKULKER = "ogn-175-298"; // vanilla 3-might filler
const CAPTAIN_FARRON = "ogn-015-298"; // 5 Might (Mighty), cost 4 + [fury] — Relentless Storm bait

/** Fresh duel: seat 1 (Loose Cannon) goes first and brought Obelisk; seat 2 (Relentless Storm) second. */
async function board(): Promise<Game> {
  const pool = await loadDefaultCardPool();
  const rune = basicRuneDef(pool, "fury").id as string;
  const game = await Game.fromDecks({
    p1: {
      battlefieldIds: [OBELISK_OF_POWER],
      legendId: LOOSE_CANNON,
      mainDeckCardIds: Array(40).fill(SHIPYARD_SKULKER) as string[],
      runeDeckCardIds: Array(12).fill(rune) as string[],
    },
    p2: {
      battlefieldIds: [TRIFARIAN_WAR_CAMP],
      legendId: RELENTLESS_STORM,
      mainDeckCardIds: Array(40).fill(CAPTAIN_FARRON) as string[],
      runeDeckCardIds: Array(12).fill(rune) as string[],
    },
    seed: "obelisk-485-7",
  });
  return game;
}

describe("485.7 second-player extra rune × Obelisk of Power (Loose Cannon first, Relentless Storm second)", () => {
  test("seat 1's first Beginning Phase: Obelisk's trigger (and Loose Cannon's) go on the chain BEFORE any rune is channeled", async () => {
    const game = await board();
    expect(game.turnNumber()).toBe(1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    const names = game.chain().map((i) => i.name).sort();
    expect(names).toEqual(["Loose Cannon", "Obelisk of Power"]);
    // Two simultaneous P1-controlled triggers → P1 is offered their order (383.3.d).
    expect(game.decision()?.kind).toBe("order");
    expect(game.decision()?.seat).toBe(P1);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(12);
  });

  test("S1T1: Obelisk +1 then Channel 2 → seat 1 has exactly 3 runes (no 485.7 bonus for the player going first)", async () => {
    const game = await board();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runeDeck()).toHaveLength(9);
    expect(game.p2.runes()).toHaveLength(0);
    expect(game.p2.runeDeck()).toHaveLength(12);
    expect(game.chain()).toEqual([]);
  });

  test("S2T1: Obelisk fires for seat 2's first Beginning Phase too (chain item, rune goes to seat 2), then Channel 2 + 1 (485.7) → 4 runes", async () => {
    const game = await board();
    await game.settle();
    await game.p1.endTurn();
    // Seat 2's Beginning Phase: Obelisk's once-per-PLAYER trigger is pending for seat 2.
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(2);
    expect(game.phase()).toBe("beginning");
    expect(game.chain().map((i) => i.name)).toEqual(["Obelisk of Power"]);
    expect(game.chain()[0]?.controller).toBe(P2);
    expect(game.p2.runes()).toHaveLength(0); // nothing channeled before the trigger resolves

    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p2.runes()).toHaveLength(4); // 1 (Obelisk) + 2 (430.4.a) + 1 (485.7) — stacked, not collapsed
    expect(game.p2.runeDeck()).toHaveLength(8);
    expect(game.p2.runes({ ready: true })).toHaveLength(4);
    expect(game.p1.runes()).toHaveLength(3); // seat 1 untouched
    expect(game.chain()).toEqual([]); // the 485.7 rune is a game rule, not a chain item
  });

  test("S1T2 = 5 and S2T2 = 6: neither Obelisk ('first Beginning Phase' only) nor 485.7 ('first Channel Phase' only) repeats", async () => {
    const game = await board();
    await game.settle();
    await game.advanceTurn(); // → S2T1
    expect(game.p2.runes()).toHaveLength(4);

    await game.p2.endTurn(); // → S1T2 Beginning Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBe(3);
    // Only Loose Cannon's every-turn trigger; Obelisk does not fire a second time for seat 1.
    expect(game.chain().map((i) => i.name)).toEqual(["Loose Cannon"]);
    await game.settle();
    expect(game.p1.runes()).toHaveLength(5); // 3 + 2, no 485.7 for seat 1 ever
    expect(game.p1.runeDeck()).toHaveLength(7);

    await game.p1.endTurn(); // → S2T2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(4);
    expect(game.chain()).toEqual([]); // no Obelisk for seat 2's second Beginning Phase
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p2.runes()).toHaveLength(6); // 4 + 2, the 485.7 bonus does not repeat
    expect(game.p2.runeDeck()).toHaveLength(6);

    // One more lap for good measure: S1T3 = 7.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(7);
    expect(game.violations()).toEqual([]);
  });

  test("edge: Relentless Storm's optional channel on seat 2's first turn is a separate trigger — S2T1 ends at 5 (1 exhausted), then S1T2 = 5, S2T2 = 7", async () => {
    const game = await board();
    await game.settle();
    await game.advanceTurn(); // → S2T1, 4 runes
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(4);

    // Play a Mighty unit (Captain Farron, 5 Might). Resources via the escape hatch so the
    // rune count on board stays the quantity under test.
    await game.p2.do("addResources", { energy: 4, power: { fury: 1 } });
    const farron = game.p2.hand()[0] as string;
    await game.p2.play(farron, { to: "base" });
    await game.settle(); // hands back Relentless Storm's "you may exhaust me" prompt
    expect(game.decision()?.kind).toBe("yes-no");
    expect(game.decision()?.seat).toBe(P2);
    await game.p2.yes();
    await game.settle();
    expect(game.state(game.p2.legend() as string).isExhausted).toBe(true);
    expect(game.p2.runes()).toHaveLength(5); // 4 + 1 from the legend
    expect(game.p2.runes({ ready: false })).toHaveLength(1); // the legend's rune enters exhausted
    expect(game.p2.runeDeck()).toHaveLength(7);

    await game.advanceTurn(); // → S1T2
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(5); // 3 + 2: the 485.7 flag never migrates to seat 1
    expect(game.p1.runeDeck()).toHaveLength(7);

    await game.advanceTurn(); // → S2T2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(7); // 5 + 2: bonus spent in the first Channel Phase, not re-armed
    expect(game.p2.runeDeck()).toHaveLength(5);
    expect(game.violations()).toEqual([]);
  });
});
