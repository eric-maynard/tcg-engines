/**
 * Ruling 8e3293eedacf5459 — (no specific card) one Standard Move can carry several units at once,
 *   from different origins, and the showdown waits for all of them.
 *   Exercised with inline filler units (one plain, one with [Ganking]) and an enemy-held battlefield.
 *
 * Q: Can I move a ready unit from base to the opponent's battlefield and, at the same time, gank a unit
 *    in from another battlefield — or does the showdown start first and strand the ganker?
 * A: You can move any number of eligible units simultaneously to the same destination, from any mix of
 *    origins, exhausting each of them. The showdown only begins after ALL the movement is done.
 * Rules: 144 / 144.2 (Standard Move: exhaust each mover), 144.3 (a Standard Move can move several
 *    units to one destination), 190.3.a (arrival applies Contested), 323.8/323.12 (the showdown is
 *    staged at the cleanup that follows and begins in a Neutral Open State), 823 ([Ganking]).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** P1: a plain unit in base, a [Ganking] unit and a plain unit at bf1. P2 holds bf2 with a defender. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Homeguard" }, "home")
    .unit(P1, "bf1", { keywords: ["Ganking"], might: 4, name: "Ganker" }, "ganker")
    .unit(P1, "bf1", { might: 2, name: "Rooted" }, "rooted")
    .unit(P2, "bf2", { might: 9, name: "Defender" }, "defender");
}

async function bothMoved(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["home", "ganker"], "bf2");
  return game;
}

describe("Ruling 8e3293eedacf5459 — a single move can bring units from base AND another battlefield", () => {
  test("both units arrive at the same destination in one action", async () => {
    const game = await bothMoved();
    expect(game.locationOf("home")).toBe("bf2");
    expect(game.locationOf("ganker")).toBe("bf2");
    expect(game.p1.units("bf2").slice().sort()).toEqual(["ganker", "home"]);
    expect(game.p1.units("bf1")).toEqual(["rooted"]);
  });

  test("each mover pays the cost: both are exhausted, the one that stayed behind is not", async () => {
    const game = await bothMoved();
    expect(game.state("home").isExhausted).toBe(true);
    expect(game.state("ganker").isExhausted).toBe(true);
    expect(game.state("rooted").isExhausted).toBe(false);
  });

  test("the showdown only starts after ALL the movement — both movers are attackers in it", async () => {
    const game = await bothMoved();
    const sd = (game.gameState.interaction?.showdownStack ?? []).at(-1);
    expect(sd).toMatchObject({ battlefieldId: "bf2", isCombatShowdown: true });
    expect(game.state("home").combatRole).toBe("attacker");
    expect(game.state("ganker").combatRole).toBe("attacker"); // NOT stranded at bf1
    expect(game.state("defender").combatRole).toBe("defender");
  });

  test("[Ganking] is what lets the battlefield→battlefield leg happen: the plain unit at bf1 cannot come", async () => {
    const game = await board().build();
    const denied = await game.p1.try((p) => p.move(["home", "rooted"], "bf2"));
    expect(denied.ok).toBe(false);
    expect(game.locationOf("rooted")).toBe("bf1");
    expect(game.locationOf("home")).toBe("base");
  });

  test("the combined attack then resolves as one combat (7 Might of attackers vs the 9-Might defender)", async () => {
    const game = await bothMoved();
    await game.settle();
    expect(game.zoneOf("defender")).toBe("battlefield-bf2"); // 3 + 4 is not lethal on 9
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
