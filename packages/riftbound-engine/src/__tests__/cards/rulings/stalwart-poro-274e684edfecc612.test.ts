/**
 * Ruling 274e684edfecc612 — Stalwart Poro (OGN-052 → ogn-052-298) · 2 Might · [Shield]
 *   × Lee Sin, Centered (OGN-151 → ogn-151-298) · "Other buffed friendly units at my battlefield have +2 [Might]."
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · "When you play me, give enemy units -3 [Might] this
 *     turn, to a minimum of 1 [Might]."
 *
 * Q: With Lee Sin's aura giving +2 and then a -3 "to a minimum of 1" landing, does the aura re-apply after
 *    the reduction, or is the result a snapshot?
 * A: Plain arithmetic in one order: increases first, then the decrease, which snapshots against the value it
 *    sees. A buffed Poro is 2 + 1 buff = 3, +2 from Lee Sin = 5, then -3 from the Watcher = 2. The aura is
 *    not re-applied on top of the reduced value.
 * Rules: 611 (continuous Might modification), 359 (values fixed on resolution). Not a dependency (613).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STALWART_PORO = "ogn-052-298";
const LEE_SIN_CENTERED = "ogn-151-298";
const THOUSAND_TAILED_WATCHER = "ogn-116-298";

/** P2's turn. P1 has Lee Sin + a BUFFED Stalwart Poro together at bf1; P2 holds the Watcher. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", LEE_SIN_CENTERED, "leesin")
    .unit(P1, "bf1", STALWART_PORO, "poro", { buffed: true })
    .resources(P2, { energy: 7, power: { mind: 1 } })
    .hand(P2, THOUSAND_TAILED_WATCHER, "watcher");
}

describe("Ruling 274e684edfecc612 — increases first, then the clamped decrease; the aura does not re-apply", () => {
  test("premise: buffed Poro is 3 (2 printed + 1 buff) and Lee Sin's aura lifts it to 5", async () => {
    const game = await board().build();
    expect(game.state("poro").isBuffed).toBe(true);
    expect(game.state("poro").might).toBe(5);
  });

  test("ruling: the Watcher's -3 lands on 5 and the Poro ends on 2 — not 1, and not 3", async () => {
    const game = await board().build();
    await game.p2.play("watcher");
    await game.settle();
    expect(game.state("poro").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("the un-buffed Lee Sin (6 Might, no aura on himself) simply goes 6 → 3", async () => {
    const game = await board().build();
    expect(game.state("leesin").might).toBe(6);
    await game.p2.play("watcher");
    await game.settle();
    expect(game.state("leesin").might).toBe(3);
  });

  test("both reductions are 'this turn' — everything is back to 5 / 6 next turn", async () => {
    const game = await board().build();
    await game.p2.play("watcher");
    await game.settle();
    await game.advanceTurn();
    expect(game.state("poro").might).toBe(5);
    expect(game.state("leesin").might).toBe(6);
  });
});
