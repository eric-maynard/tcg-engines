/**
 * Ruling 1b4a53de3f0b4c51 — filed under Shadow (UNL-194 → unl-194-219), but the question is about the SHADOW CLONE
 *   unit token (rule 187.11): a 0 [Might] token with "When I attack, you may banish a unit from your trash. If you
 *   do, give me [Assault 4] this turn."
 *   Made here by Death Mark (VEN-144 → ven-144-166) · Spell · "[Burn 3]. Play a 0 [Might] Shadow Clone unit token."
 *
 * Q: Can you banish a unit from your trash with a Shadow Clone if the battlefield it moves to is empty?
 * A: No. "When I attack" only triggers when a unit gains the ATTACKER designation during a Combat. Moving onto an
 *    empty battlefield stages a Non-Combat Showdown, where no Attacker designation is ever handed out, so the trigger
 *    never fires and nothing is banished. Banishing from the trash is a perfectly legal effect in itself — the
 *    trigger condition simply isn't met. Move into a battlefield an enemy unit occupies and it is a real Combat: the
 *    Clone is designated Attacker, the trigger fires, and banishing a unit from the trash grants it [Assault 4].
 * Rules: 383.4.e / 383.4.e.1 / 383.4.e.2 (Attack Triggers fire when a unit gains the Attacker designation during a
 *        combat), 323.2/323.2.a (designations are only assigned "if there is a Combat in progress"), 323.9 (a Combat
 *        is only staged where opposing players both have units), 427 (Banish), 807 (Assault).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEATH_MARK = "ven-144-166";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit — deck stock that [Burn 3] puts into the trash

/**
 * P1's turn 2 with exactly Death Mark's [2] + pip; the top three cards of P1's deck are units (they become the
 * banishable trash). bf1 is open and EMPTY; bf2 is held by P2 with a 3-Might Defender.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Defender D" }, "d")
    .deckTop(P1, SKULKER, "d1")
    .deckTop(P1, SKULKER, "d2")
    .deckTop(P1, SKULKER, "d3")
    .hand(P1, DEATH_MARK, "dm");
}

const cloneOf = (game: Game): string => {
  const c = game.findAll({ name: "Shadow Clone", owner: P1 }).find((id) => game.locationOf(id) !== undefined);
  expect(c).toBeDefined();
  return c as string;
};

/** Resolve Death Mark, then hand the turn round to P1's next turn so the Clone is ready. */
async function withClone(): Promise<{ clone: string; game: Game }> {
  const game = await board().build();
  await game.p1.cast("dm");
  expect((await game.settle()).reason).toBe("open");
  const clone = cloneOf(game);
  expect(game.state(clone)).toMatchObject({ baseMight: 0, isToken: true, zone: "base" });
  expect(game.p1.trash().sort()).toEqual(["d1", "d2", "d3", "dm"]); // three banishable UNITS + the spell
  await game.advanceTurn();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.state(clone).isReady).toBe(true);
  return { clone, game };
}

describe("Ruling 1b4a53de3f0b4c51 — a Shadow Clone that moves to an EMPTY battlefield never attacks, so it cannot banish", () => {
  test("moving to an empty, uncontrolled battlefield stages a NON-combat showdown: no Attacker designation, no trigger, no prompt", async () => {
    const { clone, game } = await withClone();
    const trashBefore = game.p1.trash().sort();
    await game.p1.move(clone, "bf1");
    const showdown = (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
    expect(showdown).toHaveLength(1);
    expect(showdown[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false });
    // 383.4.e — the Clone never gained the Attacker designation, so its "When I attack" is not on the chain.
    expect(game.state(clone).combatRole).toBe(null);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.decision()?.kind).not.toBe("yes-no");
    // Nothing was banished and no Assault was granted.
    expect(game.p1.trash().sort()).toEqual(trashBefore);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.state(clone).keywords).not.toContain("Assault");
    expect(game.state(clone).might).toBe(0);
  });

  test("the same holds for an ENEMY-CONTROLLED but unoccupied battlefield — still no combat, still no banish", async () => {
    const { clone, game } = await withClone();
    const trashBefore = game.p1.trash().sort();
    await game.p1.move(clone, "bf3"); // P2 controls bf3 but has no unit there
    const showdown = (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
    expect(showdown[0]).toMatchObject({ battlefieldId: "bf3", isCombatShowdown: false });
    expect(game.state(clone).combatRole).toBe(null);
    expect(game.chain()).toEqual([]);
    expect(game.p1.trash().sort()).toEqual(trashBefore);
    expect(game.p1.banishment()).toEqual([]);
  });

  test("the empty-battlefield line plays out with the Clone at 0 Might: it conquers bf1 and still nothing left the trash", async () => {
    const { clone, game } = await withClone();
    await game.p1.move(clone, "bf1");
    await game.settle();
    expect(game.zoneOf(clone)).toBe("battlefield-bf1");
    expect(game.state(clone).might).toBe(0); // no [Assault 4]
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.trash().sort()).toEqual(["d1", "d2", "d3", "dm"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — moving into the enemy-OCCUPIED bf2 is a real Combat: the Clone is the Attacker, the trigger fires, and P1 may banish a unit from the trash for [Assault 4]", async () => {
    const { clone, game } = await withClone();
    await game.p1.move(clone, "bf2");
    const showdown = (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);
    expect(showdown[0]).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf2", isCombatShowdown: true });
    expect(game.state(clone).combatRole).toBe("attacker");
    // "you may banish a unit from your trash" — the opt-in, then the choice among UNITS in P1's trash (427).
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect((d as { options: { card?: string; key: string }[] }).options.map((o) => o.card ?? o.key).sort()).toEqual([
      "d1",
      "d2",
      "d3",
    ]); // the spell "dm" is not a unit
    await game.p1.pick("d1");
    await game.settle();
    expect(game.zoneOf("d1")).toBe("banishment");
    expect(game.p1.trash().sort()).toEqual(["d2", "d3", "dm"]);
    // Assault 4 made the 0-Might Clone a 4-Might attacker: it beat the 3-Might Defender and took bf2.
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.zoneOf(clone)).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — declining the 'you may' in a real combat also banishes nothing, and the 0-Might Clone loses the combat", async () => {
    const { clone, game } = await withClone();
    await game.p1.move(clone, "bf2");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.trash().sort()).toEqual(["d1", "d2", "d3", "dm"]);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
