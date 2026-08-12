/**
 * Ruling 4f86f6478129607e — Ezreal, Prodigy (SFD-149 → sfd-149-221)
 *   "Optional additional costs you pay cost [1] or [rainbow] less."
 *   × Legion Rearguard (ogn-010-298) · [2] · "[Accelerate] (You may pay [1][fury] as an additional
 *     cost to have me enter ready.)"
 *
 * Q: Does Ezreal, Prodigy's discount lower the cost of [Accelerate]?
 * A: Yes. [Accelerate] IS an optional additional cost, so Ezreal's reduction applies to it: the
 *    [1][fury] surcharge becomes [0][fury] or [1] (the player picks which half is waived).
 *    The discount is applied to the additional cost itself, not to the card's base cost.
 * Rules: 805.2 ([Accelerate] is an optional additional cost), 356.4.c (discounts fold into the
 *        additional cost as it is added to the total).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const EZREAL = "sfd-149-221";
const REARGUARD = "ogn-010-298"; // [2], 2 Might, [Accelerate] [1][fury]

type Quote = { energy: number; power: Record<string, number>; paidIds: string[]; entersReady: boolean };
const quotes = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) =>
  (game.p1.option("play", "rg")?.variants ?? []).map((v) => {
    const q = v.params.quote as Quote;
    return { energy: q.energy, entersReady: q.entersReady, paidIds: q.paidIds, power: q.power };
  });

const board = () => scenario().resources(P1, { energy: 9, power: { fury: 3 } }).hand(P1, REARGUARD, "rg");

describe("Ruling 4f86f6478129607e — Ezreal, Prodigy discounts [Accelerate]", () => {
  test("baseline (no Ezreal): the only Accelerate line is the printed [1][fury] on top of the [2] base — 3 Energy + 1 Fury", async () => {
    const game = await board().build();
    expect(quotes(game)).toEqual([
      { energy: 2, entersReady: false, paidIds: [], power: {} },
      { energy: 3, entersReady: true, paidIds: ["accelerate"], power: { fury: 1 } },
    ]);
  });

  test("with Ezreal on the board the Accelerate surcharge is [1] cheaper OR [rainbow] cheaper — and the full-price line is gone", async () => {
    const game = await board().unit(P1, "base", EZREAL, "ez").build();
    expect(quotes(game)).toEqual([
      { energy: 2, entersReady: false, paidIds: [], power: {} },
      { energy: 2, entersReady: true, paidIds: ["accelerate"], power: { fury: 1 } }, // the [1] waived
      { energy: 3, entersReady: true, paidIds: ["accelerate"], power: {} }, // the [fury] pip waived
    ]);
  });

  test("paying the discounted [0][fury] Accelerate really costs 2 Energy + 1 Fury and the Rearguard still enters ready", async () => {
    const game = await board().unit(P1, "base", EZREAL, "ez").build();
    await game.p1.play("rg", {
      accelerate: true,
      params: { additionalCostSpec: { energy: 0, power: ["fury"] } },
      to: "base",
    });
    // 9 → 7 Energy (base [2] + [0] surcharge), 3 → 2 Fury.
    expect(game.p1.resources()).toEqual({ energy: 7, power: { fury: 2 } });
    expect(game.state("rg").isReady).toBe(true);
    expect(game.zoneOf("rg")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("the other discounted shape — [1] with no pip — costs 3 Energy and 0 Fury, and still enters ready", async () => {
    const game = await board().unit(P1, "base", EZREAL, "ez").build();
    await game.p1.play("rg", {
      accelerate: true,
      params: { additionalCostSpec: { energy: 1, power: [] } },
      to: "base",
    });
    expect(game.p1.resources()).toEqual({ energy: 6, power: { fury: 3 } });
    expect(game.state("rg").isReady).toBe(true);
  });
});
