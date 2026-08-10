/**
 * Ruling 1e9b75210df34b7f — Void Gate (OGN-296 → ogn-296-298) · Battlefield
 *     "Spells and abilities deal 1 Bonus Damage to units here."
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · Mind · [7][mind] · 7 Might
 *     "When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: Does Watcher's Might reduction on a unit at Void Gate get Void Gate's +1 bonus damage (finishing off a unit
 *    left at 1)?
 * A: No. Void Gate only boosts spells/abilities that explicitly DEAL DAMAGE. Reducing Might is not damage — it lowers
 *    the threshold, but marks nothing — so Void Gate adds nothing to it.
 * Rules: 432 (damage is marked on units), Bonus Damage applies per instance of damage dealt; might modification ≠ damage.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOID_GATE = "ogn-296-298";
const WATCHER = "ogn-116-298";
/** Inline P2 spell: "Deal 1 to a unit." — positive control that Void Gate is live. */
const PING = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "mind", energyCost: 1, name: "Test Ping", timing: "action" };

/**
 * P2's turn. "gate" = Void Gate (live text) held by P1 with a 4-Might Sentinel (undamaged) and a 2-Might Scout on it.
 * P2 holds Watcher with exactly [7][mind], plus Ping + [1].
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("gate", { controller: P1, def: VOID_GATE, inert: false })
    .unit(P1, "gate", { might: 4, name: "Sentinel" }, "sentinel")
    .unit(P1, "gate", { might: 2, name: "Scout" }, "scout")
    .hand(P2, WATCHER, "watcher")
    .hand(P2, PING, "ping")
    .resources(P2, { energy: 8, power: { mind: 1 } });
}

describe("Ruling 1e9b75210df34b7f — Void Gate's bonus damage does not apply to Watcher's Might reduction", () => {
  test("Watcher's -3 on units AT Void Gate marks no damage at all: Sentinel 4 → 1 Might with 0 damage (alive), Scout 2 → 1 (minimum) with 0 damage (alive)", async () => {
    const game = await board().build();
    await game.p2.play("watcher");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("watcher")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.state("sentinel")).toMatchObject({ damage: 0, might: 1 });
    expect(game.zoneOf("sentinel")).toBe("battlefield-gate"); // a phantom "+1 bonus damage" would have killed it (1 ≥ 1)
    expect(game.state("scout")).toMatchObject({ damage: 0, might: 1 });
    expect(game.zoneOf("scout")).toBe("battlefield-gate");
    expect(game.p1.units("gate").sort()).toEqual(["scout", "sentinel"]);
    expect(game.violations()).toEqual([]);
  });

  test("positive control: a spell that DEALS damage to a unit at Void Gate does get +1 — Ping's 1 becomes 2 and kills the 2-Might Scout", async () => {
    const game = await board().build();
    await game.p2.cast("ping", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("ping")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
  });

  test("and the two together: after Watcher (Sentinel at 1 Might, 0 damage) it takes an actual damage spell to finish it — Ping (1+1) then kills the Sentinel", async () => {
    const game = await board().build();
    await game.p2.play("watcher");
    await game.settle();
    expect(game.state("sentinel")).toMatchObject({ damage: 0, might: 1 });
    await game.p2.cast("ping", { targets: "sentinel" });
    await game.settle();
    expect(game.zoneOf("sentinel")).toBe("trash");
  });
});
