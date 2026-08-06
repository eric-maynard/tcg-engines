/**
 * Mageseeker Warden — ogn-070-298 · Unit · Calm · 6 energy + 1 [calm] · 5 might
 *
 *   While I'm at a battlefield, opponents can only play units to their base.
 *   While I'm at a battlefield, spells and abilities can't ready enemy units and gear.
 *
 * Both are "while" statics conditioned on the Warden's location. Readying probe:
 * Acceleration Gate (ven-150-166, 3 energy + [rainbow]: "Ready up to 4 units,
 * gear, and/or runes").
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const WARDEN = "ogn-070-298";
const GATE = "ven-150-166";
const FILLER = "ogn-175-298";
const EXHAUSTED = { __flags: { exhausted: true } } as const;

/** P2's turn. P1's Warden sits at `wardenAt`; P2 controls bf2 and has exhausted stuff + a Gate. */
function board(wardenAt: "base" | "bf1") {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 5, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, wardenAt, WARDEN, "warden")
    .unit(P2, "bf2", { might: 2 }, "holder")
    .unit(P2, "base", { might: 2 }, "tired", EXHAUSTED)
    .gear(P2, { name: "Trinket" }, "trinket", EXHAUSTED)
    .hand(P2, FILLER, "recruit")
    .hand(P2, GATE, "gate");
}

describe("Mageseeker Warden (ogn-070-298)", () => {
  test("cost: 6 energy + 1 calm; a 5-might unit; unaffordable without the calm or with 5 energy", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { calm: 1 } }).hand(P1, WARDEN, "warden").build();
    await game.p1.play("warden", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("warden")).toBe("base");
    expect(game.state("warden").might).toBe(5);
    expect((await scenario().resources(P1, { energy: 6 }).hand(P1, WARDEN, "w").build()).p1.can("play", "w")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5, power: { calm: 1 } }).hand(P1, WARDEN, "w").build()).p1.can("play", "w")).toBe(false);
  });

  test("control: with the Warden in its base, the opponent may play a unit to a battlefield they control", async () => {
    const game = await board("base").build();
    const to = game.p2.option("play", "recruit")?.fields.find((f) => f.arg === "to")?.options;
    expect(to).toEqual(expect.arrayContaining(["base", "battlefield-bf2"]));
  });

  test("while the Warden is at a battlefield, opponents can only play units to their base", async () => {
    // Expected: P2's only legal play location is "base" (bf2 is not offered / rejected).
    // Actual: the first static is not parsed at all; P2 may still play the unit to bf2.
    const game = await board("bf1").build();
    const to = game.p2.option("play", "recruit")?.fields.find((f) => f.arg === "to")?.options;
    expect(to).toEqual(["base"]);
    const t = await game.p2.try((p) => p.play("recruit", { to: "bf2" }));
    expect(t.ok).toBe(false);
  });

  test("control: with the Warden in its base, an opponent's spell readies their unit and gear", async () => {
    const game = await board("base").build();
    await game.p2.cast("gate", { targets: ["tired", "trinket"] });
    await game.settle();
    expect(game.state("tired").isExhausted).toBe(false);
    expect(game.state("trinket").isExhausted).toBe(false);
  });

  test("while the Warden is at a battlefield, an opponent's spell can't ready enemy (their own) units and gear", async () => {
    // Expected: Acceleration Gate resolves but P2's exhausted unit and gear stay exhausted.
    // Actual: the restriction static is stored as free text and never enforced; both ready.
    const game = await board("bf1").build();
    await game.p2.cast("gate", { targets: ["tired", "trinket"] });
    await game.settle();
    expect(game.zoneOf("gate")).toBe("trash");
    expect(game.state("tired").isExhausted).toBe(true);
    expect(game.state("trinket").isExhausted).toBe(true);
  });

  test("only ENEMY units: the Warden's controller can still ready their own units with a spell", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", WARDEN, "warden")
      .unit(P1, "base", { might: 2 }, "mine", EXHAUSTED)
      .hand(P1, GATE, "gate")
      .build();
    await game.p1.cast("gate", { targets: ["mine"] });
    await game.settle();
    expect(game.state("mine").isExhausted).toBe(false);
  });

  test("only SPELLS AND ABILITIES: the normal start-of-turn ready still readies enemy units", async () => {
    const game = await scenario()
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", WARDEN, "warden")
      .unit(P2, "base", { might: 2 }, "tired", EXHAUSTED)
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("tired").isExhausted).toBe(false);
  });
});
