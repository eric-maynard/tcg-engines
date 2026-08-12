/**
 * Ruling e2efd92aefcaa372 — Raging Soul (OGN-019 → ogn-019-298) · unit · [4] · 4 [Might]
 *   "If you've discarded a card this turn, I have [Assault] and [Ganking]."
 *   × Jinx, Demolitionist (OGN-030 → ogn-030-298) · [3][fury] · "When you play me, discard 2."
 *
 * Q: Is that grant permanent once you discard, or only for the turn the discard happened?
 * A: Only for that turn. It is a passive that constantly re-reads "have you discarded a card THIS turn": it switches
 *    on the moment you discard, stays on through the end of turn, and switches off when the next turn starts — you
 *    must discard again on a later turn to get it back.
 * Rules: 340 (static abilities are continuously recalculated), 331 ("this turn" trackers reset at the turn change).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RAGING_SOUL = "ogn-019-298";
const JINX_DEMOLITIONIST = "ogn-030-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — plain 3-Might unit, just discard fodder

/** P1's turn. Raging Soul stands in base; Jinx is the discard engine; two spare cards to throw away. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", RAGING_SOUL, "soul")
    .hand(P1, JINX_DEMOLITIONIST, "jinx")
    .hand(P1, FILLER, "junk1")
    .hand(P1, FILLER, "junk2")
    .resources(P1, { energy: 3, power: { fury: 1 } });
}

/** Play Jinx; her "when you play me, discard 2" empties the rest of the hand. */
async function afterDiscard(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("jinx", { to: "base" });
  await game.settle();
  expect(game.zoneOf("junk1")).toBe("trash");
  expect(game.zoneOf("junk2")).toBe("trash");
  return game;
}

describe("Ruling e2efd92aefcaa372 — Raging Soul's Assault/Ganking is a this-turn passive, not a permanent grant", () => {
  test("with nothing discarded yet, Raging Soul has neither keyword", async () => {
    const game = await board().build();
    expect(game.state("soul").keywords).not.toContain("Assault");
    expect(game.state("soul").keywords).not.toContain("Ganking");
  });

  test("discarding this turn switches both keywords on", async () => {
    const game = await afterDiscard();
    expect(game.state("soul").keywords).toContain("Assault");
    expect(game.state("soul").keywords).toContain("Ganking");
  });

  test("the grant survives the rest of the turn, including the Ending Phase's expiration step", async () => {
    const game = await afterDiscard();
    await game.p1.endTurn();
    await game.settle();
    // Still P1's card, now on P2's turn — the tracker is per-turn, so it is off again.
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("soul").keywords).not.toContain("Assault");
    expect(game.state("soul").keywords).not.toContain("Ganking");
  });

  test("it does not come back on a later turn by itself — you have to discard again", async () => {
    const game = await afterDiscard();
    await game.advanceTurn(); // → P2's turn
    await game.advanceTurn(); // → P1's next turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("soul").keywords).not.toContain("Assault");
    expect(game.state("soul").keywords).not.toContain("Ganking");
    expect(game.violations()).toEqual([]);
  });
});
