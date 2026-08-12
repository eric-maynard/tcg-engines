/**
 * Ruling ad36cda0a55762b8 — Cannon Barrage (OGN-127 → ogn-127-298) · Reaction [2][body]
 *   "Deal 2 to all enemy units in combat."
 *   × Tasty Faefolk (OGN-075 → ogn-075-298) · 6 Might · "[Deathknell] — Channel 2 runes exhausted and draw 1."
 *
 * Q: When units die (or trigger abilities) during the combat Resolution Step, do those triggers resolve
 *    between the Resolution Step's own actions, or does the whole Resolution Step finish first?
 * A: The whole Resolution Step finishes first. Lethally-damaged units are removed, THEN the survivors heal,
 *    and only after that do the Deathknells (and any other triggers) go on the chain and resolve. So a
 *    Deathknell does not open a window in which you could Cannon Barrage a survivor "before it heals".
 * Rules: 466.2 (Resolution Step order: remove lethal, then heal), 321/383 (triggers wait for the step to
 *        finish before they are put on the chain and resolve).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CANNON_BARRAGE = "ogn-127-298";
const TASTY_FAEFOLK = "ogn-075-298";

/** P1's turn: an 8-Might Colossus attacks bf1, held by P2's Tasty Faefolk (6) + a 6-Might Guard.
 *  Colossus assigns 6 to the Faefolk (lethal) and 2 to the Guard; the defenders' 12 kills the Colossus. */
function board() {
  return scenario()
    .autoProcedures(false)
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", TASTY_FAEFOLK, "fae")
    .unit(P2, "bf1", { might: 6, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 8, name: "Colossus" }, "colossus")
    .hand(P1, CANNON_BARRAGE, "barrage");
}

/** Attack, close the showdown, run the combat and stop with the Deathknell on the chain. */
async function fightToDeathknell(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("colossus", "bf1");
  await game.settle();
  await game.p1.choose("resolveFullCombat:bf1");
  expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 8 });
  await game.p1.distribute({ fae: 6, guard: 2 });
  await game.p1.choose("resolveFullCombat:bf1"); // the assignment recorded; now the step runs
  return game;
}

describe("Ruling ad36cda0a55762b8 — the combat Resolution Step (remove lethal, then HEAL) completes before any Deathknell resolves", () => {
  test("setup: the 8-Might attacker splits 6 / 2 — the Faefolk takes lethal, the Guard only a scratch", async () => {
    const game = await board().build();
    await game.p1.move("colossus", "bf1");
    await game.settle();
    expect(game.state("colossus").combatRole).toBe("attacker");
    await game.p1.choose("resolveFullCombat:bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 8 });
    // rule 465.2.c.3 — lethal must be reached on one defender before the next gets any.
    expect((d as { buckets: { key: string; lethal?: number }[] }).buckets.map((b) => [b.key, b.lethal])).toEqual([
      ["fae", 6],
      ["guard", 6],
    ]);
    await game.p1.distribute({ fae: 6, guard: 2 });
    await game.p1.choose("resolveFullCombat:bf1");
    expect(game.zoneOf("fae")).toBe("trash");
    expect(game.zoneOf("colossus")).toBe("trash");
  });

  test("ruling: by the time the Faefolk's Deathknell is on the chain, the Guard has ALREADY healed — its 2 damage is gone", async () => {
    const game = await fightToDeathknell();
    expect(game.chain().map((c) => c.cardId)).toContain("fae");
    expect(game.chain().find((c) => c.cardId === "fae")).toMatchObject({ triggered: true });
    expect(game.state("guard").damage).toBe(0); // healing happened inside the Resolution Step
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
  });

  test("ruling: consequently Cannon Barrage cannot be used to 'finish off' the damaged Guard — it is on a clean slate", async () => {
    const game = await fightToDeathknell();
    expect(game.state("guard").damage).toBe(0);
    if (game.p1.can("cast", "barrage")) {
      await game.p1.cast("barrage");
    }
    await game.settle();
    expect(game.zoneOf("guard")).toBe("battlefield-bf1"); // at most 2 of its 6 Might, never lethal
    expect(game.state("guard").damage).toBeLessThan(6);
  });

  test("ruling: the Deathknell itself still resolves normally after the step — 2 exhausted runes channelled and a card drawn", async () => {
    const game = await fightToDeathknell();
    const runesBefore = game.p2.runes().length;
    const handBefore = game.p2.hand().length;
    await game.settle();
    expect(game.p2.runes()).toHaveLength(runesBefore + 2);
    expect(game.p2.hand()).toHaveLength(handBefore + 1);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: the surviving defender ends the combat undamaged and P2 keeps bf1", async () => {
    const game = await fightToDeathknell();
    await game.settle();
    expect(game.state("guard").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
