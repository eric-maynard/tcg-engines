/**
 * The Harrowing — ogn-198-298 · Spell · Chaos · 6 energy + [chaos][chaos] · Action
 *
 *   Play a unit from your trash, ignoring its Energy cost. (You must still pay its Power cost.)
 *
 * Rules: 355.10.a (your trash is public, so "a unit from your trash" targets a card there),
 * 356.1.b.2 (ignoring the Energy cost zeroes only that part; Power is still paid),
 * Action timing (your turn / showdowns).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-198-298";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit, energy-only cost
const VI = "ogn-036-298"; // Vi, Destructive: 2 energy + [fury], 3 Might
const MOBILIZE = "ogn-134-298"; // a spell — never a legal pick

function board(extra: { fury?: number } = {}) {
  return scenario()
    .resources(P1, { energy: 6, power: { chaos: 2, ...(extra.fury === undefined ? {} : { fury: extra.fury }) } })
    .trash(P1, SKULKER, "skulker")
    .trash(P1, VI, "vi")
    .trash(P1, MOBILIZE, "junkSpell")
    .trash(P2, SKULKER, "theirs")
    .hand(P1, CARD, "har");
}

/** Cast and bring back `unit`, whether the engine asks at cast time or on resolution. */
async function castReturning(game: Game, unit: string): Promise<void> {
  const askedUpFront = game.p1.option("cast", "har")?.fields.some((f) => f.arg === "targets" && f.required);
  await game.p1.cast("har", askedUpFront ? { targets: unit } : {});
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick(unit);
    await game.settle();
  }
}

describe("The Harrowing (ogn-198-298)", () => {
  test("not castable with 5 energy, or with a single chaos power", async () => {
    const low = await board().resources(P1, { energy: 5, power: { chaos: 2 } }).unit(P1, "base", { might: 1 }, "u").build();
    expect(low.p1.can("cast", "har")).toBe(false);
    const oneChaos = await board().resources(P1, { energy: 6, power: { chaos: 1 } }).unit(P1, "base", { might: 1 }, "u").build();
    expect(oneChaos.p1.can("cast", "har")).toBe(false);
  });

  test.failing("BUG: castable with a unit in your trash and an empty board; costs 6 energy + 2 chaos; choices are YOUR trash UNITS only", async () => {
    // Expected: legal at 6+CC; the offered cards are skulker + vi (not the spell, not P2's trash).
    // Actual: the engine resolves "a unit from your trash" against friendly units on the BOARD,
    // so with an empty board the spell is not offered at all.
    const game = await board().build();
    expect(game.p1.can("cast", "har")).toBe(true);
    const field = game.p1.option("cast", "har")?.fields.find((f) => f.arg === "targets");
    if (field) {
      expect(field.options.map((o) => o[0]).sort()).toEqual(["skulker", "vi"]);
    }
    await game.p1.cast("har", field ? { targets: "skulker" } : {});
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("har")).toBe("chain");
  });

  test.failing("BUG: the chosen unit is played from the trash onto the board with no energy spent on it", async () => {
    // Expected: Shipyard Skulker leaves the trash and enters P1's base; energy stays 0 after paying 6 for the spell.
    // Actual: nothing in the trash is touched (see above).
    const game = await board().build();
    await castReturning(game, "skulker");
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.p1.units("base")).toContain("skulker");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("vi")).toBe("trash");
    expect(game.zoneOf("har")).toBe("trash");
  });

  test.failing("BUG: '(You must still pay its Power cost.)' — bringing back Vi (2 + [fury]) spends the fury but no energy", async () => {
    // Expected: with 1 fury available Vi enters the base; fury 1 → 0, energy untouched beyond the spell's own 6.
    // Actual: the play-from-trash never happens.
    const game = await board({ fury: 1 }).build();
    await castReturning(game, "vi");
    expect(game.zoneOf("vi")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
  });

  test("[Action]: not castable on the opponent's turn in an open state", async () => {
    const game = await board().active(P2).unit(P1, "base", { might: 1 }, "u").build();
    expect(game.p1.can("cast", "har")).toBe(false);
  });
});
