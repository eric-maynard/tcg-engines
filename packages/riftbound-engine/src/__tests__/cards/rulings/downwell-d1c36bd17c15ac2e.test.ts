/**
 * Ruling d1c36bd17c15ac2e — Downwell (SFD-147 → sfd-147-221) · Spell · Chaos · [8][chaos][chaos]
 *     "Return all units and gear to their owners' hands."
 *   × Gold (SFD-T03 → sfd-t03) · Gear token · "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *
 * Q: Does Downwell remove Gold tokens from the board?
 * A: Yes. Gold is gear (a gear token), so Downwell returns it to its owner's hand along with everything else — and as a token in
 *    a non-board zone it immediately ceases to exist. Net effect: the Gold is simply gone (never actually a card in hand).
 * Rules: 186.1 (a token outside the board ceases to exist), 128 (gear), Downwell affects "all … gear".
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DOWNWELL = "sfd-147-221";
const GOLD = "sfd-t03";
const TRINKET = { cardType: "gear", energyCost: 1, name: "Trinket" } as const;

/** P1's turn with exactly [8][chaos][chaos]. Both players have a Gold token; P2 also has a real gear and a unit, P1 a unit. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { chaos: 2 } })
    .gear(P1, GOLD, "gold1")
    .gear(P2, GOLD, "gold2")
    .gear(P2, TRINKET, "trinket")
    .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 3, name: "Theirs" }, "theirs")
    .hand(P1, DOWNWELL, "downwell");
}

async function downwellResolves(): Promise<Game> {
  const game = await board().build();
  expect(game.state("gold1")).toMatchObject({ cardType: "gear", isToken: true, zone: "base" });
  expect(game.p2.gear().toSorted()).toEqual(["gold2", "trinket"]);
  await game.p1.cast("downwell");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.settle();
  expect(game.zoneOf("downwell")).toBe("trash");
  return game;
}

describe("Ruling d1c36bd17c15ac2e — Downwell sweeps Gold tokens off the board; they then cease to exist", () => {
  test("every unit and every REAL gear goes back to its owner's hand", async () => {
    const game = await downwellResolves();
    expect(game.zoneOf("mine")).toBe("hand");
    expect(game.zoneOf("theirs")).toBe("hand");
    expect(game.zoneOf("trinket")).toBe("hand");
    expect(game.p1.hand()).toContain("mine");
    expect(game.p2.hand().toSorted()).toEqual(["theirs", "trinket"]);
  });

  test("the Gold tokens are affected too — they leave the board (no gear remains for either player)…", async () => {
    const game = await downwellResolves();
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear()).toEqual([]);
    expect(game.p1.base()).toEqual([]);
    expect(game.p2.base()).toEqual([]);
  });

  test("…and, being tokens in a non-board zone, immediately cease to exist: not in any hand, not in any trash, simply gone (186.1)", async () => {
    const game = await downwellResolves();
    for (const gold of ["gold1", "gold2"]) {
      expect(game.zoneOf(gold)).toBe("gone");
      expect(game.has(gold)).toBe(false);
    }
    expect(game.p1.hand()).not.toContain("gold1");
    expect(game.p2.hand()).not.toContain("gold2");
    expect(game.p1.trash()).toEqual(["downwell"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
