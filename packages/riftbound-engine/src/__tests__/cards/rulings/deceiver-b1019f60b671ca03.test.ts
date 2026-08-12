/**
 * Ruling b1019f60b671ca03 — Deceiver (UNL-199 → unl-199-219) · Legend (LeBlanc)
 *   "When you conquer or hold, you may discard 1 and exhaust me to play a ready Reflection unit token there.
 *    It becomes a copy of another unit there. Give it [Temporary]."
 *
 * Q: Does LeBlanc's hold trigger happen before or after the Draw Phase?
 * A: Before. Holding is scored in the Beginning Phase, so "when you … hold" triggers and resolves there.
 *    The turn's Channel Phase and then the Draw Phase (the standard draw) come afterwards.
 * Rules: 315 (turn structure: Beginning → Channel → Draw → Main), Hold scoring in the Beginning Phase,
 *        315.4.b (the standard turn draw happens in the Draw Phase), 383 (the trigger resolves where it fired).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DECEIVER = "unl-199-219";

const FODDER = { cardType: "unit", energyCost: 1, might: 1, name: "Fodder" } as const;

/** P2's turn (turn 2). P1 has the Deceiver legend and durably holds bf1 with a Warden; one card in hand. */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, DECEIVER, "leblanc")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Warden" }, "warden")
    .hand(P1, FODDER, "fodder");
}

/** P2 ends the turn; P1's Beginning Phase scores the hold and the Deceiver trigger is asked. */
async function intoP1Beginning(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain") {
      break;
    }
    await game.seat(d.seat).pass();
  }
  return game;
}

describe("Ruling b1019f60b671ca03 — Deceiver's hold trigger is a BEGINNING-phase event, ahead of the Draw Phase", () => {
  test("ruling: the trigger is asked while the game is still in the Beginning Phase", async () => {
    const game = await intoP1Beginning();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "leblanc" } });
  });

  test("ruling: the hold point has already been scored when the trigger is on offer (hold scoring is the Beginning Phase)", async () => {
    const game = await intoP1Beginning();
    expect(game.p1.points()).toBe(1);
  });

  test("ruling: the standard turn draw has NOT happened yet — P1's hand is untouched while the trigger waits", async () => {
    const game = await intoP1Beginning();
    expect(game.p1.hand()).toEqual(["fodder"]); // still exactly what it was at the end of P2's turn
  });

  test("ruling: declining the trigger, the Draw Phase then follows — the card is drawn and the game reaches Main", async () => {
    const game = await intoP1Beginning();
    await game.p1.no();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(2); // fodder + the Draw Phase card
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: accepting it also resolves in the Beginning Phase — the discard+exhaust cost is paid there, before the draw", async () => {
    const game = await intoP1Beginning();
    expect(game.phase()).toBe("beginning");
    await game.p1.yes();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("fodder");
    }
    expect(game.zoneOf("fodder")).toBe("trash"); // the discard cost, paid at finalization
    expect(game.state("leblanc").isExhausted).toBe(true);
    expect(game.phase()).toBe("beginning"); // still not the Draw Phase
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(1); // only the Draw Phase card
  });
});
