/**
 * Ruling bdcd151acdc1c5e2 — Void Seeker (OGN-024 → ogn-024-298) Action [3][fury] "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) 7 Might "When you play me, give enemy units -3 [Might] this turn, to a minimum
 *   of 1 [Might]." (also cited: Hextech Ray ogn-009-298 "Deal 3 …" + Smoke Screen ogn-093-298 "-4 [Might] … minimum 1" as the same principle)
 *
 * Q: Opponent Void Seekers my Watcher (4 damage), then plays their own Watcher (-3 Might to my units). Does my Watcher die?
 * A: Yes. Damage is tracked separately from Might: it carries 4 damage, then becomes 7 − 3 = 4 Might; damage ≥ Might → it dies.
 *    Same with Hextech Ray (3) then Smoke Screen (7 − 4 = 3).
 * Rules: 143.2.a (nonzero damage ≥ Might kills, checked continuously), damage markers don't reduce Might.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const WATCHER = "ogn-116-298";
const HEXTECH_RAY = "ogn-009-298";
const SMOKE_SCREEN = "ogn-093-298";

/** P2's turn (the opponent). P1's Watcher (7) holds bf1. P2: Void Seeker + its own Watcher in hand, [10] + [fury] + [mind]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 10, power: { fury: 1, mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", WATCHER, "mine")
    .hand(P2, VOID_SEEKER, "vs")
    .hand(P2, WATCHER, "theirs");
}

describe("Ruling bdcd151acdc1c5e2 — 4 damage marked, then -3 Might: 4 ≥ 4 and the Watcher dies", () => {
  test("Void Seeker: my Watcher takes 4 damage and LIVES (4 < 7); its Might is unchanged by the damage marker; P2 draws 1", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("vs", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("mine")).toMatchObject({ damage: 4, might: 7, zone: "battlefield-bf1" });
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1);
  });

  test("then P2 plays its own Watcher: the play trigger gives mine -3 (7 → 4) and, still carrying 4 damage, it DIES (damage 4 ≥ Might 4)", async () => {
    const game = await board().build();
    await game.p2.cast("vs", { targets: "mine" });
    await game.settle();
    await game.p2.play("theirs", { to: "base" });
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "theirs", controller: P2, triggered: true })]);
    expect(game.zoneOf("mine")).toBe("battlefield-bf1"); // not yet — the trigger has to resolve
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.p1.units()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: WITHOUT the prior damage the -3 alone kills nothing — my undamaged Watcher just sits at 4 Might", async () => {
    const game = await board().build();
    await game.p2.play("theirs", { to: "base" });
    await game.settle();
    expect(game.state("mine")).toMatchObject({ damage: 0, might: 4, zone: "battlefield-bf1" });
  });

  test("same principle: Hextech Ray (3 damage) then Smoke Screen (7 − 4 = 3 Might) also kills the Watcher", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 1, mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", WATCHER, "mine")
      .hand(P2, HEXTECH_RAY, "ray")
      .hand(P2, SMOKE_SCREEN, "smoke")
      .build();
    await game.p2.cast("ray", { targets: "mine" });
    await game.settle();
    expect(game.state("mine")).toMatchObject({ damage: 3, might: 7, zone: "battlefield-bf1" });
    await game.p2.cast("smoke", { targets: "mine" });
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
  });
});
