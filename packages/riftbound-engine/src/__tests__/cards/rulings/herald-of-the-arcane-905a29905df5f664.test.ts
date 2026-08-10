/**
 * Ruling 905a29905df5f664 — Herald of the Arcane (OGN-265 → ogn-265-298) · Legend (Viktor)
 *   "[1], [Exhaust]: Play a 1 [Might] Recruit unit token."
 *   × Trifarian Gloryseeker (ogn-217-298) · 2 · 2 Might "[Legion] — When you play me, buff me."
 *   × Noxus Hopeful (ogn-012-298) · 4 · 4 Might "[Legion] — I cost [2] less."
 *
 * Q: Does playing a token (e.g. via Herald of the Arcane) count towards Legion ("if you've played another card this turn")?
 * A: No. "Card" means Main Deck cards; tokens (and runes) are not cards, so playing a token does not turn Legion on.
 * Rules: 186 (tokens are not cards), 819 (Legion: you've played another CARD this turn), 101/103 (Main Deck cards).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const HERALD = "ogn-265-298";
const GLORYSEEKER = "ogn-217-298";
const NOXUS_HOPEFUL = "ogn-012-298";

const TRINKET = { cardType: "gear", energyCost: 0, name: "Trinket" };

/** P1's turn: Herald legend, Gloryseeker + Hopeful + a free Trinket in hand, [1] for the Herald + [2] more. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .legend(P1, HERALD, "herald")
    .hand(P1, GLORYSEEKER, "glory")
    .hand(P1, NOXUS_HOPEFUL, "hopeful")
    .hand(P1, TRINKET, "trinket");
}

const recruits = (game: Game) => game.p1.units("base").filter((id) => game.state(id).isToken);

/** Herald makes a Recruit token; returns with the chain settled. */
async function heraldToken(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("herald");
  await game.settle();
  expect(recruits(game)).toHaveLength(1);
  expect(game.p1.energy()).toBe(2);
  return game;
}

describe("Ruling 905a29905df5f664 — a played token is not a 'card' for Legion", () => {
  test("the Recruit token IS played (it is on the board) but the played-CARDS-this-turn ledger Legion reads is still empty", async () => {
    const game = await heraldToken();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
  });

  test("Legion stays OFF after the token: Trifarian Gloryseeker played next is NOT buffed (2 Might)", async () => {
    const game = await heraldToken();
    await game.p1.play("glory");
    await game.settle();
    expect(game.state("glory")).toMatchObject({ isBuffed: false, might: 2, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("Legion stays OFF after the token: Noxus Hopeful still costs [4] — unaffordable with the [2] left", async () => {
    const game = await heraldToken();
    expect(game.p1.can("play", "hopeful")).toBe(false);
  });

  test("control: playing a real card first (the free Trinket) DOES turn Legion on — Hopeful now costs [2] and the Gloryseeker would be buffed", async () => {
    const game = await heraldToken();
    await game.p1.play("trinket");
    await game.settle();
    expect(game.p1.can("play", "hopeful")).toBe(true);
    await game.p1.play("glory");
    await game.settle();
    expect(game.state("glory")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.p1.energy()).toBe(0);
  });
});
