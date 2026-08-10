/**
 * Ruling 656d4cdec2062879 — Flurry of Feathers (UNL-044 → unl-044-219) · Reaction · [4][calm][calm]
 *     "Choose one — Counter a spell. / Play four 1 [Might] Bird unit tokens with [Deflect]."   (Bird token = unl-t02)
 *   × The Grand Plaza (OGN-293 → ogn-293-298, Battlefield) "When you hold here, if you have 7+ units here, you win the game."
 *
 * Q: Can you react with Flurry of Feathers before you score for holding and win with The Grand Plaza?
 * A: No. The Plaza is "condition, condition, effect": you must ALREADY have 7+ units there at the moment you hold. With 6 or fewer the
 *    ability never triggers and there is no priority window before the hold in which to Flurry up to 7. (And even when it does
 *    trigger, Birds could only be played to base / a battlefield you control — never into a Plaza you are attacking.)
 * Rules: 383.2.a.1 (an "if" right after the trigger condition is part of the condition — checked when the hold happens),
 *        315.2 (Beginning Phase: scoring step precedes any action window), 469.2 (Hold), 439.2.b.1 (token placement).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLURRY = "unl-044-219";
const GRAND_PLAZA = "ogn-293-298";

/** End of P2's turn 2. P1 controls the LIVE Grand Plaza with `n` 1-Might Citizens and holds Flurry of Feathers with [4][calm][calm]. */
function plaza(n: number) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .resources(P1, { energy: 4, power: { calm: 2 } })
    .battlefield("plaza", { controller: P1, def: GRAND_PLAZA, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Watcher" }, "watcher")
    .hand(P1, FLURRY, "fof");
  for (let i = 0; i < n; i++) {
    b.unit(P1, "plaza", { might: 1, name: `Citizen ${i}` }, `c${i}`);
  }
  return b;
}

const birds = (game: Game, at?: string) => game.p1.units(at).filter((id) => game.state(id).isToken);

describe("Ruling 656d4cdec2062879 — no Flurry window before the Plaza's hold check: 6 units hold for a point, nothing more", () => {
  test("6 Citizens: P2 ends the turn → P1 holds the Plaza for 1 point but NO Plaza trigger is ever put on the chain and the game is not won", async () => {
    const game = await plaza(6).build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain().some((c) => c.cardId === "plaza")).toBe(false);
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.p1.points()).toBe(1); // the ordinary hold point
    expect(game.phase()).toBe("main");
  });

  test("…and there was no earlier moment to Flurry: the first decision P1 gets after P2's end of turn already has the hold scored (1 point) — the Reaction could not be slipped in 'before scoring'", async () => {
    const game = await plaza(6).build();
    expect(game.p1.points()).toBe(0);
    // On P2's turn, in P2's open main phase, P1 holds no priority at all.
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("cast", "fof")).toBe(false);
    await game.p2.endTurn();
    // Walk forward to the very first decision that belongs to P1.
    for (let i = 0; i < 12 && game.decision()?.seat !== P1; i++) {
      const d = game.decision();
      if (d?.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.decision()?.seat).toBe(P1);
    expect(game.p1.points()).toBe(1); // scoring already happened
    expect(game.p1.units("plaza")).toHaveLength(6);
    expect(game.isOver()).toBe(false);
  });

  test("Flurry AFTER the hold (main phase, Bird mode, all four Birds onto the Plaza → 10 units there) wins nothing this turn — the hold moment has passed; the win only comes when P1 next holds with 7+", async () => {
    const game = await plaza(6).build();
    await game.advanceTurn(); // → P1's main phase, 1 point (pools emptied at end of turn — refill for the cast)
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 4, power: { calm: 2 } });
    await game.p1.cast("fof", { mode: 1 });
    await game.settle();
    for (let i = 0; i < 4 && game.decision()?.kind === "pick"; i++) {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("battlefield-plaza"); // legal: P1 CONTROLS the Plaza (not attacking it)
    }
    await game.settle();
    expect(birds(game, "plaza")).toHaveLength(4);
    expect(game.p1.units("plaza")).toHaveLength(10);
    expect(game.isOver()).toBe(false);
    expect(game.p1.points()).toBe(1);
    // Next time P1 holds (start of P1's following turn) the condition is met → win.
    await game.advanceTurn(); // → P2
    expect(game.isOver()).toBe(false);
    await game.p2.endTurn(); // → P1's Beginning Phase: hold with 10 ≥ 7
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "plaza", controller: P1, triggered: true })]);
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.winner()).toBe(P1);
  });

  test("contrast: ALREADY 7 Citizens at the hold → the Plaza triggers in P1's Beginning Phase and P1 wins on resolution (at 1 point)", async () => {
    const game = await plaza(7).build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "plaza", controller: P1, triggered: true })]);
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("nuance — Bird placement: tokens go only to base or a battlefield P1 CONTROLS; while P1 is merely attacking P2's bf2, bf2 is never offered", async () => {
    const game = await plaza(6).unit(P1, "base", { might: 2, name: "Runner" }, "runner").build();
    await game.advanceTurn(); // P1's turn
    await game.p1.do("addResources", { energy: 4, power: { calm: 2 } });
    await game.p1.move("runner", "bf2"); // combat showdown at bf2, P1 attacking with Focus
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf2" });
    expect(game.p1.can("cast", "fof")).toBe(true);
    await game.p1.cast("fof", { mode: 1 });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(keys).toEqual(["base", "battlefield-plaza"]);
    expect(keys).not.toContain("battlefield-bf2");
  });
});
