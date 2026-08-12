/**
 * Ruling 32e65c4a4169f092 — Last Rites (SFD-150 → sfd-150-221) · Equipment ·
 *   "When I conquer or hold, you may play a unit from your trash. (You still pay its costs.)"
 *   × Ride the Wind (OGN-173 → ogn-173-298, "[Action] Move a friendly unit and ready it") as the way to
 *   conquer on the opponent's turn.
 *
 * Q: Can you play a unit with Last Rites if you conquer during the opponent's turn?
 * A: Yes. The trigger names no window ("this turn" and the like would impose normal timing), so the play
 *    it grants ignores the ordinary restriction that units are played on your own turn: the trigger goes
 *    on the chain, you decide whether to use it, then the unit is played — costs still paid — and
 *    resolves, all during the opponent's turn.
 * Rules: 383.3.a (a leading "you may" is decided when the trigger is finalized), 469.1 / 466.5.d
 *        (conquering can happen on any turn), 421.2 (an effect that says to play a card overrides the
 *        default timing), 404 (the played card's own costs are still paid).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LAST_RITES = "sfd-150-221";
const RIDE_THE_WIND = "ogn-173-298"; // 2 energy + [chaos]
const PORO = "ogn-210-298"; // 2 energy · 2 Might

/**
 * Turn 3 is P2's. bf1 is empty and uncontrolled. P1's 5-Might Champ (7 with Last Rites) waits in base
 * with Ride the Wind in hand and a Daring Poro in the trash; P2 has a 2-Might Raider in base.
 */
const board = () =>
  scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 6, power: { chaos: 1 } })
    .battlefield("bf1")
    .unit(P1, "base", { might: 5, name: "Champ" }, "champ", { equippedWith: ["rites"] })
    .card("rites", { def: LAST_RITES, meta: { attachedTo: "champ" }, owner: P1, zone: "base" })
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .trash(P1, PORO, "poro")
    .hand(P1, PORO, "handPoro")
    .hand(P1, RIDE_THE_WIND, "ride");

/** P2 walks onto the empty bf1; P1 rides in behind them, wins the combat and conquers — on P2's turn. */
async function conquerOnTheirTurn(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  await game.p2.passFocus();
  await game.p1.cast("ride", { targets: "champ", answers: ["battlefield-bf1"] });
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  return game;
}

describe("Ruling 32e65c4a4169f092 — Last Rites' trigger plays a unit from the trash on the opponent's turn", () => {
  test("baseline: P1 may NOT simply play a unit from hand during P2's turn", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("play", "handPoro")).toBe(false);
  });

  test("the conquer really happens on P2's turn, and the \"you may\" is asked of P1 there", async () => {
    const game = await conquerOnTheirTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });

  test("accepting it plays the trashed Poro during P2's turn — normal play timing is ignored, its cost is not", async () => {
    const game = await conquerOnTheirTurn();
    const energyBefore = game.p1.energy();
    await game.p1.yes();
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("poro");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.p1.energy()).toBe(energyBefore - 2); // "You still pay its costs."
    expect(game.turnPlayer()).toBe(P2); // still the opponent's turn
    expect(game.violations()).toEqual([]);
  });

  test("declining leaves the unit in the trash and spends nothing", async () => {
    const game = await conquerOnTheirTurn();
    const energyBefore = game.p1.energy();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.energy()).toBe(energyBefore);
    expect(game.chain()).toEqual([]);
  });
});
