/**
 * Get Excited! — ogn-008-298 · Spell · Fury · 2 energy + 1 fury power
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Discard 1. Deal its Energy cost as damage to a unit at a battlefield.
 *   (Ignore its Power cost.)
 *
 * "a unit at a battlefield" is a play-time target (rule 355.8); the discard is
 * an instruction performed on resolution and the damage amount is the printed
 * Energy cost of the discarded card (rule 206).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-008-298";
const MUNDO = "ogn-109-298"; // 8 energy + 2 mind — discard fodder with a big Energy cost
const SKULKER = "ogn-175-298"; // vanilla 3-might unit

/** Cast Get Excited at `target` (falls back to an untargeted cast while the engine asks for no target). */
async function castAt(game: Game, target: string) {
  const r = await game.p1.try((p) => p.cast("ge", { targets: target }));
  if (!r.ok) {
    await game.p1.cast("ge");
  }
}

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9 }, "foe")
    .unit(P2, "base", { might: 1 }, "home")
    .hand(P1, CARD, "ge")
    .hand(P1, MUNDO, "mundo")
    .hand(P1, SKULKER, "skulker");
}

describe("Get Excited! (ogn-008-298)", () => {
  test("cost: pays 2 energy + 1 fury; unaffordable without the fury power or with 1 energy", async () => {
    const game = await board().build();
    await castAt(game, "foe");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("ge")).toBe("chain");
    const noPower = await scenario().resources(P1, { energy: 2 }).battlefield("bf1").unit(P2, "bf1", { might: 2 }, "foe").hand(P1, CARD, "ge").hand(P1, SKULKER).build();
    expect(noPower.p1.can("cast", "ge")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 1, power: { fury: 1 } }).battlefield("bf1").unit(P2, "bf1", { might: 2 }, "foe").hand(P1, CARD, "ge").hand(P1, SKULKER).build();
    expect(noEnergy.p1.can("cast", "ge")).toBe(false);
  });

  test("[Action]: not playable on an opponent's turn in an open state, playable once a showdown opens", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P2, "base", { might: 5 }, "foe")
      .hand(P1, CARD, "ge")
      .hand(P1, SKULKER, "skulker")
      .build();
    expect(game.p1.can("cast", "ge")).toBe(false);
    await game.p2.move("foe", "bf1"); // showdown at an uncontrolled battlefield
    await game.p2.passFocus();
    expect(game.p1.can("cast", "ge")).toBe(true);
  });

  test("Discard 1: on resolution the caster picks a card from hand to discard", async () => {
    const game = await board().build();
    await castAt(game, "foe");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("skulker");
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("mundo")).toBe("hand");
    expect(game.zoneOf("ge")).toBe("trash");
  });

  test.failing("BUG: deals the discarded card's Energy cost (8 for Dr. Mundo) as damage to the chosen battlefield unit", async () => {
    // Expected: discarding Dr. Mundo (8 energy, 2 power ignored) deals 8 to `foe`.
    // Actual: the parsed ability only carries `discard 1`; no target is asked and no damage is dealt.
    const game = await board().build();
    await game.p1.cast("ge", { targets: "foe" });
    await game.settle();
    await game.p1.pick("mundo");
    await game.settle();
    expect(game.zoneOf("mundo")).toBe("trash");
    expect(game.state("foe").damage).toBe(8);
    expect(game.state("home").damage).toBe(0);
  });

  test.failing("BUG: targets only units at a battlefield — a unit in a base is not a legal choice and no battlefield unit means not castable (rule 355.8)", async () => {
    // Expected: `home` (in P2's base) is rejected; with no unit at any battlefield the spell cannot be played.
    // Actual: the spell has no target at all, so it is castable regardless of the board.
    const game = await board().build();
    const bad = await game.p1.try((p) => p.cast("ge", { targets: "home" }));
    expect(bad.ok).toBe(false);
    const empty = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .unit(P2, "base", { might: 1 }, "home")
      .hand(P1, CARD, "ge")
      .hand(P1, SKULKER, "skulker")
      .build();
    expect(empty.p1.can("cast", "ge")).toBe(false);
  });
});
