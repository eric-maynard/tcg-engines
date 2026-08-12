/**
 * Ruling 80cef561fa5ee5e7 — Unforgiven (OGN-259 → ogn-259-298) · Legend (Yasuo)
 *   "[2], [Exhaust]: Move a friendly unit to or from its base."
 *
 * Q: In 2v2 can Yasuo, Unforgiven's ability be used on a teammate's unit?
 * A: Yes — in a team game "friendly" covers your teammate's objects, so the ability may move their unit. But the
 *    zones stay the unit's own: sent "to base" it goes to ITS OWNER's base, never to yours (and it is not shuttled
 *    to and from your base).
 * Rules: 489.8.e / 740.1.a (in team modes "friendly" includes a teammate's objects), 105/191.1 (owner vs controller),
 *        449.2 ("its base" = the moved unit's owner's base).
 *
 * Table: a 2v2 seating (P1+P3 vs P2+P4) with the 489.2 team map seeded onto the built state (the builder has no
 * team knob).
 */
import { describe, expect, test } from "bun:test";
import type { Game, ScenarioBuilder } from "../../../harness";
import { P1, P2, P3, P4, scenario } from "../../../harness";
import { peekCurrentState, replaceCurrentState } from "../../../harness/internal";

const UNFORGIVEN = "ogn-259-298";

/** Seed teams {P1,P3} vs {P2,P4} on a built game. */
async function withTeams(builder: ScenarioBuilder): Promise<Game> {
  const game = await builder.build();
  const st = structuredClone(peekCurrentState(game.engine));
  (st as { teams?: Record<string, number> }).teams = { [P1]: 0, [P2]: 1, [P3]: 0, [P4]: 1 };
  replaceCurrentState(game.engine, st);
  game.engine.getFlowManager()?.syncState(st);
  expect(game.gameState.teams).toEqual({ [P1]: 0, [P2]: 1, [P3]: 0, [P4]: 1 });
  return game;
}

/** P1's turn with exactly [2]. Teammate P3 holds bf1 with "mate"; P1 holds bf2 with "own"; opponent P2 has "foe" in base. */
function board() {
  return scenario({ players: 4 })
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P3 })
    .battlefield("bf2", { controller: P1 })
    .unit(P3, "bf1", { might: 3, name: "Mate" }, "mate")
    .unit(P1, "bf2", { might: 3, name: "Own" }, "own")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .legend(P1, UNFORGIVEN, "yasuo");
}

describe("Ruling 80cef561fa5ee5e7 — Unforgiven may move a teammate's unit, but only to that unit's own base", () => {
  test("ruling: 'a friendly unit' offers the TEAMMATE's unit as well as P1's own — and never the opponent's", async () => {
    const game = await withTeams(board());
    const targets = (game.p1.option("activateAbility:yasuo#0")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toContain("mate");
    expect(targets).toContain("own");
    expect(targets).not.toContain("foe");
  });

  test("ruling: moved to base, the teammate's unit lands in P3's base — NOT in P1's, and its owner/controller are unchanged", async () => {
    const game = await withTeams(board());
    await game.p1.activate("yasuo", 0, { answers: ["mate"] });
    await game.settle();
    expect(game.locationOf("mate")).toBe("base");
    expect(game.state("mate")).toMatchObject({ controller: P3, owner: P3 });
    expect(game.seat(P3).units("base")).toEqual(["mate"]);
    expect(game.p1.units("base")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("consequence: bf1 is emptied by the move, so P3 loses it at the next Open Cleanup", async () => {
    const game = await withTeams(board());
    await game.p1.activate("yasuo", 0, { answers: ["mate"] });
    await game.settle();
    expect(game.seat(P3).units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  test("the other direction works too: the teammate's unit may be moved FROM its own base out to a battlefield", async () => {
    const game = await withTeams(
      scenario({ players: 4 })
        .resources(P1, { energy: 2 })
        .battlefield("bf1", { controller: null })
        .battlefield("bf2", { controller: P1 })
        .unit(P3, "base", { might: 3, name: "Mate" }, "mate")
        .unit(P1, "bf2", { might: 3, name: "Own" }, "own")
        .legend(P1, UNFORGIVEN, "yasuo"),
    );
    await game.p1.activate("yasuo", 0, { answers: ["mate"] });
    await game.settle();
    expect(game.locationOf("mate")).toBe("bf1");
    expect(game.state("mate").controller).toBe(P3);
  });

  test("the ability costs [2] and exhausts the legend", async () => {
    const game = await withTeams(board());
    await game.p1.activate("yasuo", 0, { answers: ["own"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("yasuo").isExhausted).toBe(true);
  });
});
