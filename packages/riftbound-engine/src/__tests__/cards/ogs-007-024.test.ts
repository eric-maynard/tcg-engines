/**
 * Garen, Rugged — ogs-007-024 · Champion Unit (Garen) · Body · 6 energy + [body] · 5 Might
 *
 *   [Assault 2], [Shield 2] (+2 [Might] while I'm an attacker or defender.)
 *
 * Rules: 807 (Assault X: +X Might only while attacking), 814 (Shield X: +X Might only while
 * defending), 142.4 (lethal = damage ≥ current Might), 466.1.a.1 (survivors heal in the combat
 * cleanup). So Garen fights at 7 in every combat, but never at 9, and rests at 5.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-007-024";

function attacking(defenderMight: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "garen")
    .unit(P2, "bf1", { might: defenderMight, name: "Wall" }, "wall");
}

function defending(attackerMight: number) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CARD, "garen")
    .unit(P2, "base", { might: attackerMight, name: "Raider" }, "raider");
}

describe("Garen, Rugged (ogs-007-024)", () => {
  test("costs 6 energy + 1 body; a 5-Might unit with Assault and Shield that enters exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { body: 1 } }).hand(P1, CARD, "garen").build();
    await game.p1.play("garen");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("garen")).toBe("base");
    expect(game.state("garen").might).toBe(5);
    expect(game.state("garen").keywords).toEqual(expect.arrayContaining(["Assault", "Shield"]));
    expect(game.state("garen").isExhausted).toBe(true);
    const noPower = await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "garen").build();
    expect(noPower.p1.can("play", "garen")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 5, power: { body: 1 } }).hand(P1, CARD, "garen").build();
    expect(lowEnergy.p1.can("play", "garen")).toBe(false);
  });

  test("[Assault 2]: attacking at 5+2 = 7 he kills a 6-Might defender", async () => {
    const game = await attacking(6).build();
    expect(game.state("garen").might).toBe(5); // no bonus at rest
    await game.p1.move("garen", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
  });

  test.failing("BUG: Assault 2 also raises his lethal threshold while attacking — he survives the 6 damage (6 < 7) and conquers", async () => {
    // Expected (807 + 142.4): as an attacker Garen has 7 Might, so 6 damage is not lethal; he stays,
    // heals in the combat cleanup and conquers bf1 for 1 point. Actual: the engine adds Assault to the
    // damage he deals but checks lethality against his printed 5, so he dies alongside the defender.
    const game = await attacking(6).build();
    await game.p1.move("garen", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("garen")).toBe("bf1");
    expect(game.state("garen").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("Shield does not stack on offense: into a 7-Might defender both die (he is 7, not 9)", async () => {
    const game = await attacking(7).build();
    await game.p1.move("garen", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("garen")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("[Shield 2]: defending at 5+2 = 7 he kills a 6-Might attacker with his 7 damage and survives its 6; Garen holds", async () => {
    const game = await defending(6).build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // took 7 ≥ 6
    expect(game.locationOf("garen")).toBe("bf1"); // took 6 < 7
    expect(game.state("garen").damage).toBe(0); // healed in the combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("Assault does not stack on defense: a 7-Might attacker trades with him (he is 7, not 9); nobody holds the field", async () => {
    const game = await defending(7).build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("garen")).toBe("trash"); // 7 ≥ 5+2
    expect(game.zoneOf("raider")).toBe("trash"); // took his 7
    expect(game.p2.points()).toBe(0);
  });
});
