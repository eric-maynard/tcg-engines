/**
 * Ruling ced8115320614f0b — Reaver's Row (OGN-285 → ogn-285-298, Battlefield) "When you defend here, you may move a friendly unit
 *   here to base."   × Vex, Cheerless (SFD-146 → sfd-146-221) · 5 Might "While I'm in combat, friendly spells cost [1][rainbow]
 *   less to a minimum of [1], and enemy spells cost [1][rainbow] more."   (+ Gust ogn-169-298 Reaction [1]; Rebuke ogn-172-298 Action)
 *
 * Q: Vex attacks into Reaver's Row and the defender takes the Row trigger. Is this combat, and can spells be played while the
 *    trigger is on the chain — with Vex's cost change applying?
 * A: Yes, it is combat (Vex is in combat from the move). While the Row trigger is on the chain only REACTION spells can be
 *    played, and the defender's cost Vex's extra [1][rainbow]. Actions wait until the chain is empty and you have Focus. The
 *    chain resolves LIFO: reactions first, the Row trigger last.
 * Rules: 464 (combat begins on the move), 383.4.f (defend trigger → initial chain), 331/336 (Closed state: reactions only),
 *        347 (Focus after the chain empties), 356.4 (cost modifiers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const VEX_CHEERLESS = "sfd-146-221";
const GUST = "ogn-169-298"; // Reaction, [1]
const REBUKE = "ogn-172-298"; // Action, [2][chaos][chaos]

/** P2's turn. P1 holds the live Reaver's Row with Big (3) + Small (2); P2's Vex, Cheerless (5) attacks from base. */
function board(p1: { energy: number; power: Record<string, number> }) {
  return scenario()
    .active(P2)
    .resources(P1, p1)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 3, name: "Big" }, "big")
    .unit(P1, "row", { might: 2, name: "Small" }, "small")
    .unit(P2, "base", VEX_CHEERLESS, "vex")
    .hand(P1, GUST, "gust")
    .hand(P1, REBUKE, "rebuke");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Vex moves in; P1 accepts the Row trigger targeting Small. Returns with the trigger on the chain and P1 holding priority. */
async function vexAttacksRowTaken(p1: { energy: number; power: Record<string, number> }): Promise<Game> {
  const game = await board(p1).build();
  await game.p2.move("vex", "row");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" }, timing: "FIN" });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "row" } });
  await game.p1.pick("small");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, targets: ["small"], triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling ced8115320614f0b — Vex attacking into Reaver's Row: it is combat; reactions (taxed by Vex) may answer the Row trigger, actions may not", () => {
  test("it IS combat: a combat showdown at the Row with Vex designated attacker and P1's units defenders — the Row's 'When you defend here' fired for P1", async () => {
    const game = await vexAttacksRowTaken({ energy: 5, power: { chaos: 4 } });
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "row", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("vex").combatRole).toBe("attacker");
    expect(game.state("big").combatRole).toBe("defender");
  });

  test("with the trigger on the chain P1 may NOT play the Action Rebuke, but MAY play the Reaction Gust — at Vex's taxed cost [2]+[rainbow] (base [1]): 1 energy is not enough", async () => {
    const poor = await vexAttacksRowTaken({ energy: 1, power: { chaos: 3 } });
    expect(poor.state("gust")).toMatchObject({ energyCost: 1, powerCost: [] }); // printed cost
    expect(poor.p1.can("cast", "rebuke")).toBe(false);
    expect(poor.p1.can("cast", "gust")).toBe(false); // [1] on hand < taxed [2]

    const game = await vexAttacksRowTaken({ energy: 5, power: { chaos: 4 } });
    expect(game.p1.can("cast", "rebuke")).toBe(false);
    expect((await game.p1.try((p) => p.cast("rebuke", { targets: "vex" }))).ok).toBe(false);
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "big" });
    // Paid [2] + 1 power of any domain instead of the printed [1].
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 3 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["row", "gust"]);
  });

  test("LIFO: Gust resolves first (Big → hand), then the Row trigger (Small → base); only then, chain empty and holding Focus, can P1 play the Action Rebuke — still taxed ([3] + chaos,chaos + 1)", async () => {
    const game = await vexAttacksRowTaken({ energy: 5, power: { chaos: 4 } });
    await game.p1.cast("gust", { targets: "big" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Gust resolves
    expect(game.zoneOf("big")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["row"]);
    expect(game.locationOf("small")).toBe("row"); // Row not resolved yet
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("small")).toBe("base");
    // Post-resolution: Focus goes round the showdown; Rebuke needs P1's Focus.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    if (game.actingSeat() === P2) {
      expect(game.p1.can("cast", "rebuke")).toBe(false); // no Focus yet
      await game.p2.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("vex").combatRole).toBe("attacker"); // still in combat → tax still on
    expect(game.p1.can("cast", "rebuke")).toBe(true);
    await game.p1.cast("rebuke", { targets: "vex" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // [2]+2 chaos printed, +[1]+1 any from Vex
    await game.settle();
    expect(game.zoneOf("vex")).toBe("hand");
    expect(game.gameState.battlefields.row?.contested).toBe(false); // combat over (P1 has no unit left there, so control lapses — 323.6)
    expect(game.violations()).toEqual([]);
  });
});
