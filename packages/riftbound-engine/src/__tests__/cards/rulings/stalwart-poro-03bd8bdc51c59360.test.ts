/**
 * Ruling 03bd8bdc51c59360 — Stalwart Poro (OGN-052 → ogn-052-298) 2 Might · [Shield] (+1 Might while defending)
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) "When you play me, give enemy units -3 [Might] this
 *     turn, to a minimum of 1 [Might]."
 *   × Wuju Bladesman, Starter (OGS-019 → ogs-019-024) Legend "While a friendly unit defends alone, it gets +2 [Might]."
 *
 * Q: Poro (2) alone at a battlefield; opponent plays Watcher (-3, min 1); then a unit moves in and a
 *    showdown starts. With Wuju Bladesman active, what is the Poro's Might in combat?
 * A: 4. The "-3 to a minimum of 1" snapshots when applied: 2 → 1, i.e. a fixed -1. Later buffs just add:
 *    2 (base) - 1 (snapshot) + 1 (Shield) + 2 (Wuju) = 4.
 * Rules: might-floor snapshotting of limited modifiers; 814 (Shield); static legend ability.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STALWART_PORO = "ogn-052-298";
const THOUSAND_TAILED_WATCHER = "ogn-116-298";
const WUJU_BLADESMAN = "ogs-019-024";

/** P2's turn. P1 (Wuju legend) holds bf1 with a lone Stalwart Poro. P2 has Watcher in hand (7 + [mind]) and a 3-Might Raider in base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 7, power: { mind: 1 } })
    .legend(P1, WUJU_BLADESMAN, "yi")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", STALWART_PORO, "poro")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, THOUSAND_TAILED_WATCHER, "watcher");
}

describe("Ruling 03bd8bdc51c59360 — Watcher's floored -3 snapshots at -1; Shield and Wuju then add on top → Poro fights at 4", () => {
  test("step 1: Watcher resolves while Poro is 2 → Poro drops to exactly 1 (the floor), not below", async () => {
    const game = await board().build();
    expect(game.state("poro").might).toBe(2);
    await game.p2.play("watcher", { to: "base" });
    await game.settle();
    expect(game.zoneOf("watcher")).toBe("base");
    expect(game.state("poro").might).toBe(1);
    expect(game.state("poro").baseMight).toBe(2);
  });

  test("step 2: Raider moves in → Poro defends alone: 2 - 1 + 1 (Shield) + 2 (Wuju) = 4 during the showdown", async () => {
    const game = await board().build();
    await game.p2.play("watcher", { to: "base" });
    await game.settle();
    expect(game.state("poro").might).toBe(1);

    await game.p2.move("raider", "bf1");
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.p1.units("bf1")).toEqual(["poro"]); // defending alone
    expect(game.state("poro").might).toBe(4);
  });

  test("outcome check with a 4-Might attacker: the Poro at 4 trades with it (combat damage confirms the value 4)", async () => {
    // Ruling value 4 → mutual kill; a non-snapshotted recalculation (2 - 3 + 1 + 2 = 2) would leave the
    // Poro dead and the Big Raider alive.
    const game = await board().unit(P2, "base", { might: 4, name: "Big Raider" }, "big").build();
    await game.p2.play("watcher", { to: "base" });
    await game.settle();
    await game.p2.move("big", "bf1");
    expect(game.state("poro").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash"); // took 4 ≥ 4 from the Poro
    expect(game.zoneOf("poro")).toBe("trash"); // took 4 ≥ 4
  });

  test("control without Watcher: lone defending Poro is 2 + 1 + 2 = 5", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.state("poro").might).toBe(5);
  });
});
