/**
 * Ruling 1ecf24e5c93cfaa9 — Ezreal, Prodigy (SFD-149 → sfd-149-221) · 3+[chaos] · 3 Might
 *   "… Optional additional costs you pay cost [1] or [rainbow] less."
 *   × Shadow Fiend (VEN-014 → ven-014-166) "[Empower] [2][fury] ([2][fury]: Empower me.)"
 *   × Blood Rush (SFD-003 → sfd-003-221) "[Repeat] [1] (You may pay the additional cost to repeat …)"
 *
 * Q: Is [Empower] an optional additional cost (so Ezreal, Prodigy discounts it)?
 * A: No. [Empower] is an ACTIVATED ability keyword; its listed price is that ability's base cost, not an
 *    additional cost of playing a card. "Optional additional cost" needs both "as an additional cost" and
 *    "may" — Accelerate and [Repeat] qualify, [Empower] and [Equip] do not. You pay Empower in full.
 * Rules: 827.1 ([Empower] is an activated ability), 356.2.b.1 (optional additional costs), 204.1.b (base
 *        cost of an activated ability), 820 ([Repeat] IS an optional additional cost).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const EZREAL_PRODIGY = "sfd-149-221";
const SHADOW_FIEND = "ven-014-166";
const BLOOD_RUSH = "sfd-003-221";

/** P1's turn: Shadow Fiend + a Runner in base, optionally Ezreal, Prodigy alongside; `pool` is the whole rune pool. */
function board(withEzreal: boolean, pool: { energy: number; fury?: number }) {
  let b = scenario()
    .resources(P1, { energy: pool.energy, power: { fury: pool.fury ?? 0 } })
    .unit(P1, "base", SHADOW_FIEND, "fiend")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .hand(P1, BLOOD_RUSH, "rush");
  if (withEzreal) {
    b = b.unit(P1, "base", EZREAL_PRODIGY, "ezreal");
  }
  return b;
}

describe("Ruling 1ecf24e5c93cfaa9 — [Empower] is an activated ability's base cost, so Ezreal, Prodigy does not discount it", () => {
  test("baseline (no Ezreal): Shadow Fiend's [Empower] costs [2][fury] exactly", async () => {
    const game = await board(false, { energy: 2, fury: 1 }).build();
    expect(game.state("fiend").isEmpowered).toBe(false);
    await game.p1.activate("fiend", 0);
    await game.settle();
    expect(game.state("fiend").isEmpowered).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("ruling: WITH Ezreal on board, [1][fury] is still not enough — the Empower cost is not reduced by [1]", async () => {
    const game = await board(true, { energy: 1, fury: 1 }).build();
    expect(game.p1.can("activate", "fiend")).toBe(false);
    const r = await game.p1.try((p) => p.activate("fiend", 0));
    expect(r.ok).toBe(false);
    expect(game.state("fiend").isEmpowered).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } }); // nothing spent
  });

  test("ruling: WITH Ezreal on board the full [2][fury] is charged — no [1] and no [rainbow] comes off", async () => {
    const game = await board(true, { energy: 2, fury: 1 }).build();
    await game.p1.activate("fiend", 0);
    await game.settle();
    expect(game.state("fiend").isEmpowered).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("contrast: Blood Rush's [Repeat] [1] IS an optional additional cost — with Ezreal out it costs [1] less, so [1] total buys the repeat", async () => {
    const game = await board(true, { energy: 1 }).build();
    await game.p1.cast("rush", { repeat: 1, targets: ["runner"] });
    await game.settle();
    expect(game.p1.energy()).toBe(0); // base [1] paid, the repeat's [1] discounted away
    expect(game.state("runner").grantedKeywords).toHaveLength(2); // the effect ran twice
  });

  test("contrast control: WITHOUT Ezreal the same [Repeat] play needs [1]+[1]", async () => {
    const game = await board(false, { energy: 1 }).build();
    const r = await game.p1.try((p) => p.cast("rush", { repeat: 1, targets: ["runner"] }));
    expect(r.ok).toBe(false);
  });
});
