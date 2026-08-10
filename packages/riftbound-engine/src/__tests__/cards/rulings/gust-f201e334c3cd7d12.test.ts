/**
 * Ruling f201e334c3cd7d12 — Gust (OGN-169 → ogn-169-298) · Spell · Chaos · [1] · Reaction
 *   "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Discipline (OGN-058 → ogn-058-298) "[Reaction] Give a unit +2 [Might] this turn. Draw 1."
 *   × Smoke Screen (OGN-093 → ogn-093-298) "[Reaction] Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: Does Gust check printed or CURRENT Might, and does damage lower Might?
 * A: Current Might. Damage does not change Might. A 3-Might unit Disciplined to 5 is NOT a legal Gust target; a 5-Might
 *    unit Smoke-Screened down to 3-or-less IS. With no legal target Gust can't be played at all.
 * Rules: 476–478 (Might arithmetic), 355.8 (must have a legal target to be played), 437 (damage is marked, not −Might).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const DISCIPLINE = "ogn-058-298";
const SMOKE_SCREEN = "ogn-093-298";

function gustTargets(game: Game): string[] {
  const field = game.p1.option("cast", "gust")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/** P1's turn; P2 holds bf1 with a printed-3 "small" and a printed-5 "big". P1 has Gust, Discipline, Smoke Screen and plenty. */
function board(meta: { smallDamage?: number } = {}) {
  return scenario()
    .resources(P1, { energy: 8, power: { calm: 1, mind: 1, chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Small" }, "small", meta.smallDamage ? { damage: meta.smallDamage } : undefined)
    .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
    .hand(P1, GUST, "gust")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P1, SMOKE_SCREEN, "smoke");
}

describe("Ruling f201e334c3cd7d12 — Gust reads CURRENT Might; damage is not a Might reduction", () => {
  test("baseline: printed 3 is offered, printed 5 is not", async () => {
    const game = await board().build();
    expect(gustTargets(game)).toEqual(["small"]);
  });

  test("damage does not lower Might: a printed-5 unit carrying 2 damage is still 5 Might and NOT a Gust target; a damaged 3 is still 3 and IS", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Small" }, "small", { damage: 2 })
      .unit(P2, "bf1", { might: 5, name: "Big" }, "big", { damage: 2 })
      .hand(P1, GUST, "gust")
      .build();
    expect(game.state("big")).toMatchObject({ damage: 2, might: 5 });
    expect(game.state("small")).toMatchObject({ damage: 2, might: 3 });
    expect(gustTargets(game)).toEqual(["small"]);
    const r = await game.p1.try((p) => p.cast("gust", { targets: "big" }));
    expect(r.ok).toBe(false);
  });

  test("Discipline on the 3-Might unit makes it 5 this turn → it is no longer a legal Gust target (and with no other ≤3 unit Gust can't be played, 355.8)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
      .hand(P1, GUST, "gust")
      .hand(P1, DISCIPLINE, "disc")
      .build();
    expect(gustTargets(game)).toEqual(["small"]);
    await game.p1.cast("disc", { targets: "small" });
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("small").might).toBe(5);
    expect(game.p1.can("cast", "gust")).toBe(false);
    const r = await game.p1.try((p) => p.cast("gust", { targets: "small" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
  });

  test("Smoke Screen on the 5-Might unit takes it to 1 this turn → it becomes a legal Gust target and is returned to hand", async () => {
    const game = await board().build();
    expect(gustTargets(game)).not.toContain("big");
    await game.p1.cast("smoke", { targets: "big" });
    await game.settle();
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.state("big").might).toBe(1);
    expect(gustTargets(game)).toEqual(["big", "small"]);
    await game.p1.cast("gust", { targets: "big" });
    await game.settle();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("big")).toBe("hand");
    expect(game.p2.hand()).toContain("big");
    expect(game.violations()).toEqual([]);
  });
});
