/**
 * Ruling fa9cda926f6947a1 — Seal of Unity (OGN-245 → ogn-245-298) · Gear · Order · [0] + [order]
 *     "[Exhaust]: [Reaction] — [Add] [order]."
 *
 * Q: Can you float energy from runes — tap a rune for energy, recycle that same rune, then spend the energy later this turn?
 * A: Yes. Tap a rune (+1 Energy), recycle it (e.g. to pay Seal of Unity's [order]), and the Energy already produced stays
 *    in your pool; combine it with energy from other sources to pay for a card later in the turn. Pools only empty at
 *    the end of the draw phase and at end of turn.
 * Rules: 159–161 (Rune Pool: Energy/Power persist until emptied), 417.2 (exhaust a rune: add 1 Energy), 417.3 (recycle a
 *        rune: add 1 Power), 315.4.c / 317.2.e (pools empty end of Draw Phase / Expiration Step).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const SEAL_OF_UNITY = "ogn-245-298";
const RECRUIT_2 = { cardType: "unit", domain: "order", energyCost: 2, might: 2, name: "Two-Drop" } as const;

/** P1's turn, empty pool; two ready order runes r1/r2; Seal of Unity + a 2-cost unit in hand. */
function board() {
  return scenario()
    .rune(P1, "order", { alias: "r1" })
    .rune(P1, "order", { alias: "r2" })
    .hand(P1, SEAL_OF_UNITY, "seal")
    .hand(P1, RECRUIT_2, "twodrop");
}

describe("Ruling fa9cda926f6947a1 — energy floats: tap a rune, recycle that rune, spend the energy later", () => {
  test("tap r1 (+1 energy), then RECYCLE the same exhausted r1 (+1 order power): r1 leaves the pool zone but the 1 energy it made is still floating", async () => {
    const game = await board().build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.p1.tapRune("r1");
    expect(game.p1.energy()).toBe(1);
    expect(game.state("r1").isExhausted).toBe(true);
    await game.p1.recycleRune("r1");
    expect(game.p1.runes()).toEqual(["r2"]); // r1 recycled to the rune deck
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.p1.energy()).toBe(1); // still there
    expect(game.p1.power("order")).toBe(1);
  });

  test("that power pays for Seal of Unity ([0] + [order]); the floating energy is untouched by the play", async () => {
    const game = await board().build();
    await game.p1.tapRune("r1");
    await game.p1.recycleRune("r1");
    await game.p1.play("seal");
    await game.settle();
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.p1.power("order")).toBe(0);
    expect(game.p1.energy()).toBe(1);
  });

  test("later in the same turn: the floated 1 (from the recycled rune) + 1 from tapping r2 pays for a 2-cost card", async () => {
    const game = await board().build();
    await game.p1.tapRune("r1");
    await game.p1.recycleRune("r1");
    await game.p1.play("seal");
    await game.settle();
    expect(game.p1.can("play", "twodrop")).toBe(false); // 1 energy is not enough yet
    await game.p1.tapRune("r2");
    expect(game.p1.energy()).toBe(2);
    await game.p1.play("twodrop");
    await game.settle();
    expect(game.zoneOf("twodrop")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("unspent floating energy/power survives across actions all turn and is only emptied at end of turn (Expiration Step)", async () => {
    const game = await board().build();
    await game.p1.tapRune("r1");
    await game.p1.recycleRune("r1");
    await game.p1.tapRune("r2");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1 } });
    await game.p1.play("seal"); // an unrelated action in between
    await game.settle();
    expect(game.p1.resources()).toMatchObject({ energy: 2 });
    await game.advanceTurn();
    const passes = game.trace().expiration;
    expect(passes[0]?.steps).toContain("empty-pools");
    expect(passes[0]?.poolsEmptied?.[P1]).toMatchObject({ energy: 2 });
    expect(game.p1.energy()).toBe(0);
  });
});
