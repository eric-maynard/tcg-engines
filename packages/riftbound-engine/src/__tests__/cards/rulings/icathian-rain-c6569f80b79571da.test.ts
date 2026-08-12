/**
 * Ruling c6569f80b79571da — Icathian Rain (OGN-248 → ogn-248-298) · Spell · [7][rainbow][rainbow][rainbow]
 *   "Deal 2 to a unit." × 6
 *   × a death-replacement Legend ("Seth"), modelled here with Zhonya's Hourglass (OGN-077 → ogn-077-298)
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *     (Seth is not in this card pool; any single-use "replace the death" effect shows the same timing.)
 *
 * Q: When Icathian Rain deals damage several times to a 3-Might unit, does the death-replacement fire after
 *    each instance of damage, or does the whole spell resolve first?
 * A: The whole spell resolves first, dealing all six instances. Only afterwards, in the cleanup that follows
 *    spell resolution, does the game register lethal damage and try to kill the unit — and THAT single death
 *    is what the replacement effect replaces.
 * Rules: 320/323 (state-based lethal checks happen in a Cleanup, never mid-resolution), 359.3 (a spell
 *        executes all its instructions), 370–373 (death replacement applies to the death event).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ICATHIAN_RAIN = "ogn-248-298";
const ZHONYAS_HOURGLASS = "ogn-077-298";

/** P2's turn with [7][rainbow][rainbow][rainbow]: P1 has a 3-Might Target (optionally guarded by Zhonya's). */
function board(guarded: boolean) {
  const s = scenario()
    .active(P2)
    .resources(P2, { energy: 7, power: { rainbow: 3 } })
    .unit(P1, "base", { might: 3, name: "Target" }, "t")
    .unit(P1, "base", { might: 9, name: "Bystander" }, "o")
    .hand(P2, ICATHIAN_RAIN, "rain");
  return guarded ? s.gear(P1, ZHONYAS_HOURGLASS, "zh") : s;
}

/** All six instances of the Rain named on the same 3-Might unit — legal, because nothing has died yet. */
async function rainAll(guarded: boolean): Promise<Game> {
  const game = await board(guarded).build();
  await game.p2.cast("rain", { targets: ["t", "t", "t", "t", "t", "t"] });
  return game;
}

describe("Ruling c6569f80b79571da — Icathian Rain resolves in full, THEN one lethal check the replacement can catch", () => {
  test("ruling: all six instances may be aimed at the same 3-Might unit when the spell is played", async () => {
    const game = await board(false).build();
    const f = game.p2.option("cast", "rain")?.fields.find((x) => x.name === "targets");
    expect(f).toMatchObject({ max: 6, min: 6, required: true });
    expect(f?.options).toContainEqual(["t", "t", "t", "t", "t", "t"]);
    await game.p2.cast("rain", { targets: ["t", "t", "t", "t", "t", "t"] });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "rain", targets: ["t", "t", "t", "t", "t", "t"] }),
    ]);
    expect(game.state("t").damage).toBe(0); // nothing has happened yet
  });

  test("baseline: unguarded, the unit dies — ONE death, at the cleanup after the spell finished resolving", async () => {
    const game = await rainAll(false);
    await game.settle();
    expect(game.zoneOf("t")).toBe("trash");
    expect(game.zoneOf("rain")).toBe("trash");
    expect(game.state("o").damage).toBe(0);
  });

  test("ruling: with a death-replacement in play the unit SURVIVES — the replacement is used once, on the single post-spell death", async () => {
    const game = await rainAll(true);
    await game.settle();
    expect(game.zoneOf("t")).toBe("base");
    expect(game.state("t").damage).toBe(0); // healed by the replacement
    expect(game.state("t").isExhausted).toBe(true);
    expect(game.zoneOf("zh")).toBe("trash"); // "kill this instead"
  });

  test("ruling, stated the other way: had the death been checked between instances, the leftover 8 damage would have re-killed the recalled unit — it did not, so the spell had already finished", async () => {
    const game = await rainAll(true);
    await game.settle();
    expect(game.zoneOf("t")).toBe("base");
    expect(game.state("t").damage).toBe(0);
    expect(game.state("t").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: the replacement is single-use — a fresh 3 damage after the Rain does kill the unit", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 8, power: { fury: 1, rainbow: 3 } })
      .unit(P1, "base", { might: 3, name: "Target" }, "t")
      .gear(P1, ZHONYAS_HOURGLASS, "zh")
      .hand(P2, ICATHIAN_RAIN, "rain")
      .hand(P2, "ogn-009-298", "ray") // Hextech Ray, deal 3
      .battlefield("bf1", { controller: P1 })
      .build();
    await game.p2.cast("rain", { targets: ["t", "t", "t", "t", "t", "t"] });
    await game.settle();
    expect(game.zoneOf("t")).toBe("base");
    expect(game.zoneOf("zh")).toBe("trash");
  });
});
