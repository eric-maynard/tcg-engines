/**
 * Ruling 6bbf6eed1f55d1b7 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2][calm] · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Hextech Ray (ogn-009-298, [Action] [1][fury]) "Deal 3 to a unit at a battlefield." — the "dies by other means first" case
 *
 * Q: Does a unit protected by Zhonya's still deal its combat damage before being recalled to base when it dies?
 * A: Yes. Combat damage is dealt simultaneously by both sides; only then are lethally-damaged units killed, and that is
 *    when Zhonya's replaces the death with heal/exhaust/recall. If instead the unit dies by other means BEFORE the
 *    combat-damage step (e.g. a spell in the showdown), it is recalled then and contributes no combat damage.
 * Rules: 465.2 (damage assigned and dealt simultaneously), 465.2.e / 320 (deaths checked after), 371–373 (replacement).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const HEXTECH_RAY = "ogn-009-298";

/** P2's turn. P1's Defender (3) alone holds bf1, Zhonya's face up in P1's base. P2: Raider (3) in base, Hextech Ray + [1][fury]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Defender" }, "def")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .gear(P1, ZHONYAS, "zh")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, HEXTECH_RAY, "ray");
}

describe("Ruling 6bbf6eed1f55d1b7 — a Zhonya's-saved unit still dealt its combat damage first", () => {
  test("3 into 3: damage is exchanged simultaneously — the Raider DIES to the Defender's 3 even though the Defender itself 'died' and was replaced by Zhonya's", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // it took the Defender's full 3
    expect(game.zoneOf("zh")).toBe("trash"); // killed instead of the Defender
    expect(game.state("def")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" }); // healed, exhausted, recalled
    expect(game.violations()).toEqual([]);
  });

  test("…so nobody is left at bf1: the Raider never conquers (P2 scores nothing) and the emptied battlefield becomes uncontrolled", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.p2.points()).toBe(0);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("nuance — killed by OTHER means before the damage step (Hextech Ray in the showdown): Zhonya's recalls the Defender at once, it deals no combat damage, and the untouched Raider conquers", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // attacker has Focus
    await game.p2.cast("ray", { targets: "def" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Ray resolves: 3 ≥ 3 → would die → Zhonya's instead
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("def")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    await game.settle();
    expect(game.state("raider")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
