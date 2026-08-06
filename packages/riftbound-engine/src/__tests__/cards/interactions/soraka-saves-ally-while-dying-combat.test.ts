/**
 * Interaction: Soraka, Wanderer (sfd-173-221) — 4 Might, Order champion unit
 *     "I must be assigned combat damage last.
 *      If another unit you control here would die, if it has less Might than me, instead heal
 *      it, exhaust it, and recall it. (Send it to base. This isn't a move.)"
 *   × Recruit token (ogn-271-298) — 1 Might
 *   × Vanguard Sergeant (ogn-219-298) — 4 Might vanilla
 *
 * Question: P2 defends bf1 with Soraka, a Recruit and Vanguard Sergeant. The attacker assigns
 * lethal damage to all three, so all defenders would die simultaneously in the combat cleanup.
 * Does Soraka save the Recruit even though she is dying at the same time? The Sergeant (equal
 * Might)? Herself? Who wins the combat?
 *
 * Rules:
 *   465.2.c.6  damage-assignment restrictions must be obeyed → Recruit and Sergeant are assigned
 *              lethal before Soraka (Backline-style text).
 *   370.1.a.2 / 373  deaths from the same combat-damage step are simultaneous events; each is
 *              considered separately for replacement effects.
 *   370.4      a replacement effect applies to qualifying events simultaneous with its source
 *              leaving the board — Soraka is the printed example → she DOES save the Recruit.
 *   373.1.a    the replacement's heal/exhaust/recall is performed before the unmodified deaths.
 *   Card text  "less Might than me" → Sergeant (4 ≮ 4) is not saved; "another unit" → Soraka
 *              never saves herself.
 *   456        a recall is not a move; 466.1.a.2 / 466.3.a: no defenders remain at bf1, so the
 *              attacker is not recalled, wins the combat and conquers.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SORAKA = "sfd-173-221";
const RECRUIT = "ogn-271-298";
const VANGUARD_SERGEANT = "ogn-219-298";

/**
 * P2 holds bf1 with Soraka (4), Recruit (1), Sergeant (4) = 9 defending Might.
 * P1 attacks from base with a single vanilla unit of the given Might.
 */
function board(attackerMight: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SORAKA, "soraka")
    .unit(P2, "bf1", RECRUIT, "recruit")
    .unit(P2, "bf1", VANGUARD_SERGEANT, "sergeant")
    .unit(P1, "base", { might: attackerMight, name: "Big Attacker" }, "attacker");
}

/** Attack bf1 and let the showdown close with no plays → combat damage → cleanup. */
async function attackAndResolve(attackerMight: number) {
  const game = await board(attackerMight).build();
  await game.p1.move("attacker", "bf1");
  await game.settle();
  expect(game.violations()).toEqual([]);
  return game;
}

describe("Soraka, Wanderer dying simultaneously with the allies she protects (combat)", () => {
  test("Backline: with only 8 incoming, Recruit (1) and Sergeant (4) are assigned lethal first — Soraka takes the leftover 3 and survives (465.2.c.6)", async () => {
    const game = await attackAndResolve(8);
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
    expect(game.state("soraka").damage).toBe(0); // healed in the combat cleanup (466.1.a.1)
    // A defender remains → P2 keeps the battlefield; the 8-Might attacker took 9 and died.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("attacker")).toBe("trash");
  });

  test.failing("BUG: Soraka (surviving) should replace the Recruit's combat death — heal, exhaust, recall to base (card text; 373.1.a)", async () => {
    // Expected: the Recruit (1 < 4 Might) never reaches the trash; it ends in P2's base exhausted
    // and undamaged. Actual: combat kills bypass the die-replacement entirely → Recruit in trash.
    const game = await attackAndResolve(8);
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.state("recruit").isExhausted).toBe(true);
    expect(game.state("recruit").damage).toBe(0);
  });

  test.failing("BUG: with lethal on all three, Soraka still saves the Recruit even though she dies in the same cleanup (370.4, 373, 373.1.a)", async () => {
    // Expected: Recruit healed/exhausted/recalled to base before the other deaths are processed;
    // Soraka leaving simultaneously does not stop her replacement (370.4 names her as the example).
    // Actual: Recruit goes to trash with the rest.
    const game = await attackAndResolve(10);
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.locationOf("recruit")).toBe("base");
    expect(game.state("recruit").isExhausted).toBe(true);
    expect(game.state("recruit").damage).toBe(0);
    expect(game.p2.trash()).not.toContain("recruit");
  });

  test("Vanguard Sergeant (4 Might, not LESS than Soraka's 4) is not saved — it dies", async () => {
    const game = await attackAndResolve(10);
    expect(game.zoneOf("sergeant")).toBe("trash");
  });

  test("Soraka's replacement only covers 'another unit' — Soraka herself dies", async () => {
    const game = await attackAndResolve(10);
    expect(game.zoneOf("soraka")).toBe("trash");
  });

  test("no P2 unit remains at bf1, so the surviving attacker is not recalled: P1 wins the combat and conquers (466.1.a.2, 466.3.a, 466.5)", async () => {
    const game = await attackAndResolve(10);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.locationOf("attacker")).toBe("bf1");
    expect(game.state("attacker").damage).toBe(0); // 9 taken, healed in cleanup, 10 Might survives
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(1);
  });

  test.failing("BUG: full expected end state — Recruit exhausted in P2's base, Sergeant + Soraka in trash, attacker holds bf1 (370.4, 456, 466.3.a)", async () => {
    // Composite oracle for the whole question; fails today only because the Recruit is not saved.
    const game = await attackAndResolve(10);
    expect(game.p2.base()).toContain("recruit");
    expect(game.state("recruit").isExhausted).toBe(true);
    expect([...game.p2.trash()].sort()).toEqual(["sergeant", "soraka"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.units("bf1")).toEqual(["attacker"]);
  });
});
