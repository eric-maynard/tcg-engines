/**
 * Ruling 0fcbab9f9afeec6f — Charm (OGN-043 → ogn-043-298) · Spell · Calm · Action · "Move an enemy unit."
 *   × Discipline (ogn-058-298) · Reaction · "Give a unit +2 [Might] this turn. Draw 1." — the responder's Reaction
 *
 * Q: When an opponent plays a spell (Action or not), does focus/priority pass to me so I can respond with a Reaction?
 * A: Yes — PRIORITY does. The caster passes priority, you receive it and may play a Reaction; your Reaction resolves
 *    first (LIFO), then their spell. Focus is a different, showdown-only mechanic (the right to START a chain); outside a
 *    showdown you get no Focus/Action window on their turn, only priority for Reactions while a chain exists.
 * Rules: 332–340 (chain, priority passes, LIFO), 345–347 (Focus is showdown-only), 813 (Reaction timing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const DISCIPLINE = "ogn-058-298";
/** An Action-speed spell for P1, to show Actions are NOT playable in that window. */
const JAB = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Jab (Action)",
  timing: "action",
} as const;

/** P2's turn (the Charm player). P1's Guard (3) holds bf1; bf2 is open. P1 holds Discipline + Jab with resources for both. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 3, power: { calm: 2 } })
    .resources(P1, { energy: 4, power: { calm: 2, fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 2, name: "Minion" }, "minion")
    .hand(P2, CHARM, "charm")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P1, JAB, "jab");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

async function charmCastAndPassed(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("charm", { targets: "guard", answers: ["bf2"] });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("bf2");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", controller: P2 })]);
  expect(game.actingSeat()).toBe(P2); // the caster holds priority first
  await game.p2.passPriority();
  return game;
}

describe("Ruling 0fcbab9f9afeec6f — responding to an opponent's spell: you get PRIORITY (Reactions), not Focus (Actions)", () => {
  test("P2 casts Charm on P1's Guard and passes priority → P1 now holds priority in a chain context (no showdown, no Focus involved)", async () => {
    const game = await charmCastAndPassed();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(showdown(game)?.active ?? false).toBe(false);
  });

  test("in that window P1 may play a REACTION (Discipline) but not an ACTION (Jab)", async () => {
    const game = await charmCastAndPassed();
    expect(game.p1.can("cast", "disc")).toBe(true);
    expect(game.p1.can("cast", "jab")).toBe(false);
    const r = await game.p1.try((p) => p.cast("jab", { targets: "minion" }));
    expect(r.ok).toBe(false);
  });

  test("P1's Discipline goes on top and resolves FIRST (Guard 3 → 5, P1 draws 1) while Charm is still on the chain; then Charm resolves and moves the Guard", async () => {
    const game = await charmCastAndPassed();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("disc", { targets: "guard" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm", "disc"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Discipline resolves
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("guard").might).toBe(5);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
    expect(game.locationOf("guard")).toBe("bf1"); // Charm not yet resolved
    await game.settle();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("guard")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });

  test("outside any chain on P2's turn (Neutral Open) P1 has neither Focus nor priority: no Action, and not even the Reaction, is playable until a chain exists", async () => {
    const game = await board().build();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("cast", "jab")).toBe(false);
    expect(game.p1.can("cast", "disc")).toBe(false);
  });
});
