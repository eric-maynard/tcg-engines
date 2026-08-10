/**
 * Ruling 6a68f88abfbd7f82 — Kha'Zix, Mutating Horror (UNL-143 → unl-143-219) · [4][chaos] · 4 Might
 *     "[Ambush] When I attack or defend, if an enemy unit is alone here, give me +2 [Might] this turn and gain 2 XP."
 *   × Pit Rookie (OGN-136 → ogn-136-298) · 2 Might — the lone enemy at the battlefield
 *   × Rengar, Pouncing (SFD-025 → sfd-025-221) · [Reaction] [3][fury] · 3 Might "…including to a battlefield you control."
 *
 * Q: Kha'Zix attacks a battlefield where the opponent's Pit Rookie is alone; in reaction to Kha'Zix's trigger they Reaction-play
 *    Rengar there. Does the trigger still go through?
 * A: Yes. "Alone" is checked when Kha'Zix gains the Attacker designation; the trigger is placed on the chain then. Rengar (LIFO)
 *    enters first, but the trigger does not re-evaluate the board on resolution: Kha'Zix still gets +2 Might and 2 XP.
 * Rules: 383.4.e (attack trigger on designation), 383.2 (condition checked when triggered), 336–340 (LIFO), Reaction units.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KHAZIX = "unl-143-219";
const PIT_ROOKIE = "ogn-136-298";
const RENGAR_POUNCING = "sfd-025-221";

/** P1's turn, 0 XP. P2 holds bf1 with a lone Pit Rookie; Kha'Zix ready in P1's base. P2: Rengar, Pouncing in hand + [3][fury]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", PIT_ROOKIE, "rookie")
    .unit(P1, "base", KHAZIX, "khazix")
    .hand(P2, RENGAR_POUNCING, "rengar");
}

/** Kha'Zix attacks bf1 (Rookie alone) → his trigger is on the initial chain; P1 passes priority to P2. */
async function khazixAttacks(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.xp()).toBe(0);
  expect(game.p2.units("bf1")).toEqual(["rookie"]); // alone
  await game.p1.move("khazix", "bf1");
  expect(game.state("khazix").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "khazix", controller: P1, triggered: true })]);
  expect(game.state("khazix").might).toBe(4); // nothing resolved yet
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 6a68f88abfbd7f82 — Rengar pouncing in response doesn't undo Kha'Zix's already-triggered 'alone' bonus", () => {
  test("P2 may Reaction-play Rengar to bf1 in response; he enters at once, so TWO enemy units are now there while Kha'Zix's trigger is still pending", async () => {
    const game = await khazixAttacks();
    expect(game.p2.can("play", "rengar")).toBe(true);
    await game.p2.play("rengar", { to: "bf1" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.p2.units("bf1").sort()).toEqual(["rengar", "rookie"]); // Rookie no longer alone
    expect(game.chain().some((c) => c.cardId === "khazix" && c.triggered)).toBe(true);
    expect(game.state("khazix").might).toBe(4);
    expect(game.p1.xp()).toBe(0);
  });

  test("the trigger then resolves WITHOUT re-checking the board: Kha'Zix gets +2 Might (4 → 6) this turn and P1 gains 2 XP", async () => {
    const game = await khazixAttacks();
    await game.p2.play("rengar", { to: "bf1" });
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("khazix")).toMatchObject({ might: 6, mightModifier: 2 });
    expect(game.p1.xp()).toBe(2);
    // Still in the showdown at bf1, before combat damage.
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("control — no response: the trigger resolves the same way (+2, 2 XP) and Kha'Zix (6) runs over the lone Rookie to conquer bf1", async () => {
    const game = await khazixAttacks();
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.zoneOf("rookie")).toBe("trash");
    expect(game.zoneOf("khazix")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("contrast — had Rengar ALREADY been at bf1 before the attack (Rookie not alone), the trigger's condition fails: no +2, no XP", async () => {
    const game = await board().unit(P2, "bf1", { might: 3, name: "Early Rengar" }, "early").build();
    await game.p1.move("khazix", "bf1");
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.state("khazix").might).toBe(4);
    expect(game.p1.xp()).toBe(0);
  });
});
