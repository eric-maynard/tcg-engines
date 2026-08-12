/**
 * Ruling 4b1bfd4354d4a0ba — (no specific card) when do attacker/defender bonuses apply?
 *   Exercised with Garen, Rugged (OGS-007 → ogs-007-024) · Unit · 5 Might · "[Assault 2], [Shield 2]".
 *
 * Q: Do units get their attack/defence bonuses outside a combat showdown (e.g. sitting alone in base)?
 * A: No. The attacker/defender designations exist only during a combat showdown; outside one the terms are
 *    meaningless and nothing keyed on them is in effect.
 * Rules: 464.2 (designations are handed out when a Combat Showdown opens), 466.7.a (they are removed when
 *        combat ends), 807.1.c [Assault] "+X while I'm an attacker", 807.1.a [Shield] "+X while I'm a defender".
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GAREN = "ogs-007-024"; // 5 Might, [Assault 2] + [Shield 2]

describe("Ruling 4b1bfd4354d4a0ba — attacker/defender only exist inside a combat showdown", () => {
  test("alone in base: no role, no [Assault]/[Shield] bonus — Garen is just a 5-Might unit", async () => {
    const game = await scenario().unit(P1, "base", GAREN, "garen").build();
    expect(game.state("garen")).toMatchObject({ baseMight: 5, combatRole: null, might: 5 });
    expect([...game.state("garen").keywords].sort()).toEqual(["Assault", "Shield"]);
  });

  test("alone at a battlefield he controls (no opponent, no showdown): still no role and still 5 Might", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", GAREN, "garen")
      .unit(P1, "base", { might: 1, name: "Filler" }, "filler")
      .build();
    await game.p1.move("filler", "bf1"); // an arrival forces a Cleanup; still nobody to fight
    expect(game.state("garen")).toMatchObject({ combatRole: null, might: 5 });
    expect(game.gameState.battlefields.bf1?.contested).toBeFalsy();
  });

  test("as an ATTACKER the [Assault] half switches on (5 → 7) and the [Shield] half stays off; both lapse the moment combat ends", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Guard" }, "guard")
      .unit(P1, "base", GAREN, "garen")
      .build();
    expect(game.state("garen").might).toBe(5);
    await game.p1.move("garen", "bf1");
    expect(game.state("garen")).toMatchObject({ combatRole: "attacker", might: 7 }); // Assault 2 only
    await game.settle();
    // 7 vs 6: the Guard dies, Garen survives its 6 (his combat Might was 7) and conquers.
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("garen")).toBe("bf1");
    expect(game.state("garen")).toMatchObject({ combatRole: null, damage: 0, might: 5 }); // role and bonus gone
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("as a DEFENDER the [Shield] half switches on (5 → 7) and [Assault] does not — the same unit, the other role", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", GAREN, "garen")
      .unit(P2, "base", { might: 6, name: "Raider" }, "raider")
      .build();
    expect(game.state("garen").might).toBe(5);
    await game.p2.move("raider", "bf1");
    expect(game.state("garen")).toMatchObject({ combatRole: "defender", might: 7 }); // Shield 2 only
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 7 ≥ 6
    expect(game.state("garen")).toMatchObject({ combatRole: null, damage: 0, might: 5 });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
