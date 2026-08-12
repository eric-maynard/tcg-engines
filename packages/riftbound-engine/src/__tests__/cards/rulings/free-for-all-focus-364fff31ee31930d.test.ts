/**
 * Ruling 364fff31ee31930d — (no specific card) acting in a free-for-all showdown you are not part of
 *
 * Q: In a free-for-all can I play an Action in a showdown I'm not participating in?
 * A: Yes — Focus passes around the whole table in turn order, and when it reaches you, you may play any
 *    legally timed Action, aimed at anything on the board (the showdown does not restrict your targets).
 *    Playing it starts a chain; the showdown is Closed until that chain resolves.
 * Rules: 347.2.b ("Focus passes to the next Player in Turn Order" — every player, not only the combatants),
 *        347.1/347.1.a (the Focus holder may play a legally timed card, which starts a chain), 347.2.a (the
 *        showdown ends when all players have passed once in sequence), 310.4 (Showdown Closed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, P3, scenario } from "../../../harness";

/** [Action] "Give a unit +1 [Might] this turn." */
const NUDGE = {
  abilities: [
    { effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Nudge",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

function focus(game: Game): string | undefined {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1)?.focusPlayer;
}

/** Three players. P1's turn; P1 attacks P2's bf1. P3 sits at their own bf2 with a Nudge in hand. */
function board() {
  return scenario({ players: 3 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P3 })
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P3, "bf2", { might: 5, name: "Watcher" }, "watcher")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P3, NUDGE, "n3");
}

async function showdownWithFocusOn(seat: typeof P1): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  while (focus(game) !== seat) {
    await game.acting().passFocus();
  }
  return game;
}

describe("Ruling 364fff31ee31930d — a bystander gets Focus in turn order and may act in someone else's showdown", () => {
  test("Focus starts with the attacker and walks the whole table: P1 → P2 → P3", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(focus(game)).toBe(P1);
    expect(game.seat(P3).can("cast", "n3")).toBe(false); // not yet
    await game.p1.passFocus();
    expect(focus(game)).toBe(P2);
    expect(game.seat(P3).can("cast", "n3")).toBe(false);
    await game.p2.passFocus();
    expect(focus(game)).toBe(P3); // the non-participant's turn to hold Focus
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P3 });
  });

  test("with Focus, P3 may play an Action although they have no unit at the contested battlefield — and may aim it at a unit in the combat", async () => {
    const game = await showdownWithFocusOn(P3);
    expect(game.seat(P3).can("cast", "n3")).toBe(true);
    const targets = (game.seat(P3).option("cast", "n3")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat();
    expect(targets).toEqual(expect.arrayContaining(["guard", "raider", "watcher"])); // no showdown restriction
    await game.seat(P3).cast("n3", { targets: "guard" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["n3"]); // it starts a chain: the showdown is now Closed
  });

  test("P3's chain resolves like any other and Focus then moves on around the table", async () => {
    const game = await showdownWithFocusOn(P3);
    await game.seat(P3).cast("n3", { targets: "guard" });
    await game.seat(P3).passPriority();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").might).toBe(6); // 5 + 1
    expect(focus(game)).toBe(P1); // next player in turn order after P3
  });

  test("if instead everybody passes once in sequence the showdown ends and the combat is fought (347.2.a)", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 5 ≥ 4
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.violations()).toEqual([]);
  });
});
