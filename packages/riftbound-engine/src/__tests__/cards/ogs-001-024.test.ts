/**
 * Annie, Fiery — ogs-001-024 · Champion Unit · Fury · 5 energy + [fury] · 4 Might · Annie
 *
 *   Your spells and abilities deal 1 Bonus Damage.
 *   (Each instance of damage the spell deals is increased by 1.)
 *
 * Rules 712–715 (Bonus Damage): each Deal instance from a spell/ability of Annie's controller is
 * increased by 1 (715.2 uses Annie as its example). Combat damage is not a spell/ability and is
 * not increased; the opponent's spells are not "your" spells.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-001-024";
const HEXTECH_RAY = "ogn-009-298"; // [Action] 1 energy + [fury]: Deal 3 to a unit at a battlefield.
const IRON_BALLISTA = "ogn-017-298"; // Gear — [Exhaust]: Deal 2 to a unit at a battlefield.

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 12 }, "foe")
    .unit(P1, "bf1", { might: 12 }, "ally")
    .unit(P1, "base", CARD, "annie")
    .gear(P1, IRON_BALLISTA, "ballista")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, HEXTECH_RAY, "theirRay");
}

describe("Annie, Fiery (ogs-001-024)", () => {
  test("costs 5 energy + 1 fury; enters the base as a 4-Might unit; unaffordable without the fury", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, CARD, "annie").build();
    await game.p1.play("annie");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("annie")).toBe("base");
    expect(game.state("annie").might).toBe(4);
    const noFury = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "annie").build();
    expect(noFury.p1.can("play", "annie")).toBe(false);
  });

  test.failing("BUG: your SPELLS deal 1 Bonus Damage — Hextech Ray deals 4 instead of 3 (rule 715.1)", async () => {
    // Expected: with Annie on the board, P1's Hextech Ray "Deal 3" becomes 4. Actual: foe takes 3 —
    // the controller-scoped BonusDamage keyword is not consulted by the damage pipeline.
    const game = await board().build();
    await game.p1.cast("ray", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").damage).toBe(4);
  });

  test.failing("BUG: your ABILITIES deal 1 Bonus Damage — Iron Ballista's 'Deal 2' deals 3", async () => {
    // Expected: the gear's activated damage ability is boosted to 3. Actual: foe takes 2.
    const game = await board().build();
    await game.p1.activate("ballista", 1, { targets: "foe" }); // #0 is the "enters exhausted" static
    await game.settle();
    expect(game.state("ballista").isExhausted).toBe(true);
    expect(game.state("foe").damage).toBe(3);
  });

  test("only YOUR spells: the opponent's Hextech Ray still deals exactly 3", async () => {
    const game = await board().active(P2).build();
    await game.p2.cast("theirRay", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").damage).toBe(3);
  });

  test("combat damage is not a spell/ability: Annie (4) attacking a 5-Might defender does not kill it", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "wall")
      .unit(P1, "base", CARD, "annie")
      .build();
    await game.p1.move("annie", "bf1");
    await game.settle();
    expect(game.zoneOf("annie")).toBe("trash"); // takes 5
    expect(game.zoneOf("wall")).toBe("battlefield-bf1"); // took exactly 4 — a bonus point would have killed it
  });
});
