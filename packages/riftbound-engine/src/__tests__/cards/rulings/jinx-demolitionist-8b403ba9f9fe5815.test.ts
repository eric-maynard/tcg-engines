/**
 * Ruling 8b403ba9f9fe5815 — Jinx, Demolitionist (OGN-030 → ogn-030-298) · Unit · [3][fury] · 4 Might
 *   "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.) [Assault 2] …
 *    When you play me, discard 2."
 *
 * Q: Played with [Accelerate], is Jinx 4 tapped runes + 2 red recycled, or 3 tapped + 2 red + 1 any?
 * A: 4 exhausted runes and 2 recycled red runes. Her printed [3][fury] plus [Accelerate]'s [1][fury] add up to
 *    [4] Energy and two [fury] pips — "exhaust" is the Energy side, "recycle" is the Power side.
 * Rules: 356.1 (an additional cost adds to the base cost), 731 ([Accelerate]), 135.2 (exhaust a rune for Energy,
 *        recycle a rune for one Power of its Domain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const JINX_DEMOLITIONIST = "ogn-030-298";
const FILLER = "ogn-096-298"; // two spare hand cards for "discard 2"

function board(resources: { energy: number; power: Record<string, number> }) {
  return scenario()
    .resources(P1, resources)
    .hand(P1, JINX_DEMOLITIONIST, "jinx")
    .hand(P1, FILLER, "f1")
    .hand(P1, FILLER, "f2");
}

/** The priced variants the seat is offered for Jinx. */
const quotes = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.card === "jinx")
    .flatMap((o) => o.variants.map((v) => (v.params as Record<string, unknown>).quote as Record<string, unknown>));

describe("Ruling 8b403ba9f9fe5815 — accelerated Jinx costs [4] Energy and two [fury] pips", () => {
  test("ruling: the accelerated line is quoted at energy 4 + fury 2 and enters ready; the plain line is energy 3 + fury 1 and does not", async () => {
    const game = await board({ energy: 4, power: { fury: 2 } }).build();
    const priced = quotes(game).map((q) => ({ energy: q.energy, entersReady: q.entersReady, fury: (q.power as Record<string, number>).fury }));
    expect(priced).toContainEqual({ energy: 3, entersReady: false, fury: 1 });
    expect(priced).toContainEqual({ energy: 4, entersReady: true, fury: 2 });
  });

  test("ruling: paying it empties exactly [4] + [fury][fury] and Jinx enters READY", async () => {
    const game = await board({ energy: 4, power: { fury: 2 } }).build();
    await game.p1.play("jinx", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("jinx")).toMatchObject({ baseMight: 4, isExhausted: false, isReady: true });
    expect(game.locationOf("jinx")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: it is NOT '3 Energy + 2 fury + 1 any' — with [3][fury][fury] the accelerated line is unaffordable, only the plain play is offered", async () => {
    const game = await board({ energy: 3, power: { fury: 2 } }).build();
    const priced = quotes(game).map((q) => q.entersReady);
    expect(priced).toEqual([false]);
    expect((await game.p1.try((p) => p.play("jinx", { accelerate: true }))).ok).toBe(false);
    expect(game.zoneOf("jinx")).toBe("hand");
  });

  test("control — the plain play takes [3][fury], leaves one [fury] behind and Jinx arrives exhausted", async () => {
    const game = await board({ energy: 4, power: { fury: 2 } }).build();
    await game.p1.play("jinx");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    await game.settle();
    expect(game.state("jinx")).toMatchObject({ isExhausted: true, isReady: false });
  });

  test("either way her play trigger still discards 2", async () => {
    const game = await board({ energy: 4, power: { fury: 2 } }).build();
    await game.p1.play("jinx", { accelerate: true });
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.trash().sort()).toEqual(["f1", "f2"]);
  });
});
