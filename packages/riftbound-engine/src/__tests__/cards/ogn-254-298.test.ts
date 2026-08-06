/**
 * Noxian Guillotine — ogn-254-298 · Spell · Fury/Order · 4 energy
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Choose a unit. Kill it the next time it takes damage this turn.
 *   [Legion] — Kill it now instead. (Get the effect if you've played another card this turn.)
 *
 * Rule 355.8: "Choose a unit" is a caster-chosen play-time target — the spell
 * is illegal with no unit on the board and must prompt for which unit.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-254-298";
const HEXTECH_RAY = "ogn-009-298"; // Deal 3 to a unit at a battlefield (1 energy)

describe("Noxian Guillotine (ogn-254-298) — targeting", () => {
  test("not castable with no unit on the board (rule 355.8)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1, order: 1, rainbow: 1 } })
      .hand(P1, CARD, "ng")
      .build();
    expect(game.p1.can("cast", "ng")).toBe(false);
    const r = await game.p1.try((p) => p.cast("ng"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ng")).toBe("hand");
  });

  test("requires choosing a unit; each unit on the board is a legal target", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1, order: 1, rainbow: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P2, "bf1", { might: 5 }, "foe")
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, CARD, "ng")
      .build();
    expect(game.p1.can("cast", "ng")).toBe(true);
    // No target supplied → ambiguous (a target IS required).
    const r = await game.p1.try((p) => p.cast("ng"));
    expect(r.ok).toBe(false);
    await game.p1.cast("ng", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("ng")).toBe("trash");
    // Not Legion (first card this turn) → the unit is still alive for now.
    expect(game.locationOf("foe")).toBe("bf1");
  });

  // Parser-derived shape (no [Legion] wrapper): the chosen unit lives only on
  // the nested `replacement.target` — it must still gate and prompt.
  const PARSED_SHAPE = {
    abilities: [
      {
        effect: {
          duration: "next",
          replacement: { target: { type: "unit" }, type: "kill" },
          replaces: "take-damage",
          type: "replacement",
        },
        timing: "action",
        type: "spell",
      },
    ],
    cardType: "spell",
    domain: "fury",
    energyCost: 1,
    name: "Guillotine (parsed shape)",
    timing: "action",
  };

  test("parser-derived nested replacement target: illegal on an empty board, prompts otherwise", async () => {
    const empty = await scenario().resources(P1, { energy: 2 }).hand(P1, PARSED_SHAPE, "g").build();
    expect(empty.p1.can("cast", "g")).toBe(false);

    const game = await scenario()
      .resources(P1, { energy: 4, power: { fury: 1, rainbow: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P2, "bf1", { might: 5 }, "foe")
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, PARSED_SHAPE, "g")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    const r = await game.p1.try((p) => p.cast("g"));
    expect(r.ok).toBe(false); // a target is required
    await game.p1.cast("g", { targets: "foe" });
    await game.settle();
    expect(game.locationOf("foe")).toBe("bf1");
    await game.p1.cast("ray", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("base");
  });

  test("the chosen unit is killed the next time it takes damage this turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { fury: 2, order: 1, rainbow: 2 } })
      .battlefield("bf1", { controller: null })
      .unit(P2, "bf1", { might: 5 }, "foe")
      .hand(P1, CARD, "ng")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p1.cast("ng", { targets: "foe" });
    await game.settle();
    expect(game.locationOf("foe")).toBe("bf1");
    // 3 damage would not kill a 5-Might unit — the Guillotine rider does.
    await game.p1.cast("ray", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
  });

  // rule-id: ogn-254-298 — "takes damage" includes combat damage (rule 626).
  test("non-lethal combat damage also kills the chosen unit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1, order: 1, rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "foe")
      .unit(P1, "base", { might: 1 }, "poke")
      .hand(P1, CARD, "ng")
      .build();
    await game.p1.cast("ng", { targets: "foe" });
    await game.settle();
    expect(game.locationOf("foe")).toBe("bf1");
    // A 1-Might attacker deals 1 (non-lethal) to a 5-Might defender.
    await game.p1.move("poke", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect((game.gameState.activeReplacements ?? []).length).toBe(0);
  });
});
