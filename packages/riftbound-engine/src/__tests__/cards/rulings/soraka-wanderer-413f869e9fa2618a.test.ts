/**
 * Ruling 413f869e9fa2618a — Soraka, Wanderer (SFD-173 → sfd-173-221) · 4 Might
 *   "I must be assigned combat damage last. If another unit you control HERE would die, if it has less
 *    Might than me, instead heal it, exhaust it, and recall it."
 *   × Deathgrip (sfd-163-221), used only to kill a friendly unit on demand.
 *
 * Q: Soraka is in my base and another base unit would die — is it still saved, even though "recall"
 *    cannot move it anywhere?
 * A: Yes. "Here" is her location, base included, so base units are valid. The recall instruction is
 *    simply redundant: the unit is already at base and stays there, healed and exhausted.
 * Rules: 450 (recall relocates a permanent to its base — a no-op if it is already there), 370
 *        (a replacement executes as much as it can).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SORAKA = "sfd-173-221";
const DEATHGRIP = "sfd-163-221";

/** Soraka and two friendly units in P1's base; one more friendly unit off at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", SORAKA, "soraka")
    .unit(P1, "base", { might: 2, name: "Small" }, "small", { damage: 1 })
    .unit(P1, "base", { might: 5, name: "Bigger" }, "bigger")
    .unit(P1, "bf1", { might: 2, name: "Away" }, "away")
    .hand(P1, DEATHGRIP, "grip");
}

describe("Ruling 413f869e9fa2618a — Soraka's replacement works at her base, redundant recall and all", () => {
  test("a smaller base unit that would die is healed, exhausted and left at base instead of dying", async () => {
    const game = await board().build();
    expect(game.state("small").damage).toBe(1);

    await game.p1.cast("grip", { targets: "small", answers: ["bigger"] });
    await game.settle();

    expect(game.zoneOf("small")).toBe("base"); // not the trash
    expect(game.locationOf("small")).toBe("base");
    expect(game.state("small").damage).toBe(0); // healed
    expect(game.state("small").isExhausted).toBe(true); // exhausted
    expect(game.zoneOf("soraka")).toBe("base"); // Soraka herself is untouched
    expect(game.violations()).toEqual([]);
  });

  test("a base unit with Might NOT less than Soraka's is not saved", async () => {
    const game = await board().build();
    await game.p1.cast("grip", { targets: "bigger", answers: ["small"] });
    await game.settle();
    expect(game.zoneOf("bigger")).toBe("trash"); // 5 Might ≥ Soraka's 4
  });

  test("'here' really is her location: an equally small friendly unit at a battlefield dies normally", async () => {
    const game = await board().build();
    await game.p1.cast("grip", { targets: "away", answers: ["small"] });
    await game.settle();
    expect(game.zoneOf("away")).toBe("trash");
  });

  test("mirror: with Soraka AT the battlefield instead, the battlefield unit is saved and the base unit is not", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SORAKA, "soraka")
      .unit(P1, "bf1", { might: 2, name: "Away" }, "away")
      .unit(P1, "base", { might: 2, name: "Small" }, "small")
      .hand(P1, DEATHGRIP, "grip")
      .build();

    await game.p1.cast("grip", { targets: "away", answers: ["small"] });
    await game.settle();
    expect(game.zoneOf("away")).toBe("base"); // recalled out of the battlefield
    expect(game.locationOf("away")).toBe("base");
    expect(game.state("away").isExhausted).toBe(true);
  });

  test("and a friendly unit dying at P1's base while Soraka stands at bf1 is NOT saved", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SORAKA, "soraka")
      .unit(P1, "base", { might: 2, name: "Small" }, "small")
      .unit(P1, "base", { might: 2, name: "Spare" }, "spare")
      .hand(P1, DEATHGRIP, "grip")
      .build();

    await game.p1.cast("grip", { targets: "small", answers: ["spare"] });
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.p2.hand()).toEqual([]);
  });
});
