/**
 * Ruling 82eb4ecb09496f19 — Decisive Strike (OGS-024 → ogs-024-024) · Spell · Body/Order · 5+[rainbow] · [Action]
 *   "Give friendly units +2 [Might] this turn."
 *
 * Q: How long does a "this turn" Might increase last when the spell is played during a showdown on the OPPONENT's turn?
 * A: Until the end of the CURRENT turn — i.e. the opponent's turn in which it was played (a showdown is not a turn). It is
 *    cleared at that turn's end, before your own next turn begins. (Unlike a buff, which is a permanent object.)
 * Rules: 317.2 (Expiration Step clears "this turn" effects at end of turn), 700–701 (Might modifications last as stated),
 *        340/345 (showdowns happen within a turn; Action spells playable there with Focus).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DECISIVE_STRIKE = "ogs-024-024";

/** P2's turn (turn 3). P1 holds bf1 with Guard (2) and has Squire (1) in base, Decisive Strike + 5+[rainbow]. P2's Raider (3) attacks. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 5, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 1, name: "Squire" }, "squire")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, DECISIVE_STRIKE, "strike");
}

/** Raider attacks; P2 passes Focus; P1 (Focus, opponent's turn) casts Decisive Strike; it resolves. Showdown still open. */
async function strikeDuringP2sShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.turnPlayer()).toBe(P2);
  expect(game.p1.can("cast", "strike")).toBe(true);
  await game.p1.cast("strike");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("strike")).toBe("trash");
  return game;
}

describe("Ruling 82eb4ecb09496f19 — 'this turn' means the current (opponent's) turn, showdown or not", () => {
  test("cast in the showdown on P2's turn: both friendly units get +2 [Might] at once (Guard 2 → 4, Squire 1 → 3) as a turn-scoped modifier, not a buff", async () => {
    const game = await strikeDuringP2sShowdown();
    expect(game.state("guard")).toMatchObject({ isBuffed: false, might: 4, mightModifier: 2 });
    expect(game.state("squire")).toMatchObject({ isBuffed: false, might: 3, mightModifier: 2 });
    expect(game.state("raider").might).toBe(3);
  });

  test("it lasts through the rest of P2's turn: the Guard (4) wins the combat against the Raider (3) and is STILL 4 afterwards in P2's main phase", async () => {
    const game = await strikeDuringP2sShowdown();
    await game.settle(); // both pass Focus → combat: 4 vs 3
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("guard")).toMatchObject({ might: 4, mightModifier: 2, zone: "battlefield-bf1" });
    expect(game.state("squire").might).toBe(3);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("cleared at the END OF P2's TURN (the turn it was created in) — when P1's own turn begins the units are back to 2 and 1; the Expiration Step records the lapse", async () => {
    const game = await strikeDuringP2sShowdown();
    await game.settle();
    await game.advanceTurn(); // P2 ends → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("guard")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.state("squire")).toMatchObject({ might: 1, mightModifier: 0 });
    const expired = game.trace().expiration.flatMap((p) => p.expired);
    expect(expired).toEqual(expect.arrayContaining(["mightModifier:guard", "mightModifier:squire"]));
    expect(game.violations()).toEqual([]);
  });
});
