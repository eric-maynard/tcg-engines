/**
 * Acceleration Gate — ven-150-166 · Spell · Mind/Body · 3 energy · 1 power
 *
 *   Ready up to 4 units, gear, and/or runes.
 *
 * Rule 355.13 ("up to N" — caster picks 0..N at play time) over ONE mixed
 * pool of units, gear and runes (rule-id: ven-150-166).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-150-166";
const EXHAUSTED = { __flags: { exhausted: true } } as const;

function legalTargetIds(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>): string[] {
  const fields = (game.p1.option("cast", "gate")?.fields ?? []) as {
    arg?: string;
    options?: unknown[];
  }[];
  const f = fields.find((x) => x.arg === "targets");
  return [...new Set((f?.options ?? []).flat() as string[])];
}

describe("Acceleration Gate (ven-150-166)", () => {
  test("readies a chosen mix of an exhausted unit, gear and rune", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .unit(P1, "base", { might: 2 }, "ally", EXHAUSTED)
      .gear(P1, { name: "Trinket" }, "trinket", EXHAUSTED)
      .rune(P1, "mind", { alias: "r1" })
      .hand(P1, CARD, "gate")
      .build();
    await game.p1.tapRune("r1"); // third energy; r1 is now exhausted
    expect(game.state("r1").isExhausted).toBe(true);
    expect(game.p1.can("cast", "gate")).toBe(true);
    await game.p1.cast("gate", { targets: ["ally", "trinket", "r1"] });
    await game.settle();
    expect(game.state("ally").isExhausted).toBe(false);
    expect(game.state("trinket").isExhausted).toBe(false);
    expect(game.state("r1").isExhausted).toBe(false);
    expect(game.zoneOf("gate")).toBe("trash");
  });

  test("offers units, gear and runes (either side) as legal targets", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .unit(P1, "base", { might: 2 }, "ally", EXHAUSTED)
      .unit(P2, "base", { might: 3 }, "foe", EXHAUSTED)
      .gear(P1, { name: "Trinket" }, "trinket", EXHAUSTED)
      .rune(P1, "mind", { alias: "r1", exhausted: true })
      .hand(P1, CARD, "gate")
      .build();
    const legal = legalTargetIds(game);
    for (const id of ["ally", "foe", "trinket", "r1"]) {
      expect(legal).toContain(id);
    }
    expect(legal).not.toContain("gate");
  });

  test("'up to' — may be cast choosing no target", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .unit(P1, "base", { might: 2 }, "ally", EXHAUSTED)
      .hand(P1, CARD, "gate")
      .build();
    await game.p1.cast("gate", { targets: [] });
    await game.settle();
    expect(game.state("ally").isExhausted).toBe(true);
    expect(game.zoneOf("gate")).toBe("trash");
  });
});
