/**
 * Taric, Protector — ogn-074-298 · Unit (Champion, Taric) · Calm · 4 energy + 1 calm · 4 Might
 *
 *   [Shield] (+1 [Might] while I'm a defender.)
 *   [Tank] (I must be assigned combat damage first.)
 *   Other friendly units here have [Shield].
 *
 * Rules: 814 (Shield = +X Might while defender), 815 (Tank: lethal damage must be
 * assigned to me before non-Tank units), 142.4 (lethal damage ≥ Might), 465.2.c
 * (damage assignment), 477.2.b ("have [keyword]" statics).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-074-298";

describe("Taric, Protector (ogn-074-298)", () => {
  test("Shield: defending alone against a 4-Might attacker he survives (5 Might) and kills it", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "taric")
      .unit(P2, "base", { might: 4 }, "foe")
      .build();
    expect(game.state("taric").keywords).toEqual(expect.arrayContaining(["Shield", "Tank"]));
    await game.p2.move("foe", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("taric")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Shield does not apply while attacking: 4 Might into a 4-Might defender trades", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "taric")
      .unit(P2, "bf1", { might: 4 }, "foe")
      .build();
    await game.p1.move("taric", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("taric")).toBe("trash");
  });

  test("Tank: a 3-Might attacker must put all its damage into Taric first, so the 1-Might ally beside him survives", async () => {
    // The ally is placed first so that, absent Tank, the engine's in-order assignment would kill it.
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1 }, "ally")
      .unit(P1, "bf1", CARD, "taric")
      .unit(P2, "base", { might: 3 }, "foe")
      .build();
    await game.p2.move("foe", "bf1");
    await game.settle();
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.locationOf("taric")).toBe("bf1");
    expect(game.zoneOf("foe")).toBe("trash");
    // Control: without Tank the same attack kills the first-listed 1-Might unit.
    const ctl = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1 }, "ally")
      .unit(P1, "bf1", { might: 5 }, "big")
      .unit(P2, "base", { might: 3 }, "foe")
      .build();
    await ctl.p2.move("foe", "bf1");
    await ctl.settle();
    expect(ctl.zoneOf("ally")).toBe("trash");
  });

  test("static: played to a battlefield, other friendly units THERE have Shield; units in base and Taric himself get nothing extra", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "here")
      .unit(P1, "base", { might: 1 }, "home")
      .unit(P2, "bf1", { might: 1 }, "foeHere")
      .hand(P1, CARD, "taric")
      .build();
    await game.p1.play("taric", { to: "bf1" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.state("here").keywords).toContain("Shield");
    expect(game.state("home").keywords).not.toContain("Shield");
    expect(game.state("foeHere").keywords).not.toContain("Shield");
    expect(game.state("taric").grantedKeywords.filter((k) => k.keyword === "Shield")).toEqual([]);
  });

  test.failing("BUG: a friendly unit that moved to a battlefield with Taric defends with +1 Might from the granted Shield", async () => {
    // Foe 8 attacks Taric (Tank, 5 to kill) + a 3-Might ally: 3 damage is left for the ally, which needs 4 with
    // Shield → expected: ally survives and P1 keeps bf1. Actual: the "here" grant is never (re)applied after a
    // move / across turns, so the ally dies at 3 and the battlefield is emptied.
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 3 }, "ally")
      .unit(P1, "base", CARD, "taric")
      .unit(P2, "base", { might: 8 }, "foe")
      .build();
    await game.p1.move(["ally", "taric"], "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.advanceTurn();
    expect(game.state("ally").keywords).toContain("Shield");
    await game.p2.move("foe", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // 5 + 4 = 9 ≥ 8
    expect(game.zoneOf("taric")).toBe("trash"); // Tank soaked 5
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("cost: not playable without the calm power or with only 3 energy", async () => {
    const noCalm = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "taric").build();
    expect(noCalm.p1.can("play", "taric")).toBe(false);
    const low = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).hand(P1, CARD, "taric").build();
    expect(low.p1.can("play", "taric")).toBe(false);
  });
});
