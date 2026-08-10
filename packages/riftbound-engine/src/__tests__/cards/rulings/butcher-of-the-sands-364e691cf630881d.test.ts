/**
 * Ruling 364e691cf630881d — Butcher of the Sands (VEN-141 → ven-141-166) · Legend (Renekton) · Fury/Body
 *   "[Reaction] [rainbow][rainbow], [Exhaust]: [Add] [2]. Spend this Energy only to play units or activated abilities of units."
 *   × Rek'Sai, Breacher (sfd-029-221) · Unit · [3] · "[Accelerate] (You may pay [1][fury] … to have me enter ready.) …"
 *
 * Q: Does Renekton's legend ability work on the Accelerate cost?
 * A: Yes for the ENERGY part: Accelerate's [1] is paid while playing a unit, which fits the spending restriction. It adds
 *    no Power, so the Accelerate Power must come from elsewhere. Activate it before (or as) you pay.
 * Rules: 805.1.a / 805.2 (Accelerate = optional additional cost paid in the Pay Costs step of playing the unit), 357,
 *        429 ([Add]), earmarked energy ("spend only to play units …").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BUTCHER = "ven-141-166";
const REKSAI_BREACHER = "sfd-029-221";

/**
 * P1's turn: legend Butcher (ready), Rek'Sai Breacher in hand.
 * Pool: [2] real energy + `fury` Fury power — 2 of the power feeds the legend, whatever is left is for Accelerate.
 */
function board(fury: number) {
  return scenario()
    .resources(P1, { energy: 2, power: { fury } })
    .legend(P1, BUTCHER, "butcher")
    .hand(P1, REKSAI_BREACHER, "reksai")
    .unit(P2, "base", { might: 1 }, "dummy");
}

describe("Ruling 364e691cf630881d — Renekton's earmarked [2] can pay the Energy part of an Accelerate cost", () => {
  test("before the Add, [2] real energy cannot even play the [3] Rek'Sai, let alone Accelerate her", async () => {
    const game = await board(3).build();
    expect(game.p1.can("play", "reksai")).toBe(false);
  });

  test("Add [2] (exhaust + 2 fury) → 4 energy; playing Rek'Sai WITH Accelerate spends all 4 ([3] + Accelerate's [1]) and the remaining fury: she enters READY", async () => {
    const game = await board(3).build();
    await game.p1.activate("butcher");
    expect(game.state("butcher").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } });
    expect(game.chain()).toEqual([]); // an [Add] resolves at once
    await game.p1.play("reksai", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // the earmarked energy paid the Accelerate [1] too
    await game.settle();
    expect(game.state("reksai")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("without Accelerate the same play spends only [3]: 1 (earmarked) energy and the fury are left over and she enters exhausted", async () => {
    const game = await board(3).build();
    await game.p1.activate("butcher");
    await game.p1.play("reksai", { accelerate: false });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    await game.settle();
    expect(game.state("reksai")).toMatchObject({ isExhausted: true, zone: "base" });
  });

  test("note (1): the legend adds Energy only — with exactly 2 fury (all spent on the Add) there is no Power for Accelerate: the plain play is legal, the accelerated one is refused", async () => {
    const game = await board(2).build();
    await game.p1.activate("butcher");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 0 } });
    expect(game.p1.can("play", "reksai")).toBe(true);
    const r = await game.p1.try((p) => p.play("reksai", { accelerate: true }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("reksai")).toBe("hand");
    await game.p1.play("reksai", { accelerate: false });
    await game.settle();
    expect(game.state("reksai").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(1);
  });
});
