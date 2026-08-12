/**
 * Ruling 874744f03bfaa101 — (no specific card) how do priority and Focus pass in a 1v1v1 game?
 *   Exercised with a three-seat scenario, vanilla units and an inline [Action] / [Reaction] pair.
 *
 * Q: In FFA modes (1v1v1, …) during a showdown, how is priority/Focus passed?
 * A: In turn order, from whoever has it — regardless of who actually has units at the contested
 *    battlefield. Focus moves to the next player in turn order when a chain resolves, and when
 *    players pass rather than start a chain, Focus keeps travelling in turn order until every
 *    player has passed in sequence, which ends the showdown.
 * Rules: 347.2.a/347.2.b (a full round of Passes ends the Showdown; otherwise Focus goes to the
 *        next player in Turn Order), 346 (Focus moves when a chain empties), 336–340 (priority
 *        passes in turn order while a chain exists).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, P3, scenario } from "../../../harness";

const RALLY = {
  abilities: [
    {
      effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Three seats, P1's turn. P1 attacks P2's bf1; P3 is an uninvolved third player. */
const board = () =>
  scenario({ players: 3 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf3", { controller: P3 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P3, "bf3", { might: 4, name: "Onlooker" }, "onlooker")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, RALLY, "a1")
    .hand(P2, STING, "s2")
    .hand(P3, STING, "s3");

describe("Ruling 874744f03bfaa101 — Focus and priority travel in turn order, not by who is fighting", () => {
  test("the contester takes Focus; passing it walks the seats in turn order, third player included", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1 });
    await game.p1.passFocus();
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2, passedPlayers: [P1] });
    await game.p2.passFocus();
    // P3 has no unit at bf1 at all and still gets Focus — turn order is what decides.
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P3 });
  });

  test("only a full round of Passes closes it: all three, in sequence", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(showdown(game)?.active).toBe(true);
    await game.seat(P3).passFocus();
    expect(showdown(game)?.active).toBeFalsy();
    expect(game.gameState.battlefields.bf1?.showdownComplete).toBe(true);
  });

  test("priority inside a chain starts with the item's controller and moves on in turn order", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("a1", { targets: "raider" });
    expect(game.decision()).toMatchObject({ context: "chain", seat: P1 }); // adding kept priority
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", seat: P2 });
    expect(game.p2.can("cast", "s2")).toBe(true);
  });

  // The engine resolves the chain item as soon as the attacker and the defender have passed:
  // P3 is skipped entirely, so a third player can never answer a chain they are not part of.
  // Rules 336–340 pass priority to EVERY player in turn order before the top item resolves.
  test.failing(
    "BUG: ruling 874744f03bfaa101 — the third player never receives chain priority; the engine resolves the item after only P1 and P2 pass",
    async () => {
      const game = await board().build();
      await game.p1.move("raider", "bf1");
      await game.p1.cast("a1", { targets: "raider" });
      await game.p1.passPriority();
      await game.p2.passPriority();
      expect(game.chain().length).toBe(1); // engine: already 0 — it resolved without P3
      expect(game.decision()).toMatchObject({ context: "chain", seat: P3 });
      expect(game.seat(P3).can("cast", "s3")).toBe(true);
    },
  );

  test("a chain that empties inside the showdown hands Focus to the NEXT player in turn order", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("a1", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").might).toBe(5);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
