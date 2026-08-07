/**
 * Decree of Unity (ven-131-166) — Spell, [Order], [2] + 1 power, Rare.
 *
 * "Kill an enemy Chaos ([chaos]) unit or gear."
 *
 * Head-judge notes:
 *   1. One mixed pool — a Chaos unit OR a Chaos gear, the caster picks (rule 355.8).
 *   2. "enemy" is a control test; "Chaos" is a printed-domain test. A friendly
 *      Chaos permanent and an enemy non-Chaos permanent are both illegal choices.
 *   3. With no legal target the spell may not be cast at all (rule 355.8).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-131-166";
const CHAOS_UNIT = "ogn-171-298"; // Mystic Poro — Chaos unit
const CALM_UNIT = "ogn-049-298"; // Playful Phantom — Calm unit
const CHAOS_GEAR = "ogn-182-298"; // Scrapheap — Chaos gear

function board() {
  return scenario().resources(P1, { energy: 2, power: { rainbow: 1 } }).hand(P1, CARD, "decree");
}

describe("Decree of Unity (ven-131-166)", () => {
  test("kills an enemy Chaos unit", async () => {
    const game = await board().unit(P2, "base", CHAOS_UNIT, "poro").build();

    await game.p1.cast("decree", { targets: "poro" });
    await game.settle();

    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("decree")).toBe("trash");
  });

  test("kills an enemy Chaos gear — units and gear share one target pool", async () => {
    const game = await board().gear(P2, CHAOS_GEAR, "scrap").build();

    await game.p1.cast("decree", { targets: "scrap" });
    await game.settle();

    expect(game.zoneOf("scrap")).toBe("trash");
  });

  test("only enemy Chaos permanents are offered", async () => {
    const game = await board()
      .unit(P2, "base", CHAOS_UNIT, "enemyChaos")
      .unit(P2, "base", CALM_UNIT, "enemyCalm")
      .unit(P1, "base", CHAOS_UNIT, "myChaos")
      .gear(P2, CHAOS_GEAR, "scrap")
      .build();

    const field = game.p1
      .option("cast", "decree")
      ?.fields?.find((f: { name?: string }) => f.name === "targets") as
      | { options?: string[][] }
      | undefined;
    const offered = (field?.options ?? []).flat().sort();
    expect(offered).toEqual(["enemyChaos", "scrap"]);
  });

  // rule 355.8 — no legal target ⇒ the spell cannot be played.
  test("is not castable with no enemy Chaos permanent on the board", async () => {
    const game = await board().unit(P2, "base", CALM_UNIT, "enemyCalm").build();

    expect(game.p1.can("cast", "decree")).toBe(false);
  });
});
