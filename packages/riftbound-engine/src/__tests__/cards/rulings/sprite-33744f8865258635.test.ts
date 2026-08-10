/**
 * Ruling 33744f8865258635 — Sprite (OGN-274 → ogn-274-298) · 3-Might unit token · [Temporary]
 *   × Sprite Mother (OGN-106 → ogn-106-298) "When you play me, play a ready 3 [Might] Sprite unit token with
 *     [Temporary] here."
 *   × Viktor, Leader (OGN-246 → ogn-246-298) "When another non-Recruit unit you control dies, play a 1 [Might]
 *     Recruit unit token into your base."
 *
 * Q: If a Sprite from Sprite Mother dies, does Viktor's ability trigger (create a Recruit)?
 * A: Yes — the Sprite is killed (it dies) and is not a Recruit, so Viktor plays a Recruit token into base.
 *    Nuance: the Recruit so created is not readied.
 * Rules: 826 (Temporary: kill at start of Beginning Phase), 421 (Kill → dies), 186.1 (token then ceases to
 *        exist), 419.1.c (played permanents enter exhausted unless stated).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE_MOTHER = "ogn-106-298";
const VIKTOR_LEADER = "ogn-246-298";

/** P1's turn 2 with exactly Sprite Mother's cost; Viktor, Leader already in P1's base. P1 plays the Mother. */
async function motherPlayed(): Promise<{ game: Game; sprite: string }> {
  const game = await scenario()
    .resources(P1, { energy: 4, power: { mind: 1 } })
    .unit(P1, "base", VIKTOR_LEADER, "viktor")
    .hand(P1, SPRITE_MOTHER, "mother")
    .build();
  await game.p1.play("mother");
  await game.settle();
  expect(game.zoneOf("mother")).toBe("base");
  const sprite = game.find({ name: "Sprite", owner: P1 });
  expect(game.state(sprite)).toMatchObject({ isReady: true, isToken: true, might: 3, zone: "base" });
  expect(game.state(sprite).keywords).toContain("Temporary");
  expect(game.findAll({ name: "Recruit" })).toEqual([]); // playing things kills nothing
  return { game, sprite };
}

describe("Ruling 33744f8865258635 — a dying Sprite token triggers Viktor, Leader's Recruit", () => {
  test("Temporary kills the Sprite at the start of P1's next Beginning Phase; it dies (then ceases to exist) and Viktor plays an un-readied Recruit into base", async () => {
    const { game, sprite } = await motherPlayed();
    await game.advanceTurn(); // → P2
    expect(game.has(sprite)).toBe(true);
    await game.advanceTurn(); // → P1: Beginning Phase kills the Sprite, Viktor triggers, all settles into P1's main
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf(sprite)).toBe("gone"); // killed → trash → a token ceases to exist (186.1)
    const recruits = game.findAll({ name: "Recruit" });
    expect(recruits).toHaveLength(1);
    const recruit = recruits[0] as string;
    expect(game.state(recruit)).toMatchObject({ controller: P1, isToken: true, might: 1, zone: "base" });
    expect(game.state(recruit).isReady).toBe(false); // "does not get readied"
    expect(game.violations()).toEqual([]);
  });

  test("same when an enemy spell kills the Sprite mid-turn: Viktor's trigger goes on the chain and resolves into a Recruit in P1's base", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", VIKTOR_LEADER, "viktor")
      .unit(P1, "base", "ogn-274-298", "sprite")
      .hand(P2, { abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Bolt", timing: "action" }, "bolt")
      .build();
    expect(game.state("sprite")).toMatchObject({ isToken: true, might: 3 });
    await game.p2.cast("bolt", { targets: "sprite" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Bolt resolves: 3 damage kills the 3-Might Sprite
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "viktor", controller: P1, triggered: true })]);
    await game.settle();
    const recruits = game.findAll({ name: "Recruit" });
    expect(recruits).toHaveLength(1);
    expect(game.state(recruits[0] as string)).toMatchObject({ controller: P1, isReady: false, might: 1, zone: "base" });
  });
});
