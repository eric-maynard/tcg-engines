/**
 * Ruling c79fff6eed49907b — Get Excited! (OGN-008 → ogn-008-298) · [Action] · Fury · [2][fury]
 *     "Discard 1. Deal its Energy cost as damage to a unit at a battlefield. (Ignore its Power cost.)"
 *
 * Q: How does Get Excited! work exactly, and what is the damage based on?
 * A: You declare the damaged unit as you PLAY it. It does nothing until it resolves; on resolution you discard a
 *    card and the damage equals that discarded card's ENERGY cost (its Power cost is ignored). It is an Action, so
 *    it can be played in any showdown — including the non-combat showdown a unit opens by moving to an empty
 *    battlefield, i.e. before that battlefield is scored.
 * Rules: 355.8 (targets chosen at play time), 359.2 (the amount is read on resolution), 206 (Energy cost of a
 *        card), 347 (Action speed = your turn or any showdown), 348.2.a (a non-combat showdown closes into scoring).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GET_EXCITED = "ogn-008-298";
const FAT = { cardType: "unit", energyCost: 4, might: 4, name: "Fat Recruit" } as const;
const CHEAP = { cardType: "spell", energyCost: 0, name: "Free Trick", timing: "action" } as const;

/** P1's turn 3 with exactly [2][fury]. P2 holds bf1 with a 9-Might Colossus; bf2 is open. P1 has a Striker in base. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 9, name: "Colossus" }, "colossus")
    .unit(P2, "base", { might: 9, name: "Homebody" }, "homebody")
    .unit(P1, "base", { might: 3, name: "Striker" }, "striker")
    .hand(P1, GET_EXCITED, "ge")
    .hand(P1, FAT, "fat")
    .hand(P1, CHEAP, "cheap");
}

/** Resolve the open chain by passing priority for whoever is asked. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
}

describe("Ruling c79fff6eed49907b — Get Excited! names its victim on the play and deals the discarded card's Energy cost", () => {
  test("the damaged unit is declared as it is played: it rides on the chain item and nothing has happened yet", async () => {
    const game = await board().build();
    // "a unit at a battlefield": only the Colossus qualifies — units in a base are not offered.
    const opts = JSON.stringify(game.p1.option("cast", "ge")?.fields);
    expect(opts).toContain("colossus");
    expect(opts).not.toContain("homebody");
    await game.p1.cast("ge", { targets: "colossus" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ge", targets: ["colossus"] })]);
    expect(game.state("colossus").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("on resolution P1 is asked which card to discard, and a 4-cost discard deals exactly 4", async () => {
    const game = await board().build();
    await game.p1.cast("ge", { targets: "colossus" });
    await resolveChain(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("fat");
    await game.settle();
    expect(game.zoneOf("fat")).toBe("trash");
    expect(game.state("colossus").damage).toBe(4);
    expect(game.zoneOf("ge")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the damage is the DISCARDED card's Energy cost, not Get Excited!'s: discarding a 0-cost card deals 0", async () => {
    const game = await board().build();
    await game.p1.cast("ge", { targets: "colossus" });
    await resolveChain(game);
    await game.p1.pick("cheap");
    await game.settle();
    expect(game.zoneOf("cheap")).toBe("trash");
    expect(game.state("colossus").damage).toBe(0);
  });

  test("it is playable in a NON-combat showdown: P1's Striker walks onto the empty bf2 and Get Excited! goes off before bf2 is scored", async () => {
    const game = await board().points(P1, 1).build();
    await game.p1.move("striker", "bf2");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf2" });
    expect(game.p1.points()).toBe(1); // nothing scored yet
    expect(game.p1.can("cast", "ge")).toBe(true);
    await game.p1.cast("ge", { targets: "colossus" });
    await resolveChain(game);
    await game.p1.pick("fat");
    await game.settle();
    expect(game.state("colossus").damage).toBe(4);
    // …and only afterwards does the non-combat showdown close and bf2 score.
    expect(game.gameState.battlefields.bf2).toMatchObject({ controller: P1 });
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
