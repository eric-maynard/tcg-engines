/**
 * Ruling 854aefc896879c55 — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · [2][chaos] · Action
 *     "Move a friendly unit and ready it."
 *   × Charm (OGN-043 → ogn-043-298) · Spell · Calm · [1][calm] — "Move an enemy unit."
 *
 * Q: If I pull the opponent's unit off a battlefield on my turn and then put it back, do they score it AGAIN even
 *    though they already scored that battlefield on their own turn?
 * A: Yes. "Each battlefield may be scored once per turn" is a per-TURN ledger; it resets when the turn does. Their
 *    hold on their own turn and their re-conquer on your turn are two different turns, so both score.
 * Rules: 471.2 (a player scores each battlefield at most once per turn; the ledger is per turn),
 *        323.6 (an emptied battlefield becomes uncontrolled at the Cleanup), 348.2.a (a non-combat showdown closing
 *        with one player's units there establishes control = Conquer, on whoever's turn it is).
 *
 * Reconstruction note: the question names Ride the Wind for the return leg, but Ride the Wind can only choose a
 * FRIENDLY unit (asserted below), so both legs of the opponent's unit are done with Charm here.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const CHARM = "ogn-043-298";

/** Turn 2, P1 active, high Victory Score. P2 holds bfA with its lone 3-Might Holder. P1 has three Charms and a big
 *  rune pool to pay them, plus Ride the Wind. */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .victoryScore(20)
    .battlefield("bfA", { controller: P2 })
    .unit(P2, "bfA", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 1, name: "Pawn" }, "pawn")
    .runes(P1, "calm", 8)
    .hand(P1, CHARM, "charm1")
    .hand(P1, CHARM, "charm2")
    .hand(P1, CHARM, "charm3")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Let P2 take a turn (their Hold of bfA scores), then hand the turn back to P1. */
async function throughP2sTurn(game: Game): Promise<void> {
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.p2.points()).toBe(1);
  expect(game.gameState.scoredThisTurn[P2] ?? []).toContain("bfA");
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.gameState.scoredThisTurn[P2] ?? []).toEqual([]); // the ledger reset with the turn
}

/** Pay [1][calm] out of P1's runes and Charm the Holder to `where`, settling the staged showdown out. */
async function charmHolder(game: Game, card: string): Promise<void> {
  await game.p1.tapRunes(1);
  await game.p1.recycleRune({ domain: "calm" });
  await game.p1.cast(card, { targets: "holder" });
  await game.settle();
  await game.settle(); // a Cleanup-begun non-combat showdown is handed back once
}

describe("Ruling 854aefc896879c55 — the opponent can score the same battlefield again, on your turn", () => {
  test("premise: Ride the Wind cannot do the return leg on an enemy unit — 'a friendly unit' never offers the opponent's Holder", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bfA", { controller: P2 })
      .unit(P2, "bfA", { might: 3, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 1, name: "Pawn" }, "pawn")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    const targets = (game.p1.option("cast", "rtw")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toEqual(["pawn"]);
    expect((await game.p1.try((p) => p.cast("rtw", { targets: "holder" }))).ok).toBe(false);
  });

  test("premise: P2 scores bfA by HOLD on their own turn, and the per-turn score ledger clears when P1's turn begins", async () => {
    const game = await board().build();
    await throughP2sTurn(game);
    expect(game.p2.points()).toBe(1);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P2);
  });

  test("pulling the lone Holder off bfA on P1's turn costs P2 the battlefield (and no points move)", async () => {
    const game = await board().build();
    await throughP2sTurn(game);
    await charmHolder(game, "charm1");
    expect(game.locationOf("holder")).toBe("base");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: null });
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
  });

  test("ruling: Charming it BACK on P1's turn re-establishes P2's control — a Conquer that SCORES again, even though P2 already scored bfA on their own turn", async () => {
    const game = await board().build();
    await throughP2sTurn(game);
    await charmHolder(game, "charm1");
    await charmHolder(game, "charm2");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.locationOf("holder")).toBe("bfA");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(2);
    expect(game.gameState.scoredThisTurn[P2] ?? []).toContain("bfA");
    expect(game.violations()).toEqual([]);
  });

  test("ruling nuance: but only ONCE per turn — a second off-and-back cycle in the same P1 turn gives P2 no further point", async () => {
    const game = await board().build();
    await throughP2sTurn(game);
    await charmHolder(game, "charm1");
    await charmHolder(game, "charm2");
    expect(game.p2.points()).toBe(2);
    await game.p1.tapRunes(1);
    await game.p1.recycleRune({ domain: "calm" });
    await game.p1.cast("charm3", { targets: "holder" });
    await game.settle();
    await game.settle();
    expect(game.locationOf("holder")).toBe("base");
    expect(game.p2.points()).toBe(2);
  });
});
