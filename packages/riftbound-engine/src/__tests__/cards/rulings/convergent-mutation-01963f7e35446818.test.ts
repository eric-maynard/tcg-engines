/**
 * Ruling 01963f7e35446818 — Convergent Mutation (OGN-108 → ogn-108-298) · [2][mind] · [Reaction]
 *   "Choose a friendly unit. This turn, increase its Might to the Might of another friendly unit."
 *   × Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · "At the end of your turn, reveal cards from the top of your Main Deck
 *   until you reveal a unit and banish it. Play it, ignoring its cost, and recycle the rest."
 *
 * Q: Does the Convergent Mutation effect end when Aurora is about to resolve?
 * A: No. Aurora's "at the end of your turn" trigger happens (and resolves) BEFORE "this turn" effects cease.
 * Rules: 317.1 (end-of-turn triggers, Ending Step) precede 317.2.c (Expiration Step: "this turn" effects end).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CONVERGENT_MUTATION = "ogn-108-298";
const DAZZLING_AURORA = "ogn-160-298";
const SKULKER = "ogn-175-298";

/** P1's turn. Aurora in P1's base; Small (2) and Big (6) in base; Convergent Mutation in hand with [2][mind]; deck top = a unit. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .gear(P1, DAZZLING_AURORA, "aurora")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Small" }, "small")
    .unit(P1, "base", { might: 6, name: "Big" }, "big")
    .hand(P1, CONVERGENT_MUTATION, "cm")
    .deck(P1, [SKULKER, SKULKER, SKULKER], ["found", "d2", "d3"]);
}

describe("Ruling 01963f7e35446818 — Convergent Mutation still applies while Aurora's end-of-turn trigger resolves", () => {
  test("Convergent Mutation raises Small to Big's Might (6) this turn", async () => {
    const game = await board().build();
    await game.p1.cast("cm", { targets: ["small", "big"] });
    await game.settle();
    expect(game.zoneOf("cm")).toBe("trash");
    expect(game.state("small").might).toBe(6);
  });

  test("P1 ends the turn: Aurora's trigger is on the chain in the Ending Step and Small is STILL 6 while it waits and while it resolves; only afterwards (Expiration Step) does Small drop back to 2", async () => {
    const game = await board().build();
    await game.p1.cast("cm", { targets: ["small", "big"] });
    await game.settle();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
    expect(game.state("small").might).toBe(6); // "this turn" has not ended yet
    // Resolve Aurora (both pass; answer its play-destination prompt if one is asked).
    for (let i = 0; i < 8 && game.turnPlayer() === P1; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        expect(game.state("small").might).toBe(6); // still mutated throughout Aurora's window
        await game.seat(d.seat).passPriority();
      } else if (d?.kind === "pick" && d.seat === P1) {
        expect(game.state("small").might).toBe(6);
        await game.p1.pick(d.options[0]!.key);
      } else {
        break;
      }
    }
    await game.settle();
    // Aurora did its thing during P1's turn …
    expect(game.zoneOf("found")).toBe("base");
    expect(game.p1.units("base")).toContain("found");
    // … and only with the turn over has the mutation expired.
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("small").might).toBe(2);
    expect(game.trace().expiration.length).toBeGreaterThanOrEqual(1);
    expect(game.violations()).toEqual([]);
  });
});
