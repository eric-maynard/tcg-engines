/**
 * Ruling 6f7d86e367ff1647 — Emperor's Dais (SFD-207 → sfd-207-221) · Battlefield
 *     "When you conquer here, you may pay [1] and return a unit you control here to its owner's hand. If you do, play a
 *      2 [Might] Sand Soldier unit token here."
 *
 * Q: When the Dais triggers on conquer and you return your ONLY unit there, does the Sand Soldier still get played to the
 *    battlefield even though you "lose control mid-resolution"?
 * A: The token IS still played "here" — the ability text pre-selects the battlefield as its destination regardless of
 *    control. (riftjudge adds: returning your only unit makes you lose control during the cleanup, the token then arrives
 *    at a battlefield you don't control, a showdown follows and you regain control without conquering again.)
 *
 * RULING-CONFLICT (second half only): riftjudge 6f7d86e367ff1647 says control is lost between the return and the token's
 * arrival and a showdown is staged; CR 190.4 / 323.6 (+ official clarification 9a32c2cc829f221a) say control only lapses
 * at a Cleanup performed in an OPEN State — the return and the token's play both happen while the Dais ability is
 * resolving (Closed State), so P1 never stops controlling the Dais, the token simply arrives at P1's own battlefield, and
 * no showdown is staged. Engine follows CR (battlefield-control timing model, FIXER-PRIMER § BATTLEFIELD CONTROL TIMING).
 * Rules: 383.3.a (leading "you may" at finalization), 205 / 444.2 (pay [1] + return performed on resolution), 359.3.e.14
 *        ("if you do"), 190.4 / 323.6 (control), 469.1 (no second conquer of a scored battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EMPERORS_DAIS = "sfd-207-221";

/** P1's turn with exactly [1]. Live, uncontrolled Dais; P1's lone Runner (3) in base; P2 holds bf2. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 1 })
    .battlefield("dais", { controller: null, def: EMPERORS_DAIS, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Watcher" }, "watcher")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner");
}

const soldiersAt = (game: Game, where: string) => game.cardsAt(where).filter((id) => game.state(id).isToken && game.state(id).name === "Sand Soldier");

/** Runner conquers the empty Dais; P1 accepts the Dais, names/returns the Runner (its only unit there); drive to the open state, recording whether any showdown at the Dais was ever offered after the conquer. */
async function conquerAndTakeTheDais(): Promise<{ game: Game; showdownAfterConquer: boolean }> {
  const game = await board().build();
  await game.p1.move("runner", "dais");
  let conquered = false;
  let showdownAfterConquer = false;
  for (let i = 0; i < 24; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (game.gameState.battlefields.dais?.controller === P1) {
      conquered = true;
    }
    if (d.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "dais") {
      expect(conquered).toBe(true);
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "runner")) {
      await game.p1.pick("runner");
    } else if (d.kind === "action" && d.passKey) {
      if (conquered && d.context === "showdown") {
        showdownAfterConquer = true;
      }
      await game.seat(d.seat).pass();
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (game.seat(d.seat).can("startShowdown")) {
      showdownAfterConquer = true;
      await game.seat(d.seat).choose(game.seat(d.seat).legal().find((o) => o.verb === "startShowdown")!.key);
    } else {
      break;
    }
  }
  return { game, showdownAfterConquer };
}

describe("Ruling 6f7d86e367ff1647 — returning your only unit to the Dais still plays the Sand Soldier HERE", () => {
  test("the conquer scores 1 and the Dais trigger asks P1 (opt-in, then the unit to return); accepting pays [1] and puts the Runner — P1's only unit there — back in hand", async () => {
    const { game } = await conquerAndTakeTheDais();
    expect(game.zoneOf("runner")).toBe("hand");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.points()).toBe(1);
  });

  test("the Sand Soldier token is nevertheless played AT THE DAIS ('here' is pre-selected by the ability text), not to base: a 2-Might token unit of P1's stands there", async () => {
    const { game } = await conquerAndTakeTheDais();
    const atDais = soldiersAt(game, "dais");
    expect(atDais).toHaveLength(1);
    expect(game.state(atDais[0]!)).toMatchObject({ controller: P1, isToken: true, location: "dais", might: 2, owner: P1 });
    expect(soldiersAt(game, "base")).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 6f7d86e367ff1647 says P1 loses the Dais in a cleanup between the return and the token's arrival, the
  // token lands on an uncontrolled battlefield and a showdown is triggered; CR 190.4/323.6 (+ official 9a32c2cc829f221a) say control
  // cannot lapse mid-resolution (Closed State) — engine follows CR: P1 controls the Dais throughout, no showdown, no re-conquer.
  test("ruling 6f7d86e367ff1647 (rewritten to CR 190.4/323.6) — control never lapses mid-resolution: the Dais stays P1's, NO showdown is staged after the conquer, still exactly 1 point, and play returns to P1's open main phase", async () => {
    const { game, showdownAfterConquer } = await conquerAndTakeTheDais();
    expect(showdownAfterConquer).toBe(false);
    expect(game.gameState.battlefields.dais).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1); // "you cannot conquer the same battlefield twice in one turn" holds either way
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["dais"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("and the token holds the Dais for P1 next turn (it is a real unit there): after a full round P1 scores the hold → 2", async () => {
    const { game } = await conquerAndTakeTheDais();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });
});
