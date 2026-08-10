/**
 * Ruling 32e8393c00ca31f7 — Herald of the Arcane (OGN-265 → ogn-265-298) · Legend (Viktor)
 *     "[1], [Exhaust]: Play a 1 [Might] Recruit unit token."
 *   × Gemcraft Seer (ogn-100-298) · "[Vision] … Other friendly units have [Vision]." (Vision = "When you play me, look at the
 *     top card of your Main Deck. You may recycle it.")
 *   × Noxus Hopeful (ogn-012-298) · [4] "[Legion] — I cost [2] less." — the "played a CARD" probe.
 *
 * Q: Does playing the Recruit token via Viktor's legend count as playing a unit (triggering e.g. Gemcraft Seer's Vision)?
 * A: Yes — it is playing a UNIT, so "when you play me / a unit" abilities like the granted Vision trigger; but it is NOT
 *    playing a CARD. Tokens enter exhausted.
 * Rules: 185.2.a / 350.2 (tokens are played), 182 / 184.3 (tokens are not cards), 817 (Vision), 812.1.c (Legion), 143.4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const HERALD = "ogn-265-298";
const GEMCRAFT_SEER = "ogn-100-298";
const NOXUS_HOPEFUL = "ogn-012-298";
const FILLER = "ogn-175-298";

/** P1's turn with [1] for the legend + 3 more (a Legion-priced Hopeful, never a full-price one). Seer on board, known top card. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .legend(P1, HERALD, "viktor")
    .unit(P1, "base", GEMCRAFT_SEER, "seer")
    .hand(P1, NOXUS_HOPEFUL, "hopeful")
    .deckTop(P1, FILLER, "top");
}

const recruits = (game: Game) => game.p1.units().filter((id) => game.state(id).isToken && game.state(id).name === "Recruit");

describe("Ruling 32e8393c00ca31f7 — Viktor's Recruit token is a unit PLAYED (Vision triggers) but not a CARD played", () => {
  test("activating the legend ([1] + exhaust) plays a 1-Might Recruit token into base, EXHAUSTED, and it has Vision from the Seer", async () => {
    const game = await board().build();
    await game.p1.activate("viktor");
    expect(game.state("viktor").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(3);
    // Let the activation resolve; stop at whatever the token's arrival asks.
    for (let i = 0; i < 6 && recruits(game).length === 0; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    const [tok] = recruits(game);
    expect(tok).toBeDefined();
    expect(game.state(tok as string)).toMatchObject({ isExhausted: true, isToken: true, might: 1, zone: "base" });
    expect(game.state(tok as string).keywords).toContain("Vision");
  });

  test("'when you play me' fires for the token: the granted Vision trigger goes on the chain sourced from the Recruit and asks P1 look-and-may-recycle of the top card", async () => {
    const game = await board().build();
    await game.p1.activate("viktor");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const [tok] = recruits(game);
    expect(tok).toBeDefined();
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, source: { cardId: tok } });
    expect((game.decision() as { options: { card?: string; key: string }[] }).options.map((o) => o.card ?? o.key)).toContain("top");
    await game.p1.pick("top"); // recycle it
    await game.settle();
    const deck = game.p1.deck();
    expect(deck[deck.length - 1]).toBe("top");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("…but it is not a CARD played: the cards-played count stays 0 and Noxus Hopeful's Legion stays off ([4], unaffordable with the 3 left)", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    await game.p1.activate("viktor");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
      await game.settle();
    }
    expect(recruits(game)).toHaveLength(1);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.state("hopeful").energyCost).toBe(4);
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.can("play", "hopeful")).toBe(false);
  });

  test("control: without the Seer the token's play triggers nothing (no Vision prompt)", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).legend(P1, HERALD, "viktor").deckTop(P1, FILLER, "top").build();
    await game.p1.activate("viktor");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(recruits(game)).toHaveLength(1);
    expect(game.p1.deck()[0]).toBe("top");
  });
});
