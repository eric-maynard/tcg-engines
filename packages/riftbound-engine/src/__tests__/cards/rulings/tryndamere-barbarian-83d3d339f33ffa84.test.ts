/**
 * Ruling 83d3d339f33ffa84 — Tryndamere, Barbarian (OGN-034 → ogn-034-298) · 8 Might
 *     "When I conquer after an attack, if you assigned 5 or more excess damage to enemy units, you score 1 point."
 *   × Hidden Blade (OGN-213) / any spell cast during the showdown — here Void Seeker (ogn-024-298) "Deal 4 to a unit at
 *     a battlefield. Draw 1." as the spell-damage source.
 *
 * Q: What damage counts toward Tryndamere's "5 or more excess damage assigned"?
 * A: Only COMBAT damage assigned in the combat damage step. Spell damage/kills (which resolve before combat damage)
 *    never add to the excess — but softening a defender with spells first lowers the lethal amount, so more of the
 *    combat damage counts as excess.
 * Rules: 465.2.c (assigning combat damage; excess beyond lethal), 445/471 (conquer scoring), 383.4 (conquer trigger).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRYNDAMERE = "ogn-034-298";
const VOID_SEEKER = "ogn-024-298";

/** P1's turn with 3 + [fury] and Void Seeker; Tryndamere (8) in base; P2 holds bf1 with the given defenders. */
function board(defenders: { might: number; name: string; alias: string }[]) {
  let s = scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", TRYNDAMERE, "trynd")
    .hand(P1, VOID_SEEKER, "seeker");
  for (const d of defenders) {
    s = s.unit(P2, "bf1", { might: d.might, name: d.name }, d.alias);
  }
  return s;
}

/** Tryndamere attacks bf1; with Focus P1 casts Void Seeker on `target` and it resolves (spells resolve before combat damage). */
async function attackAndSeeker(defenders: Parameters<typeof board>[0], target: string): Promise<Game> {
  const game = await board(defenders).build();
  await game.p1.move("trynd", "bf1");
  expect(game.state("trynd").combatRole).toBe("attacker");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("seeker", { targets: target });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("seeker")).toBe("trash");
  // Still in the showdown: no combat damage has been assigned yet.
  expect(game.state("trynd").damage).toBe(0);
  return game;
}

describe("Ruling 83d3d339f33ffa84 — only combat damage counts toward Tryndamere's 5+ excess", () => {
  test("spell kills don't count: Void Seeker kills DefB (3) with 4 (1 'over') before combat; combat is 8 into DefA (4) = 4 excess → conquer scores ONLY the normal 1 point, no Tryndamere trigger", async () => {
    const game = await attackAndSeeker(
      [
        { alias: "a", might: 4, name: "DefA" },
        { alias: "b", might: 3, name: "DefB" },
      ],
      "b",
    );
    expect(game.zoneOf("b")).toBe("trash"); // died to the spell, before the combat damage step
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("trynd")).toBe("bf1");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("softening DOES help: Void Seeker puts 4 on a lone 7-Might defender (lethal now 3), so Tryndamere's 8 combat damage is 5 excess → his trigger fires on the conquer and P1 scores 1 + 1 = 2", async () => {
    const game = await attackAndSeeker([{ alias: "def", might: 7, name: "Def" }], "def");
    expect(game.state("def")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    await game.p2.passFocus();
    await game.p1.passFocus();
    // Combat resolves (single defender: all 8 to it); Def dies, Tryndamere survives the 7 back, P1 conquers…
    for (let i = 0; i < 4 && game.chain().length === 0 && game.decision()?.kind !== "action"; i++) {
      await game.settle({ maxSteps: 1 });
    }
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // …and Tryndamere's conquer trigger is a chain item before the bonus point lands.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "trynd", controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(1);
    await game.settle();
    expect(game.p1.points()).toBe(2);
    expect(game.state("trynd")).toMatchObject({ zone: "battlefield-bf1" });
  });

  test("baseline: the same lone 7-Might defender WITHOUT the spell — 8 combat damage is only 1 excess → just the 1 conquer point", async () => {
    const game = await board([{ alias: "def", might: 7, name: "Def" }]).build();
    await game.p1.move("trynd", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
