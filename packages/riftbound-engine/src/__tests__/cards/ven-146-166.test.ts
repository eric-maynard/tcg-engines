/**
 * Siphoning Strike — ven-146-166 · Spell · Calm/Mind · 4 energy
 *
 *   "Deal 4 to a unit at a battlefield. If you control 7 or more runes, deal 7 to it instead.
 *    When it dies this turn, channel 1 rune exhausted."
 *
 * Rules: 355.9 ("instead" replaces the amount — 4 OR 7, never both), 364.3 (the last sentence
 * installs a turn-scoped triggered ability on the SAME chosen unit), 430 (channel exhausted).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-146-166";

function board(runes: number, targetMight: number) {
  return scenario()
    .resources(P1, { energy: 4, power: { calm: 1, mind: 1 } })
    .runes(P1, "calm", runes)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: targetMight, name: "Victim" }, "foe")
    .hand(P1, CARD, "strike");
}

describe("Siphoning Strike (ven-146-166)", () => {
  test("under 7 runes: deals 4, NOT 4+7 — an 11-Might unit survives on 4 damage", async () => {
    const game = await board(3, 11).build();
    await game.p1.cast("strike", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.state("foe").damage).toBe(4);
  });

  test("with 7 runes: deals 7 INSTEAD of 4 — total damage is 7, not 11", async () => {
    const game = await board(7, 11).build();
    await game.p1.cast("strike", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.state("foe").damage).toBe(7);
  });

  test("the channel is gated on the chosen unit dying: it survives, so no rune is channeled", async () => {
    const game = await board(3, 11).build();
    const before = game.p1.runes().length;
    await game.p1.cast("strike", { targets: "foe" });
    await game.settle();
    expect(game.p1.runes().length).toBe(before);
  });

  test("when the chosen unit dies this turn, 1 rune is channeled exhausted", async () => {
    const game = await board(3, 3).build();
    const before = game.p1.runes().length;
    await game.p1.cast("strike", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.p1.runes().length).toBe(before + 1);
  });
});
