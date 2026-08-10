/**
 * Ruling d174453c05ff53b9 — Teemo, Scout (OGN-197 → ogn-197-298) · 1 Might · [Hidden] "When you play me, give me +3 [Might] this turn."
 *   × Convergent Mutation (OGN-108 → ogn-108-298) · Reaction [2][mind] "Choose a friendly unit. This turn, increase its Might to the
 *     Might of another friendly unit."   × Ravenbloom Student (OGN-103 → ogn-103-298) · 2 Might "When you play a spell, give me +1
 *     [Might] this turn."   × Discipline (OGN-058 → ogn-058-298) · Reaction [2] "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: Discipline is on the chain, Teemo is played from Hidden (+3 trigger), then Mutation on Ravenbloom referencing Teemo — what
 *    resolves when, and when does Ravenbloom get its +1?
 * A: Depends when Mutation is played. If AFTER Teemo's trigger resolves (Teemo 4): Mutation → Ravenbloom 4, then Ravenbloom's own
 *    spell trigger → 5, then Discipline resolves (Yi +2, draw 1). If Mutation is played BEFORE Teemo's trigger resolves, it resolves
 *    first while Teemo is still 1. Players may add to the chain after each item resolves.
 * Rules: 336–340 (LIFO; a priority round after each resolution), 419.4.a (spell triggers after the spell resolves), 477.3.b.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_SCOUT = "ogn-197-298";
const CONVERGENT_MUTATION = "ogn-108-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const DISCIPLINE = "ogn-058-298";

/** P1's turn with [4] + 1 mind. Yi (3) holds bf1 with Teemo facedown there; Ravenbloom Student (2) in base; Discipline + Mutation in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Yi" }, "yi")
    .unit(P1, "base", RAVENBLOOM_STUDENT, "raven")
    .facedown(P1, "bf1", TEEMO_SCOUT, "teemo")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P1, CONVERGENT_MUTATION, "mutation")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander");
}

const ids = (game: Game) => game.chain().map((c) => c.cardId);

/** Discipline (→ Yi) goes on the chain, then Teemo is played from Hidden: the unit lands at bf1 and its +3 trigger is on top. */
async function disciplineThenTeemo(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("discipline", { targets: "yi" });
  expect(ids(game)).toEqual(["discipline"]);
  expect(game.p1.can("reveal", "teemo")).toBe(true);
  await game.p1.reveal("teemo");
  expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
  expect(game.state("teemo").might).toBe(1); // trigger not resolved yet
  expect(ids(game)).toEqual(["discipline", "teemo"]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 (top item's owner) may add more
  return game;
}

describe("Ruling d174453c05ff53b9 — Teemo from Hidden, Convergent Mutation and Ravenbloom Student on top of Discipline", () => {
  test("Mutation played AFTER Teemo's trigger resolves: Teemo 4 → Mutation: Ravenbloom 4 → Ravenbloom's trigger: 5 → Discipline: Yi +2, draw 1", async () => {
    const game = await disciplineThenTeemo();
    // Let only Teemo's trigger resolve.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(ids(game)).toEqual(["discipline"]);
    expect(game.state("teemo").might).toBe(4);
    // A new priority round: P1 can now add Mutation (Ravenbloom ← Teemo's 4).
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    const roles = game.p1.option("cast", "mutation")?.fields.find((f) => f.name === "targets")?.roles ?? [];
    expect(roles).toHaveLength(2);
    await game.p1.cast("mutation", { targets: ["raven", "teemo"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(ids(game)).toEqual(["discipline", "mutation"]);
    // Mutation resolves → Ravenbloom 4; its "when you play a spell" trigger goes on the chain above Discipline.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("raven").might).toBe(4);
    expect(ids(game)).toEqual(["discipline", "raven"]);
    // Ravenbloom's trigger resolves → 5. Discipline still waiting underneath.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("raven").might).toBe(5);
    expect(ids(game)).toEqual(["discipline"]);
    expect(game.state("yi").might).toBe(3);
    // Discipline resolves last: Yi +2 and P1 draws 1.
    const hand = game.p1.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("yi").might).toBe(5);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("teemo").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });

  test("Mutation played IMMEDIATELY (before Teemo's trigger resolves): it resolves first while Teemo is still 1 — Ravenbloom is not raised by it (only its own +1 trigger), and Teemo becomes 4 afterwards", async () => {
    const game = await disciplineThenTeemo();
    await game.p1.cast("mutation", { targets: ["raven", "teemo"] });
    expect(ids(game)).toEqual(["discipline", "teemo", "mutation"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Mutation resolves with Teemo at 1
    expect(game.zoneOf("mutation")).toBe("trash");
    expect(game.state("teemo").might).toBe(1);
    expect(game.state("raven").might).toBe(2); // "increase to 1" cannot lower / does nothing (477.3.b)
    // Ravenbloom's spell trigger sits on top now, then Teemo's, then Discipline.
    expect(ids(game)).toEqual(["discipline", "teemo", "raven"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("raven").might).toBe(3);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("teemo").might).toBe(4); // too late for the already-resolved Mutation
    expect(ids(game)).toEqual(["discipline"]);
    await game.settle();
    expect(game.state("yi").might).toBe(5);
    expect(game.state("raven").might).toBeLessThan(5); // never matched Teemo's 4
  });
});
