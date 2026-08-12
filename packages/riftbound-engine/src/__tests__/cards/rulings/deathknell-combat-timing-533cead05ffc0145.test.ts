/**
 * Ruling 533cead05ffc0145 — Kog'Maw, Caustic (ogn-190-298) · Unit · Chaos · [3][chaos] · 1 Might
 *   "[Deathknell] — Deal 4 to all units at my battlefield."
 *
 * Q: When do Deathknell abilities resolve during combat?
 * A: At the very end of the combat special cleanup — after the dead are trashed, after all units are
 *    HEALED, and after attackers have been recalled if defenders are still present. Consequences the
 *    answer names: because healing comes first you cannot use a Deathknell to finish off a unit that
 *    survived combat damage; and the Deathknell resolves before anyone establishes control / conquers.
 * Rules: 466.1.a.1 (Combat Cleanup: 3a queue Deathknells → 3b trash → 3c heal all units → 3d recall
 *        attackers), 466.2 (that chain resolves before the result step), 466.3 (Determine Combat Result),
 *        466.5.d (Establish Control / Conquer), 808.1.d.2 (the Deathknell is queued as the unit dies).
 * See also: interactions/kogmaw-dk-spares-3d-recalled-attackers.test.ts, which settles the 3d half.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW = "ogn-190-298";

/** P1 attacks bf1 (P2's 5-Might Wall) with Kog'Maw (1) + a 6-Might Brute. */
async function boardA(): Promise<Game> {
  const game = await scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .unit(P1, "base", KOGMAW, "kog")
    .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
    .build();
  await game.p1.move(["kog", "brute"], "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

describe("Ruling 533cead05ffc0145 — a Deathknell resolves after the combat heal and before the Conquer", () => {
  test("the heal comes first: the Brute's combat damage is wiped, so the Deathknell's 4 lands on a full-health 6-Might unit and does NOT finish it off", async () => {
    const game = await boardA();
    // the defender assigns its 5: lethal 1 to Kog'Maw, the rest to the Brute
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 5 });
    await game.p2.distribute({ brute: 4, kog: 1 });
    await game.settle();
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    // 4 combat damage were healed at 3c; the Deathknell then dealt a fresh 4 — 4 < 6, it lives
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.state("brute").damage).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("…and it resolved BEFORE control was settled: the surviving attacker then conquers bf1 with the Deathknell damage already on it", async () => {
    const game = await boardA();
    await game.p2.distribute({ brute: 4, kog: 1 });
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.state("brute").damage).toBe(4);
  });

  test("when the Deathknell IS lethal it kills before the result is read — nobody is left standing, so there is no Conquer and no point", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Wall" }, "wall")
      .unit(P1, "base", KOGMAW, "kog")
      .unit(P1, "base", { might: 4, name: "Brute" }, "brute")
      .build();
    await game.p1.move(["kog", "brute"], "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.p2.distribute({ brute: 2, kog: 1 }); // the Brute survives combat at 2 damage
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash"); // healed to 0, then the Deathknell's 4 ≥ 4
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("the Deathknell is queued as the unit dies, inside the Combat Cleanup — the combat log shows queue → trash → heal before the chain resolves", async () => {
    const game = await boardA();
    await game.p2.distribute({ brute: 4, kog: 1 });
    await game.settle();
    const log = game.gameState.battlefields.bf1?.combatCleanupLog ?? [];
    expect(log).toContain("466.1.3a:queue-deaths");
    expect(log).toContain("466.1.3b:trash-dead");
    expect(log).toContain("466.1.3c:heal-all");
    expect(log.indexOf("466.1.3c:heal-all")).toBeGreaterThan(log.indexOf("466.1.3a:queue-deaths"));
    expect(log.indexOf("466.5.d:conquer")).toBeGreaterThan(log.indexOf("466.1.3c:heal-all"));
  });
});
