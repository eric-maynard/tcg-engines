/**
 * Ruling 7e223e49a71fb354 — Gold (SFD-T03 → sfd-t03) gear token "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *   × Noxus Hopeful (ogn-012-298) "[Legion] — I cost [2] less. (Get the effect if you've played another card this turn.)"
 *   × Pit Crew (OGN-091 → ogn-091-298) "When you play a gear, ready me." · Ornn, Forge God (SFD-085 → sfd-085-221)
 *     "I have +1 [Might] for each friendly gear." · (Herald of the Arcane ogn-265-298 = the FAQ's token example)
 *   Gold source used: Eminent Benefactor (sfd-152-221) "When I hold, play two Gold gear tokens exhausted."
 *
 * Q: Does playing a Gold gear token count for the Legion keyword?
 * A: No. Legion asks whether you have played another MAIN DECK CARD this turn; tokens are not cards. A Gold token
 *    IS a gear, so gear-lookers (Pit Crew, Ornn) see it — but it does not switch Legion on.
 * Rules: 738.1.c / 738.1.c.1 (Legion = another Main Deck card played this turn), 186 (tokens are not cards).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOXUS_HOPEFUL = "ogn-012-298"; // 4-cost, Legion: costs 2 less
const PIT_CREW = "ogn-091-298";
const ORNN_FORGE_GOD = "sfd-085-221"; // 4 Might + 1 per friendly gear
const EMINENT_BENEFACTOR = "sfd-152-221";

/**
 * End of P2's turn 2. P1 holds bf1 with Eminent Benefactor (→ two Gold tokens are PLAYED at P1's hold), has Ornn
 * and Pit Crew in base, 3 fury runes already channeled (+2 more at turn start), and in hand: Noxus Hopeful plus a
 * vanilla 1-cost unit.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", EMINENT_BENEFACTOR, "bene")
    .unit(P1, "base", ORNN_FORGE_GOD, "ornn")
    .unit(P1, "base", PIT_CREW, "crew")
    .runes(P1, "fury", 3)
    .hand(P1, NOXUS_HOPEFUL, "hopeful")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Cheap Recruit" }, "cheap");
}

const golds = (game: Game) => game.p1.gear().filter((g) => game.state(g).isToken && game.state(g).name === "Gold");

/** P2 ends → P1's turn 3: the hold trigger plays two Gold tokens; everything settles into P1's main phase. */
async function p1TurnWithGold(): Promise<Game> {
  const game = await board().build();
  expect(game.state("ornn").might).toBe(4);
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  return game;
}

describe("Ruling 7e223e49a71fb354 — Gold tokens are gear but not Main Deck cards: no Legion", () => {
  test("the hold PLAYS two Gold gear tokens (exhausted) into P1's base — and gear-lookers notice: Pit Crew's 'when you play a gear' triggered for each, Ornn counts them (+2 Might)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    // Benefactor's hold trigger, then (after it resolves) one Pit Crew trigger per Gold played.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bene", triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.acceptTriggerOrder();
    expect(golds(game)).toHaveLength(2);
    expect(golds(game).every((g) => game.state(g).isExhausted)).toBe(true);
    expect(game.chain().filter((c) => c.cardId === "crew" && c.triggered)).toHaveLength(2);
    expect(game.state("ornn").might).toBe(6);
    await game.settle();
    expect(game.phase()).toBe("main");
  });

  test("yet the game's 'cards played this turn' for P1 is still ZERO after the two Gold plays — tokens are not Main Deck cards", async () => {
    const game = await p1TurnWithGold();
    expect(golds(game)).toHaveLength(2);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
  });

  test("so Legion is OFF: with exactly [2] Noxus Hopeful (4, 'Legion — I cost [2] less') is NOT playable despite the two Gold tokens having been played this turn", async () => {
    const game = await p1TurnWithGold();
    await game.p1.tapRunes(2);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "hopeful")).toBe(false);
    const r = await game.p1.try((p) => p.play("hopeful", { to: "base" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("hopeful")).toBe("hand");
  });

  test("contrast: after P1 plays a real Main Deck card (the 1-cost unit), Legion turns on and Hopeful IS playable for [2]", async () => {
    const game = await p1TurnWithGold();
    await game.p1.tapRunes(3);
    await game.p1.play("cheap", { to: "base" });
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "hopeful")).toBe(true);
    await game.p1.play("hopeful", { to: "base" });
    expect(game.p1.energy()).toBe(0); // paid 2, not 4
    await game.settle();
    expect(game.zoneOf("hopeful")).toBe("base");
  });
});
