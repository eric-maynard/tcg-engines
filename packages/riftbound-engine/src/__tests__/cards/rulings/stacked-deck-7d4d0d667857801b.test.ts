/**
 * Ruling 7d4d0d667857801b — Stacked Deck (OGN-183 → ogn-183-298) · Action [1]
 *     "Look at the top 3 cards of your Main Deck. Put 1 into your hand and recycle the rest."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction [1] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: I Stacked Deck during a showdown and take Gust — can I cast Gust right after Stacked Deck resolves, before my
 *    opponent gets to act?
 * A: No. In a showdown, when a chain started by playing a card closes, Focus passes to the next player in turn
 *    order — they act first. On your own turn in a neutral Open state, by contrast, you get priority back when the
 *    chain closes and could Gust immediately.
 * Rules: 340.2.a / 346–347 (Focus passes when the chain closes in a showdown), 335/309 (turn player acts in
 *        the neutral Open state).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STACKED_DECK = "ogn-183-298";
const GUST = "ogn-169-298";

/**
 * P1's turn with [3]. P2 holds bf1 with a 3-Might Guard (a Gust-sized unit at a battlefield). P1's deck top:
 * Gust, then two vanilla cards. P1 has Stacked Deck in hand and a 4-Might Raider to open a showdown with.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .deck(P1, [GUST, { cardType: "unit", might: 2, name: "Deck Two" }, { cardType: "unit", might: 3, name: "Deck Three" }, { cardType: "unit", might: 5, name: "Deck Four" }], ["gust", "d2", "d3", "d4"])
    .hand(P1, STACKED_DECK, "sdk");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Cast Stacked Deck, both pass, P1 takes Gust from the three revealed cards. */
async function stackedDeckTakesGust(game: Game): Promise<void> {
  await game.p1.cast("sdk");
  expect(game.chain().map((c) => c.cardId)).toEqual(["sdk"]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed", source: { cardId: "sdk" } });
  expect(d.options.map((o) => o.card ?? o.key)).toEqual(["gust", "d2", "d3"]);
  await game.p1.pick("gust");
  expect(game.p1.hand()).toEqual(["gust"]);
  expect(game.zoneOf("sdk")).toBe("trash");
  expect(game.chain()).toEqual([]);
}

describe("Ruling 7d4d0d667857801b — after Stacked Deck closes in a showdown Focus passes; on your own open turn it doesn't", () => {
  test("SHOWDOWN: P1 (attacker, Focus) casts Stacked Deck and takes Gust; when that chain closes Focus has PASSED to P2 — P1 has no action at all (cannot Gust), P2 acts", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await stackedDeckTakesGust(game);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.legal()).toEqual([]);
    expect(game.p1.can("cast", "gust")).toBe(false);
    expect(game.p1.energy()).toBe(2); // it is not a resource problem
    // the other two went to the bottom
    expect(game.p1.deck()[0]).toBe("d4");
  });

  test("SHOWDOWN: only after P2 passes Focus back does P1 get to cast the freshly taken Gust (on the 3-Might Guard)", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await stackedDeckTakesGust(game);
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "guard" });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("hand");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("OWN TURN, neutral Open state: the same Stacked Deck → Gust line works back-to-back — when the chain closes P1 simply has priority again and Gust is legal immediately", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await stackedDeckTakesGust(game);
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "gust")).toBe(true);
    expect(game.p2.legal()).toEqual([]);
    await game.p1.cast("gust", { targets: "guard" });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("hand");
  });
});
