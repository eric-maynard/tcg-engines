/**
 * Ruling ff759dd1e9d04c4e — Noxian Drummer (OGN-222 → ogn-222-298) · 3 Might · "When I move to a battlefield, play a 1 [Might] Recruit unit
 *     token here."
 *   × Trifarian War Camp (OGN-294 → ogn-294-298) · Battlefield · "Units here have +1 [Might]."
 *   × Nine-Tailed Fox (OGN-255 → ogn-255-298, Ahri legend) · "When an enemy unit attacks a battlefield you control, give it -1 [Might] this
 *     turn, to a minimum of 1 [Might]."
 *
 * Q: Drummer moves to the opponent's Trifarian War Camp (opponent = Ahri legend). Is the Recruit token it makes also hit by Ahri's −1?
 * A: Yes. Sequence: Drummer moves → its ability goes on the chain → resolves (token created there) → THEN the showdown begins → Ahri triggers
 *    for the attacking units, token included.
 * Rules: 401.1 / 344 (a pending move-trigger keeps the state Closed; the showdown opens once the chain empties), 464.2 (units present when
 *        combat begins are designated attackers), 383 (Fox trigger per attacking enemy unit).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOXIAN_DRUMMER = "ogn-222-298";
const TRIFARIAN_WAR_CAMP = "ogn-294-298";
const NINE_TAILED_FOX = "ogn-255-298";

/** P1's turn. P2 (Nine-Tailed Fox) holds the LIVE Trifarian War Camp with a Guard (5 → 6 there). P1's Drummer ready in base. */
function board() {
  return scenario()
    .legend(P2, NINE_TAILED_FOX, "fox")
    .battlefield("camp", { controller: P2, def: TRIFARIAN_WAR_CAMP, inert: false })
    .unit(P2, "camp", { might: 5, name: "Guard" }, "guard")
    .unit(P1, "base", NOXIAN_DRUMMER, "drummer");
}

const showdown = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).find((s) => s.active);
const recruitAtCamp = (game: Game) => game.p1.units("camp").find((u) => game.state(u).isToken);

/** Drummer → camp; both pass so its move trigger resolves (token made) and the combat showdown opens. */
async function drummerArrivesTokenMade(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("drummer", "camp");
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling ff759dd1e9d04c4e — the Drummer's Recruit exists before the showdown begins, so Ahri's −1 hits it too", () => {
  test("Drummer moves to the War Camp: its 'play a Recruit here' trigger is on the chain FIRST — no showdown yet, no combat roles (and the Camp already gives the Drummer +1 → 4)", async () => {
    const game = await board().build();
    await game.p1.move("drummer", "camp");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drummer", controller: P1, triggered: true })]);
    expect(showdown(game)).toBeUndefined();
    expect(game.state("drummer")).toMatchObject({ combatRole: null, location: "camp", might: 4 });
    expect(game.gameState.battlefields.camp).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("the trigger resolves: a 1-Might Recruit token is played AT the Camp (2 there); only now the COMBAT showdown begins with Drummer AND token as attackers", async () => {
    const game = await drummerArrivesTokenMade();
    const tok = recruitAtCamp(game);
    expect(tok).toBeDefined();
    expect(game.state(tok!)).toMatchObject({ baseMight: 1, controller: P1, location: "camp", name: "Recruit" });
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "camp", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("drummer").combatRole).toBe("attacker");
    expect(game.state(tok!).combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
  });

  test("Ahri triggers for the attackers — one Nine-Tailed Fox item per attacking enemy unit, i.e. TWO (Drummer + token), controlled by P2", async () => {
    const game = await drummerArrivesTokenMade();
    const foxItems = game.chain().filter((c) => c.cardId === "fox" && c.triggered && c.controller === P2);
    expect(foxItems).toHaveLength(2);
    // not applied yet
    expect(game.state("drummer").might).toBe(4);
    expect(game.state(recruitAtCamp(game)!).might).toBe(2);
  });

  test("they resolve: Drummer 3+1−1 = 3, and the TOKEN is debuffed as well: 1+1−1 = 1 (its −1 modifier is really there)", async () => {
    const game = await drummerArrivesTokenMade();
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("drummer")).toMatchObject({ baseMight: 3, might: 3, mightModifier: -1, staticMightBonus: 1 });
    const tok = recruitAtCamp(game)!;
    expect(game.state(tok)).toMatchObject({ baseMight: 1, might: 1, mightModifier: -1, staticMightBonus: 1 });
    expect(game.state("guard")).toMatchObject({ might: 6, mightModifier: 0 });
    expect(showdown(game)).toMatchObject({ isCombatShowdown: true });
    expect(game.violations()).toEqual([]);
  });
});
