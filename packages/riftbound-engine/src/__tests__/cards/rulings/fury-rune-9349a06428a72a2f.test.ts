/**
 * Ruling 9349a06428a72a2f — Fury Rune (OGN-007 → ogn-007-298) × Seal of Rage (OGN-040 → ogn-040-298)
 *   × Chaos Rune (OGN-166 → ogn-166-298) × Vi, Destructive (OGN-036 → ogn-036-298)
 *
 *   Seal of Rage — Gear · Fury · [0]+[fury]: "[Exhaust]: [Reaction] — [Add] [fury]."
 *   Vi, Destructive — Unit · Fury · [2]+[fury] · 3 Might.
 *
 * Q: Can you tap a Fury Rune for Energy, recycle that same rune for Power, play Seal of Rage with the Power, and then
 *    use the Energy from the Fury Rune plus a Chaos Rune to play Vi, Destructive?
 * A: Yes. Energy and Power sit in separate pools that persist through your turn: the Energy made by exhausting the
 *    Fury Rune is still there after the rune itself has been recycled and its Power spent.
 * Rules: 159–161 (Rune Pool: Energy and Power are held until spent / end of turn), 605–607 (rune abilities:
 *        [Exhaust]: Add [1]; Recycle: Add [C]).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const FURY_RUNE = "ogn-007-298";
const CHAOS_RUNE = "ogn-166-298";
const SEAL_OF_RAGE = "ogn-040-298";
const VI = "ogn-036-298";

function board() {
  return scenario()
    .rune(P1, FURY_RUNE, { alias: "furyRune" })
    .rune(P1, CHAOS_RUNE, { alias: "chaosRune" })
    .hand(P1, SEAL_OF_RAGE, "seal")
    .hand(P1, VI, "vi");
}

describe("Ruling 9349a06428a72a2f — Energy from a rune survives that rune being recycled for Power", () => {
  test("step by step: tap Fury Rune (+1 Energy) → recycle it (+1 fury, rune to the rune deck) — the Energy is still in the pool", async () => {
    const game = await board().build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.p1.tapRune("furyRune");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.state("furyRune").isExhausted).toBe(true);
    // An exhausted rune can still be recycled for its Power.
    await game.p1.recycleRune("furyRune");
    expect(game.zoneOf("furyRune")).toBe("runeDeck");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } }); // Energy kept, Power added
  });

  test("…play Seal of Rage with that [fury] (Energy untouched), then Fury-Rune Energy + Chaos Rune Energy (+ the Seal's [fury]) pays for Vi, Destructive", async () => {
    const game = await board().build();
    await game.p1.tapRune("furyRune");
    await game.p1.recycleRune("furyRune");
    await game.p1.play("seal");
    await game.settle();
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } }); // Seal cost [0]+[fury]; the 1 Energy persists
    // Vi needs [2]+[fury]: second Energy from the Chaos Rune, the fury pip from the Seal itself.
    await game.p1.tapRune("chaosRune");
    expect(game.p1.energy()).toBe(2);
    await game.p1.activate("seal");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    expect(game.p1.can("play", "vi")).toBe(true);
    await game.p1.play("vi");
    await game.settle();
    expect(game.zoneOf("vi")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("the pools only empty at end of turn: unspent, that Fury-Rune Energy is still there at the end of the main phase and gone next turn", async () => {
    const game = await board().build();
    await game.p1.tapRune("furyRune");
    await game.p1.recycleRune("furyRune");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    await game.advanceTurn();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.trace().expiration.at(-1)?.poolsEmptied?.[P1]).toMatchObject({ energy: 1 });
  });
});
