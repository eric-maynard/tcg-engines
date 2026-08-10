/**
 * Ruling 0b2d08febdb77800 — Viktor, Innovator (OGN-117 → ogn-117-298) · Unit · Mind · [4]+[mind] · 3 Might
 *     "When you play a card on an opponent's turn, play a 1 [Might] Recruit unit token in your base."
 *   × Soaring Scout (OGN-216 → ogn-216-298) · Unit · [2] · 1 Might · "[Deathknell] — Channel 1 rune exhausted."
 *
 * Q: Does Viktor trigger when a rune comes into play from Soaring Scout's Deathknell (on the opponent's turn)?
 * A: No. Only main-deck cards count as "playing a card" for Viktor; a channeled rune is not a played card.
 *    Tokens (e.g. the Recruit itself) don't count either.
 * Rules: 101/132 (main-deck cards vs runes), 419 (playing a card), 594 (channel is not play), 186 (tokens).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VIKTOR = "ogn-117-298";
const SOARING_SCOUT = "ogn-216-298";
const DISCIPLINE = "ogn-058-298"; // Reaction, [2]: "Give a unit +2 [Might] this turn. Draw 1."

/** Inline 1-cost action spell: deal 3 to a unit — P2's way to kill the Scout on P2's own turn. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/** P2's turn. P1: Viktor in base, Soaring Scout at bf1, Discipline in hand with exactly [2]. P2: Bolt with exactly [1]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", VIKTOR, "viktor")
    .unit(P1, "bf1", SOARING_SCOUT, "scout")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P2, BOLT, "bolt");
}

function recruitsOf(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>): string[] {
  return game.p1.units("base").filter((u) => game.state(u).name === "Recruit");
}

describe("Ruling 0b2d08febdb77800 — a rune channeled by Soaring Scout's Deathknell is not a 'card played' for Viktor", () => {
  test("on P2's turn the Scout dies, its Deathknell channels 1 rune EXHAUSTED for P1 — and Viktor does NOT make a Recruit", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.runes()).toHaveLength(0);
    await game.p2.cast("bolt", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    // Deathknell happened: one new rune, exhausted.
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    // Viktor stayed silent: no trigger on the chain, no token in base.
    expect(game.chain()).toEqual([]);
    expect(recruitsOf(game)).toEqual([]);
    expect(game.p1.units("base")).toEqual(["viktor"]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control: P1 playing a real card (Discipline) on P2's turn DOES trigger Viktor — exactly one Recruit token, and the token itself does not retrigger him", async () => {
    const game = await board().build();
    await game.p2.cast("bolt", { targets: "scout" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "discipline")).toBe(true);
    await game.p1.cast("discipline", { targets: "viktor" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash"); // Bolt still resolved; Deathknell channeled a rune
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    const recruits = recruitsOf(game);
    expect(recruits).toHaveLength(1); // one for Discipline; none for the rune, none for the token
    expect(game.state(recruits[0] as string)).toMatchObject({ isToken: true, might: 1 });
    expect(game.chain()).toEqual([]);
  });
});
