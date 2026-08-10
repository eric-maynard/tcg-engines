/**
 * Ruling a6fa4090165467b5 — Defiant Dance (SFD-196 → sfd-196-221) · Reaction · [1][rainbow] · "Give a unit +2 [Might] this turn
 *     and another unit -2 [Might] this turn."
 *   × Imperial Decree (OGN-221 → ogn-221-298) · Action · [5][order][order] · "When any unit takes damage this turn, kill it."
 *
 * Q: I Defiant-Dance the opponent's Recruit down to 0 Might; they have Imperial Decree up. In combat, does the 0-Might
 *    Recruit still deal damage (and so get my unit killed by the Decree)?
 * A: The Recruit deals NO damage — combat damage equals current Might, and 0 Might assigns 0, which is not "taking
 *    damage", so the Decree does not touch my unit on that account. But if my unit takes even 1 damage from another
 *    enemy unit in that combat, the Decree triggers and kills it (lethal or not). Reducing a unit to 0 Might does not
 *    by itself kill it.
 * Rules: 443.1.b–d (combat damage = Might; 0 Might assigns 0), 404.1 (damage must be >0 to be dealt/taken), 383 /
 *        390.2 (Decree is a turn-long delayed trigger on "takes damage").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFIANT_DANCE = "sfd-196-221";
const IMPERIAL_DECREE = "ogn-221-298";

/**
 * P2 (opponent)'s turn with [5][order][order]. P1 (me) holds bf1 with Defender (3) and has Defiant Dance + [1][rainbow].
 * P2: Recruit (2) in base — and, in the second case, a Soldier (3) too.
 */
function board(withSoldier: boolean) {
  const b = scenario()
    .active(P2)
    .resources(P2, { energy: 5, power: { order: 2 } })
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Defender" }, "def")
    .unit(P2, "base", { might: 2, name: "Recruit" }, "recruit")
    .hand(P2, IMPERIAL_DECREE, "decree")
    .hand(P1, DEFIANT_DANCE, "dance");
  return withSoldier ? b.unit(P2, "base", { might: 3, name: "Soldier" }, "soldier") : b;
}

/** P2 resolves Imperial Decree, attacks bf1 with the given units, passes Focus; P1 Dances (+2 Defender / -2 Recruit) and it resolves. Stops before combat damage. */
async function decreeAttackDance(withSoldier: boolean): Promise<Game> {
  const game = await board(withSoldier).build();
  await game.p2.cast("decree");
  await game.settle();
  expect(game.zoneOf("decree")).toBe("trash");
  expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.p2.move(withSoldier ? ["recruit", "soldier"] : ["recruit"], "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.pass();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "dance")).toBe(true);
  await game.p1.cast("dance", { targets: ["def", "recruit"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Dance resolves
  expect(game.zoneOf("dance")).toBe("trash");
  expect(game.state("def").might).toBe(5);
  expect(game.state("recruit")).toMatchObject({ might: 0, zone: "battlefield-bf1" }); // 0 Might does not kill it
  return game;
}

describe("Ruling a6fa4090165467b5 — a 0-Might attacker deals no damage, so Imperial Decree has nothing to trigger on for my unit", () => {
  test("Recruit (0) alone vs Defender (5): the Recruit assigns 0 — Defender takes NO damage and is NOT killed by the Decree; the Recruit takes 5 and dies; I keep bf1", async () => {
    const game = await decreeAttackDance(false);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.state("def")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.trash()).toEqual(["dance"]);
    expect(game.violations()).toEqual([]);
  });

  test("Recruit (0) + Soldier (3) vs Defender (5): Defender takes 3 — not lethal — but 'takes damage' fires the Decree and it is KILLED anyway; the Recruit still contributed nothing", async () => {
    const game = await decreeAttackDance(true);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("def")).toBe("trash"); // 3 < 5, yet dead: Imperial Decree
    // the attackers took the Defender's 5 between them and, having taken damage under the Decree, are dead too
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.zoneOf("soldier")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control (no Dance): Recruit at full 2 Might DOES deal damage — Defender (3) takes 2, and under the Decree that kills it", async () => {
    const game = await board(false).build();
    await game.p2.cast("decree");
    await game.settle();
    await game.p2.move("recruit", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash"); // took 2 (non-lethal) → Decree
    expect(game.zoneOf("recruit")).toBe("trash"); // took 3 ≥ 2
  });
});
