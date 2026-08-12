/**
 * Ruling 1e4d053795627a2f — Wielder of Water (OGN-055 → ogn-055-298) · Unit · Calm · [3][calm] · 2 Might
 *     "While I'm attacking or defending alone, I have +2 [Might]."
 *
 * Q: Does Wielder of Water constantly have +2 while it is alone on a battlefield?
 * A: No. The bonus needs the ATTACKING or DEFENDING designation, which only exists inside a combat
 *    showdown. Sitting alone at a battlefield outside combat it is a plain 2 Might; it becomes 4 while it
 *    attacks or defends alone, and drops back to 2 the moment combat ends.
 * Rules: 464.2 (attacker/defender designations are assigned when combat begins), 466.7.a (designations are
 *        removed when combat ends), 740 ("alone" = no other friendly unit there), 365 (continuous statics).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WIELDER = "ogn-055-298";

describe("Ruling 1e4d053795627a2f — Wielder of Water's +2 needs the attacking/defending designation, not mere solitude", () => {
  test("alone at its own battlefield outside combat: still 2 Might, no designation", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", WIELDER, "wielder")
      .unit(P2, "bf2", { might: 3, name: "Raider" }, "raider")
      .build();
    expect(game.p1.units("bf1")).toEqual(["wielder"]);
    expect(game.state("wielder").combatRole).toBeNull();
    expect(game.state("wielder").might).toBe(2);
  });

  test("alone in base is likewise just 2 Might", async () => {
    const game = await scenario().unit(P1, "base", WIELDER, "wielder").build();
    expect(game.p1.units("base")).toEqual(["wielder"]);
    expect(game.state("wielder").might).toBe(2);
  });

  test("DEFENDING alone it is 4 — and back to 2 once combat has ended", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", WIELDER, "wielder")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    expect(game.state("wielder").might).toBe(2);
    await game.p2.move("raider", "bf1");
    expect(game.state("wielder").combatRole).toBe("defender");
    expect(game.state("wielder").might).toBe(4);
    await game.settle(); // 4 vs 3 — the Raider dies, the Wielder survives
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("wielder")).toBe("battlefield-bf1");
    expect(game.state("wielder").combatRole).toBeNull();
    expect(game.state("wielder").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("ATTACKING alone it is 4 too; with a friend attacking beside it, it is not alone and stays 2", async () => {
    const solo = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", WIELDER, "wielder")
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .build();
    await solo.p1.move("wielder", "bf1");
    expect(solo.state("wielder").combatRole).toBe("attacker");
    expect(solo.state("wielder").might).toBe(4);

    const pair = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", WIELDER, "wielder")
      .unit(P1, "base", { might: 1, name: "Friend" }, "friend")
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .build();
    await pair.p1.move(["wielder", "friend"], "bf1");
    expect(pair.state("wielder").combatRole).toBe("attacker");
    expect(pair.state("wielder").might).toBe(2);
  });
});
