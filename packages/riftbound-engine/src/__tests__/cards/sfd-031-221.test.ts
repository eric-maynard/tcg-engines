/**
 * Desert's Call — sfd-031-221 · Spell · Calm · 2 energy
 *
 *   [Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)
 *   Play a 2 [Might] Sand Soldier unit token.
 *
 * Rules: 820.1.d.1 (Repeat — this exact card is the example: paying [2] more executes "play a
 * Sand Soldier" twice; still one spell on the chain, 820.3.a), 187.3 (Sand Soldier = domainless
 * 2-Might unit token), 179 (tokens are played following the normal play steps → a played unit may
 * enter the base or a battlefield you control), 155/159.2.a.1 (no [Action]/[Reaction] → standard
 * timing: own turn, open state only).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-031-221";

function board(energy: number) {
  return scenario().resources(P1, { energy }).hand(P1, CARD, "call");
}

const soldiers = (game: Game) =>
  game
    .findAll({ name: "Sand Soldier", owner: P1 })
    .filter((id) => game.zoneOf(id) === "base" || game.zoneOf(id).startsWith("battlefield-"));

/** Settle, answering any "where does the token enter" prompt with the base. */
async function resolve(game: Game) {
  for (let i = 0; i < 4; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "pick") {
      return;
    }
    await game.p1.pick("base");
  }
}

describe("Desert's Call (sfd-031-221)", () => {
  test("costs 2 energy; plays one 2-Might domainless Sand Soldier unit token under P1's control; spell goes to trash", async () => {
    const game = await board(2).build();
    await game.p1.cast("call");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toHaveLength(1);
    await resolve(game);
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    const s = game.state(made[0] as string);
    expect(s).toMatchObject({ cardType: "unit", controller: P1, might: 2, owner: P1, zone: "base" });
    expect(s.domains).toEqual([]);
    expect(game.zoneOf("call")).toBe("trash");
  });

  test("with a controlled battlefield the token may enter there instead of the base (179 / 349)", async () => {
    const game = await board(2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 3 }, "holder").build();
    await game.p1.cast("call");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" && d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.zoneOf(made[0] as string)).toBe("battlefield-bf1");
  });

  test("not castable with only 1 energy", async () => {
    const game = await board(1).build();
    expect(game.p1.can("cast", "call")).toBe(false);
  });

  test("[Repeat] [2] — paying 4 total should play TWO Sand Soldier tokens from the single spell (820.1.d.1)", async () => {
    // Expected: the create-token instruction executes twice → two Sand Soldiers on the board.
    // Actual: the repeat cost is deducted (energy 0) but only one token ends up on the board.
    const game = await board(4).build();
    await game.p1.cast("call", { repeat: 1 });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toHaveLength(1);
    await resolve(game);
    expect(soldiers(game)).toHaveLength(2);
  });

  test("[Repeat] is optional and must be affordable: with 3 energy only the single cast is legal", async () => {
    const game = await board(3).build();
    const r = await game.p1.try((p) => p.cast("call", { repeat: 1 }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("call")).toBe("hand");
    await game.p1.cast("call");
    expect(game.p1.energy()).toBe(1);
    await resolve(game);
    expect(soldiers(game)).toHaveLength(1);
  });

  test("standard timing (no [Action]/[Reaction]): not castable on the opponent's turn, not even with Focus in a showdown", async () => {
    const game = await board(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "holder")
      .unit(P2, "base", { might: 2 }, "atk")
      .build();
    expect(game.p1.can("cast", "call")).toBe(false);
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "call")).toBe(false);
  });
});
