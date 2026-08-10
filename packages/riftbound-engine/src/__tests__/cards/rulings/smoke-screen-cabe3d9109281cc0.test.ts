/**
 * Ruling cabe3d9109281cc0 — Smoke Screen (OGN-093 → ogn-093-298) · Reaction · Mind · 2
 *     "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × Watchful Sentry (OGN-096 → ogn-096-298) · 1 Might
 *   × Discipline (OGN-058 → ogn-058-298) · Reaction · Calm · 2 · "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: Smoke Screen resolves on a Watchful Sentry (1 Might); afterwards Discipline is played on it. 1 Might or 3?
 * A: 3. Smoke Screen's reduction is snapshotted when it resolves: on a 1-Might unit "to a minimum of 1" means the
 *    reduction taken is 0, and that fixed amount is what applies for the turn. Discipline's later +2 is not eaten
 *    by it: 1 + 2 − 0 = 3.
 * Rules: 336/340 (each spell resolves fully in turn), "to a minimum of 1" reductions lock their amount on resolution.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const DISCIPLINE = "ogn-058-298";

/** P1's turn. P1: Watchful Sentry (1) in base; Smoke Screen + Discipline in hand; exactly [4] + mind; known deck top. */
function board() {
  return scenario()
    .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
    .unit(P2, "base", { might: 5, name: "Bystander" }, "by")
    .hand(P1, SMOKE_SCREEN, "smoke")
    .hand(P1, DISCIPLINE, "disc")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
    .resources(P1, { energy: 4, power: { mind: 1 } });
}

/** P1 Smoke Screens its own Sentry and lets it resolve on an otherwise empty chain. */
async function smokeResolved(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sentry").might).toBe(1);
  await game.p1.cast("smoke", { targets: "sentry" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["smoke"]);
  await game.settle();
  expect(game.zoneOf("smoke")).toBe("trash");
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling cabe3d9109281cc0 — Smoke Screen on a 1-Might unit snapshots a 0 reduction; a later Discipline makes it 3", () => {
  test("step 1: Smoke Screen resolves on the 1-Might Sentry — it stays at 1 (cannot be reduced below the minimum)", async () => {
    const game = await smokeResolved();
    expect(game.state("sentry").might).toBe(1);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 0 } });
  });

  test("step 2–3: Discipline played and resolved afterwards → Sentry = 1 + 2 = 3 (the snapshotted 0 reduction takes nothing from the bonus); P1 draws 1", async () => {
    const game = await smokeResolved();
    await game.p1.cast("disc", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("sentry").might).toBe(3);
    expect(game.state("sentry").baseMight).toBe(1);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("both effects are 'this turn': next turn the Sentry is back to its printed 1", async () => {
    const game = await smokeResolved();
    await game.p1.cast("disc", { targets: "sentry" });
    await game.settle();
    expect(game.state("sentry").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("sentry").might).toBe(1);
  });

  test("contrast (why the snapshot matters): Discipline resolves FIRST (Sentry 3), THEN Smoke Screen resolves → 3 − 4 floors at 1", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "sentry" });
    await game.settle();
    expect(game.state("sentry").might).toBe(3);
    await game.p1.cast("smoke", { targets: "sentry" });
    await game.settle();
    expect(game.state("sentry").might).toBe(1);
  });
});
