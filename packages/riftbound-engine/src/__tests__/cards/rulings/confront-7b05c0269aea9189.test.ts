/**
 * Ruling 7b05c0269aea9189 — Confront (OGN-129 → ogn-129-298) · Spell · Body · [2] · [Action]
 *   "Units you play this turn enter ready. Draw 1."
 *   × Vanguard Armory (sfd-168-221) "[Exhaust]: Play three 1 [Might] Recruit unit tokens."
 *   × Desert's Call (sfd-031-221, [2]) "Play a 2 [Might] Sand Soldier unit token."
 *
 * Q: Does Confront affect token units?
 * A: Yes. Token units are units (179.1.d) and are PLAYED by their owner following the normal steps (179.1.a), so units
 *    tokens you play this turn after Confront also enter ready.
 * Rules: 179.1.a / 179.1.d (tokens are played, are units), 143.4 (default exhausted), 369.3 (enters-ready replacement).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const CONFRONT = "ogn-129-298";
const VANGUARD_ARMORY = "sfd-168-221";
const DESERTS_CALL = "sfd-031-221";

/** P1's turn: Confront + Desert's Call in hand, [4] floating, a ready Armory in base (no controlled battlefield → tokens land in base unasked). */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .gear(P1, VANGUARD_ARMORY, "armory")
    .hand(P1, CONFRONT, "confront")
    .hand(P1, DESERTS_CALL, "call");
}

const tokens = (game: Game, name: string) => game.p1.units("base").filter((id) => game.state(id).name === name);

describe("Ruling 7b05c0269aea9189 — Confront's 'units you play this turn enter ready' covers token units", () => {
  test("control: without Confront the Armory's three Recruit tokens enter EXHAUSTED (143.4)", async () => {
    const game = await board().build();
    await game.p1.activate("armory");
    await game.settle();
    expect(tokens(game, "Recruit")).toHaveLength(3);
    expect(tokens(game, "Recruit").every((t) => game.state(t).isExhausted)).toBe(true);
  });

  test("Confront first ([2], draw 1), then crank the Armory: all three Recruit unit TOKENS enter READY", async () => {
    const game = await board().build();
    await game.p1.cast("confront");
    expect(game.p1.energy()).toBe(2);
    const hand = game.p1.hand().length;
    await game.settle();
    expect(game.zoneOf("confront")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 1);
    await game.p1.activate("armory");
    await game.settle();
    const toks = tokens(game, "Recruit");
    expect(toks).toHaveLength(3);
    expect(toks.every((t) => game.state(t).isToken && game.state(t).cardType === "unit")).toBe(true);
    expect(toks.every((t) => game.state(t).isReady)).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("same for a token a SPELL plays: after Confront, Desert's Call's 2-Might Sand Soldier token enters ready", async () => {
    const game = await board().build();
    await game.p1.cast("confront");
    await game.settle();
    await game.p1.cast("call");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    const [soldier] = tokens(game, "Sand Soldier");
    expect(soldier).toBeDefined();
    expect(game.state(soldier as string)).toMatchObject({ isReady: true, isToken: true, might: 2 });
  });

  test("'this turn' only: tokens the Armory plays on P1's NEXT turn enter exhausted again", async () => {
    const game = await board().build();
    await game.p1.cast("confront");
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("armory").isReady).toBe(true);
    await game.p1.activate("armory");
    await game.settle();
    expect(tokens(game, "Recruit")).toHaveLength(3);
    expect(tokens(game, "Recruit").every((t) => game.state(t).isExhausted)).toBe(true);
  });
});
