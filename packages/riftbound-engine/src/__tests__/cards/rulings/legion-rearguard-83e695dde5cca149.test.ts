/**
 * Ruling 83e695dde5cca149 — Legion Rearguard (OGN-010 → ogn-010-298) · Unit · Fury · [2] · 2 Might
 *     "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)"
 *   × Fury Rune (OGN-007 → ogn-007-298) — the runes that pay for it (and Seal of Rage ogn-040-298 for the "gear pays power" nuance).
 *
 * Q: To Accelerate Legion Rearguard, do I tap 3 runes AND recycle a fury rune, or tap 2 and recycle 1?
 * A: The total is [3] Energy (2 base + 1 from Accelerate — paid by exhausting three runes) AND 1 [fury] Power (recycling a fury rune, or a
 *    fury-producing gear). Numbers are Energy (only runes tapped), the rune icon is Power (recycle a rune of that domain or tap such gear);
 *    gear can never pay Energy.
 * Rules: 159–161 (Energy vs Power; exhaust a rune = 1 Energy, recycle = 1 Power of its domain), 811 / 356.2.b (Accelerate = +[1][C]).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LEGION_REARGUARD = "ogn-010-298";
const SEAL_OF_RAGE = "ogn-040-298"; // Gear: [Exhaust]: [Reaction] — [Add] [fury]

/** P1's turn, empty pool, `n` ready Fury Runes channeled, Rearguard in hand. */
function board(n: number) {
  return scenario().battlefield("bf1", { controller: P2 }).runes(P1, "fury", n).hand(P1, LEGION_REARGUARD, "lr");
}

describe("Ruling 83e695dde5cca149 — Accelerated Legion Rearguard costs 3 Energy (three taps) plus 1 fury Power (one recycle)", () => {
  test("four Fury Runes: tap THREE (→ 3 energy) and recycle ONE (→ 1 fury power) — exactly enough; the accelerated play empties the pool and it enters READY", async () => {
    const game = await board(4).build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.p1.recycleRune({ domain: "fury" });
    await game.p1.tapRunes(3);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(game.p1.runes({ ready: true })).toEqual([]); // 1 recycled away, the other 3 exhausted
    expect(game.p1.runes()).toHaveLength(3);
    await game.p1.play("lr", { accelerate: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // all of 3 + fury consumed
    await game.settle();
    expect(game.state("lr")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("'tap 2 + recycle 1' is NOT enough: with 2 energy + 1 fury the accelerated play is not offered/refused — only the plain [2] play is, and it enters exhausted (the fury stays unspent)", async () => {
    const game = await board(3).build();
    await game.p1.tapRunes(2);
    await game.p1.recycleRune({ domain: "fury" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    const accelerated = (game.p1.option("play", "lr")?.variants ?? []).some((v) => v.params.paidAdditionalCost === true);
    expect(accelerated).toBe(false);
    expect((await game.p1.try((p) => p.play("lr", { accelerate: true, to: "base" }))).ok).toBe(false);
    await game.p1.play("lr", { accelerate: false, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } });
    await game.settle();
    expect(game.state("lr")).toMatchObject({ isExhausted: true, zone: "base" });
  });

  test("Energy can't stand in for the Power pip: 4 energy (four taps) and NO fury power cannot Accelerate either", async () => {
    const game = await board(4).build();
    await game.p1.tapRunes(4);
    expect(game.p1.resources()).toEqual({ energy: 4, power: {} });
    expect((await game.p1.try((p) => p.play("lr", { accelerate: true, to: "base" }))).ok).toBe(false);
    expect(game.p1.can("play", "lr")).toBe(true); // the plain play is fine
  });

  test("nuance — a fury GEAR (Seal of Rage) can supply the Power instead of recycling: tap three runes + exhaust the Seal → Accelerate; but the Seal can never supply Energy (2 taps + Seal + a recycle still lacks the 3rd energy)", async () => {
    const ok = await board(3).gear(P1, SEAL_OF_RAGE, "seal").build();
    await ok.p1.tapRunes(3);
    await ok.p1.activate("seal");
    expect(ok.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(ok.p1.runes()).toHaveLength(3); // nothing recycled
    await ok.p1.play("lr", { accelerate: true, to: "base" });
    await ok.settle();
    expect(ok.state("lr").isReady).toBe(true);

    const short = await board(3).gear(P1, SEAL_OF_RAGE, "seal").build();
    await short.p1.tapRunes(2);
    await short.p1.recycleRune({ domain: "fury" });
    await short.p1.activate("seal");
    expect(short.p1.resources()).toEqual({ energy: 2, power: { fury: 2 } }); // plenty of power, still only 2 energy
    expect((await short.p1.try((p) => p.play("lr", { accelerate: true, to: "base" }))).ok).toBe(false);
  });
});
