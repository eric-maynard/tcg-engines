/**
 * Ruling b509f3d4ec1971e4 — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · [9][body][body]
 *   "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish
 *    it. Play it, ignoring its cost, and recycle the rest."
 *
 * Q: Can Dazzling Aurora summon Champion Units?
 * A: Yes. The card says "a unit" with no further restriction, so a Champion unit found this way is revealed,
 *    banished and played for free just like any other unit.
 * Rules: 355.10 (a descriptor restricts only by what it says — "unit" covers Champion units), 419.2 (an
 *        effect that plays a card ignoring its cost still plays it normally otherwise).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const VOLIBEAR_FURIOUS = "ogn-041-298"; // Champion unit, 9 Might, printed [10][fury][fury]
const HEXTECH_RAY = "ogn-009-298"; // a spell — skipped over on the way down
const PLAIN_UNIT = { cardType: "unit", energyCost: 3, might: 3, name: "Plain Soldier" } as const;

/** P1's turn with an EMPTY pool, the Aurora already on the board and `top` cards stacked. */
function board(deck: readonly (string | typeof PLAIN_UNIT)[], aliases: readonly string[]) {
  return scenario()
    .gear(P1, DAZZLING_AURORA, "aurora")
    .deck(P1, deck as never, aliases as never);
}

/** End P1's turn and drive the Aurora's end-of-turn trigger through. */
async function endTurn(game: Game): Promise<void> {
  await game.p1.endTurn();
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main" && game.turnPlayer() === P2)) {
      return;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
      continue;
    }
    return;
  }
}

describe("Ruling b509f3d4ec1971e4 — Dazzling Aurora happily summons a Champion unit", () => {
  test("baseline: a plain unit under a spell is found, the spell is recycled, the unit is played free", async () => {
    const game = await board([HEXTECH_RAY, PLAIN_UNIT], ["ray", "soldier"]).build();
    await endTurn(game);
    expect(game.zoneOf("soldier")).toBe("base");
    expect(game.zoneOf("ray")).toBe("mainDeck"); // recycled, not trashed
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("ruling: a CHAMPION unit is an equally valid find — Volibear, Furious is played from the deck for free", async () => {
    const game = await board([HEXTECH_RAY, VOLIBEAR_FURIOUS], ["ray", "voli"]).build();
    await endTurn(game);
    expect(game.state("voli").defId).toBe(VOLIBEAR_FURIOUS);
    expect(game.zoneOf("voli")).toBe("base");
    expect(game.p1.units("base")).toContain("voli");
  });

  test("ruling: 'ignoring its cost' really is free — the printed [10][fury][fury] is not paid (P1 has nothing)", async () => {
    const game = await board([HEXTECH_RAY, VOLIBEAR_FURIOUS], ["ray", "voli"]).build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await endTurn(game);
    expect(game.zoneOf("voli")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("voli").might).toBe(9);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: a champion on top is found immediately — nothing is skipped past it", async () => {
    const game = await board([VOLIBEAR_FURIOUS, PLAIN_UNIT], ["voli", "soldier"]).build();
    await endTurn(game);
    expect(game.zoneOf("voli")).toBe("base");
    expect(game.zoneOf("soldier")).not.toBe("base"); // the search stopped at the first unit
  });
});
