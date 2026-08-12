/**
 * Ruling 3bbe8b96c97a6f77 — Kayn, Unleashed (OGN-189 → ogn-189-298) · Unit/Champion · Chaos · [6][chaos] · 6 Might
 *   "[Ganking]\nIf I have moved twice this turn, I don't take damage."
 *
 * Q: Assigning showdown damage against several enemy units, one with [Tank] — must ALL of it go to the Tank,
 *    even past lethal, or can the excess go elsewhere once the Tank has lethal?
 * A: The Tank must be assigned damage FIRST, but only up to lethal: once damage equal to its Might is on it,
 *    the rest must go to the other units. Tank fixes the order, never the amount. All the assigned damage is
 *    then dealt at once. Kayn's own clause is the exception the rules name: a unit that cannot be dealt damage
 *    is exempt from mandatory-assignment considerations entirely.
 * Rules: 465.2.c.3 (lethal in full before moving on), 465.2.c.4 (never more than the minimum lethal while
 *        units remain), 465.2.c.6 ([Tank] = "must be assigned combat damage first"),
 *        465.2.c.1.a (assignment ≠ dealing; all dealt simultaneously), 465.2.c.10 (Kayn is the CR's example).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAYN_UNLEASHED = "ogn-189-298";
const RIDE_THE_WIND = "ogn-173-298";
const unit = (might: number, name: string, keywords?: readonly string[]) =>
  ({ cardType: "unit", energyCost: 1, keywords, might, name }) as const;

/** Kayn (6 Might) attacks bf1, defended by a 2-Might [Tank], a 2-Might Alpha and a 4-Might Beta. */
async function kaynIntoTankLine(): Promise<Game> {
  const game = await scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", unit(2, "Tanky", ["Tank"]), "tank")
    .unit(P2, "bf1", unit(2, "Alpha"), "a")
    .unit(P2, "bf1", unit(4, "Beta"), "b")
    .unit(P1, "base", KAYN_UNLEASHED, "kayn")
    .build();
  await game.p1.move("kayn", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

describe("Ruling 3bbe8b96c97a6f77 — [Tank] fixes the ORDER of damage assignment, not the amount", () => {
  test("the assignment prompt states each unit's lethal amount and offers a Tank-first default", async () => {
    const game = await kaynIntoTankLine();

    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 6 });
    expect((game.decision() as { buckets: unknown[] }).buckets).toMatchObject([
      { key: "tank", lethal: 2 },
      { key: "a", lethal: 2 },
      { key: "b", lethal: 4 },
    ]);
  });

  test("dumping all 6 onto the Tank is illegal — nothing past its lethal 2 may stay there while other units remain", async () => {
    const game = await kaynIntoTankLine();

    const attempt = await game.p1.try((p) => p.distribute({ tank: 6 }));

    expect(attempt.ok).toBe(false);
  });

  test("skipping the Tank is illegal too — it must be assigned first", async () => {
    const game = await kaynIntoTankLine();

    const attempt = await game.p1.try((p) => p.distribute({ a: 2, b: 4 }));

    expect(attempt.ok).toBe(false);
  });

  test("lethal 2 to the Tank and the remaining 4 elsewhere is legal, and the damage lands simultaneously", async () => {
    const game = await kaynIntoTankLine();

    await game.p1.distribute({ b: 4, tank: 2 });
    await game.settle();

    expect(game.zoneOf("tank")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("a")).toBe("battlefield-bf1"); // never assigned anything
    expect(game.violations()).toEqual([]);
  });

  test("Kayn's own clause: after two moves in a turn he takes no damage at all, so lethal never applies to him", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", unit(6, "Guard"), "guard")
      .unit(P1, "base", KAYN_UNLEASHED, "kayn")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();

    await game.p1.move("kayn", "bf1"); // move #1
    await game.settle();
    const staged = game.decision();
    if (staged?.kind === "action" && staged.context === "showdown") {
      await game.seat(staged.seat).passFocus();
    }
    await game.p1.cast("rtw", { targets: "kayn" }); // move #2 (and ready him)
    await game.p1.pick("battlefield-bf2");
    await game.settle();

    expect(game.locationOf("kayn")).toBe("bf2");
    expect(game.zoneOf("guard")).toBe("trash"); // Kayn's 6 killed the 6-Might Guard…
    expect(game.zoneOf("kayn")).toBe("battlefield-bf2"); // …and the Guard's 6 did nothing to him
  });

  test("control — Kayn who moved only once takes the damage and dies to the same 6-Might Guard", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", unit(6, "Guard"), "guard")
      .unit(P1, "base", KAYN_UNLEASHED, "kayn")
      .build();

    await game.p1.move("kayn", "bf2");
    await game.settle();

    expect(game.zoneOf("kayn")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
  });
});
