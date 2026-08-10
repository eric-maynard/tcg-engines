/**
 * Ruling 0288d01794b1db3e — (general timing; the question's example is Retreat, OGN-104 → ogn-104-298 · Reaction · Mind · [1]
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted.")
 *   × Discipline (ogn-058-298) as the turn player's chain-opener.
 *
 * Q: Can you play several Reactions back to back (e.g. Retreat after Retreat), and do you need Focus for that?
 * A: Yes. You only need PRIORITY (not Focus) to play a Reaction; whoever adds an item to the chain receives priority first, so
 *    they can immediately play another Reaction on top. Focus is only what Actions need and does not "chain" like priority.
 * Rules: 337/339 (the player who adds an item gets priority), 151.3 (Reaction needs priority), 347 (Focus governs Actions in a
 *        showdown), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RETREAT = "ogn-104-298";
const DISCIPLINE = "ogn-058-298";

/**
 * P1's turn. P2 holds bf1 with two defenders (A 2, B 2). P1's Raider (4) in base with Discipline + [2]. P2 holds two Retreats + [2].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Defender A" }, "a")
    .unit(P2, "bf1", { might: 2, name: "Defender B" }, "b")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, RETREAT, "ret1")
    .hand(P2, RETREAT, "ret2");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks bf1 (combat showdown, P1 has Focus); P1 Disciplines the Raider and passes priority → P2 has PRIORITY, P1 keeps FOCUS. */
async function p2HasPriorityNotFocus(game: Game): Promise<void> {
  await game.p1.move("raider", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P1 });
  await game.p1.cast("disc", { targets: "raider" });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(showdown(game)?.focusPlayer).toBe(P1);
}

describe("Ruling 0288d01794b1db3e — Reactions chain on priority alone; Focus is not needed and stays put", () => {
  test("with priority but WITHOUT Focus, P2 may play a Reaction (Retreat on A) — and having added it, P2 receives priority again first", async () => {
    const game = await board().build();
    await p2HasPriorityNotFocus(game);
    expect(game.p2.can("cast", "ret1")).toBe(true);
    await game.p2.cast("ret1", { targets: "a" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "ret1"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // priority back to the adder
    expect(showdown(game)?.focusPlayer).toBe(P1); // Focus never moved
  });

  test("…so P2 can immediately stack a SECOND Reaction (Retreat on B) on top: chain = Discipline, Retreat, Retreat — Focus still P1's", async () => {
    const game = await board().build();
    await p2HasPriorityNotFocus(game);
    await game.p2.cast("ret1", { targets: "a" });
    expect(game.p2.can("cast", "ret2")).toBe(true);
    await game.p2.cast("ret2", { targets: "b" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "ret1", "ret2"]);
    expect(game.p2.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(showdown(game)?.focusPlayer).toBe(P1);
  });

  test("the stack resolves LIFO: B then A return to P2's hand (P2 channels 2 runes exhausted), Discipline last; with no defenders left the Raider conquers", async () => {
    const game = await board().build();
    await p2HasPriorityNotFocus(game);
    const runes0 = game.p2.runes().length;
    await game.p2.cast("ret1", { targets: "a" });
    await game.p2.cast("ret2", { targets: "b" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // ret2
    expect(game.zoneOf("b")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "ret1"]);
    await game.settle();
    expect(game.zoneOf("a")).toBe("hand");
    expect(game.p2.runes()).toHaveLength(runes0 + 2);
    expect(game.p2.runes({ ready: true })).toHaveLength(0);
    expect(game.state("raider").might).toBe(6);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: an [Action] is what needs Focus — during the same window P2 (priority, no Focus, Closed state) could NOT have played an Action spell", async () => {
    const ACTION_SPELL = {
      abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "fury",
      energyCost: 0,
      name: "Test Jab",
      timing: "action",
    } as const;
    const game = await board().hand(P2, ACTION_SPELL, "jab").build();
    await p2HasPriorityNotFocus(game);
    expect(game.p2.can("cast", "ret1")).toBe(true);
    expect(game.p2.can("cast", "jab")).toBe(false);
  });
});
