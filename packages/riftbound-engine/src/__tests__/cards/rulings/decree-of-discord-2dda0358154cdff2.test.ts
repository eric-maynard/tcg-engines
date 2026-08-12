/**
 * Ruling 2dda0358154cdff2 — Decree of Discord (VEN-107 → ven-107-166) · Chaos · [1][chaos]
 *     "Return any number of enemy Order ([order]) units with total Might 5 or less to their owners' hands."
 *
 * Q: Does it return ALL Order units below 5 Might, or any number whose COMBINED Might is 5 or less?
 * A: The latter. You choose the targets (any number, including zero) and their combined current Might must
 *    be 5 or less at finalization — five 1-Might units, one 5-Might unit, a 3 + a 2, … — but once the total
 *    would pass 5 you cannot add another. (Timing note: if the group is later pumped above 5, rule 355.11.b
 *    has you pick a legal subset of the ORIGINAL targets at resolution.)
 * Rules: 355.11 (group restrictions), 355.11.b (legal subset at resolution), 355.13 ("any number").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DECREE_OF_DISCORD = "ven-107-166";

const O = (might: number, name: string) => ({ domain: "order", might, name });

/** P1's main phase with [1][chaos]. P2 fields Order units of 3, 2, 1, 5 and 6 Might. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { chaos: 1 } })
    .unit(P2, "base", O(3, "Three"), "three")
    .unit(P2, "base", O(2, "Two"), "two")
    .unit(P2, "base", O(1, "One"), "one")
    .unit(P2, "base", O(5, "Five"), "five")
    .unit(P2, "base", O(6, "Six"), "six")
    .hand(P1, DECREE_OF_DISCORD, "decree");
}

const MIGHT: Record<string, number> = { five: 5, one: 1, six: 6, three: 3, two: 2 };

function offeredSets(game: Game): string[][] {
  const field = game.p1.option("cast", "decree")?.fields.find((f) => f.arg === "targets");
  return (field?.options ?? []).map((o) => [...(o as string[])].sort());
}

describe("Ruling 2dda0358154cdff2 — Decree of Discord is a 'total Might 5 or less' group, not 'each under 5'", () => {
  test("ruling: every offered group totals 5 or less — nothing over the cap is on the menu", async () => {
    const game = await board().build();
    for (const set of offeredSets(game)) {
      const total = set.reduce((n, id) => n + (MIGHT[id] ?? 0), 0);
      expect(total).toBeLessThanOrEqual(5);
    }
  });

  test("ruling: a 3 + a 2 (exactly 5) is legal, and so is the lone 5", async () => {
    const game = await board().build();
    const keys = offeredSets(game).map((s) => s.join("+"));
    expect(keys).toContain("three+two");
    expect(keys).toContain("five");
  });

  test("ruling: once the total hits 5 you cannot add another — 3 + 2 + anything is absent", async () => {
    const game = await board().build();
    const keys = offeredSets(game).map((s) => s.join("+"));
    expect(keys).not.toContain("one+three+two"); // 6
    expect(keys).not.toContain("five+one"); // 6
  });

  test("ruling: it is NOT 'all Order units below 5' — the 6-Might Order unit is never a target", async () => {
    const game = await board().build();
    for (const set of offeredSets(game)) {
      expect(set).not.toContain("six");
    }
  });

  test("returning the chosen 3 + 2 leaves everything else on the board", async () => {
    const game = await board().build();
    await game.p1.cast("decree", { targets: ["three", "two"] });
    await game.settle();
    expect(game.zoneOf("three")).toBe("hand");
    expect(game.zoneOf("two")).toBe("hand");
    expect(game.zoneOf("one")).toBe("base");
    expect(game.zoneOf("five")).toBe("base");
    expect(game.zoneOf("six")).toBe("base");
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("five 1-Might Order units total exactly 5, so all five may be returned at once", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .unit(P2, "base", O(1, "A"), "a")
      .unit(P2, "base", O(1, "B"), "b")
      .unit(P2, "base", O(1, "C"), "c")
      .unit(P2, "base", O(1, "D"), "d")
      .unit(P2, "base", O(1, "E"), "e")
      .hand(P1, DECREE_OF_DISCORD, "decree")
      .build();
    await game.p1.cast("decree", { targets: ["a", "b", "c", "d", "e"] });
    await game.settle();
    expect(["a", "b", "c", "d", "e"].map((u) => game.zoneOf(u))).toEqual(["hand", "hand", "hand", "hand", "hand"]);
  });
});
