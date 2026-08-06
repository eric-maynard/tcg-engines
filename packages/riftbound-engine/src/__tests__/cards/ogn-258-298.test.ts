/**
 * Dragon's Rage — ogn-258-298 · Spell · Calm/Body · 4 energy + 1 [calm/body] · (no timing keyword)
 *
 *   Move an enemy unit. Then do this: Choose another enemy unit at its destination. They deal
 *   damage equal to their Mights to each other.
 *
 * Rules: 310.1.a (no [Action]/[Reaction]: playable only on your turn in a Neutral Open State —
 * not in showdowns, not on the opponent's turn), 445ff (a Move changes the unit's location; the
 * spell's controller picks the destination), 387 ("do this:" = reflexive trigger — a new chain
 * item whose choice ("another enemy unit at its destination") is made when it is created, i.e.
 * after the move), damage is dealt by the two units to each other (as Challenge). Only ENEMY
 * units are ever chosen — no friendly unit is involved.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-258-298";

function board(energy = 4, power: Record<string, number> = { calm: 1 }) {
  return scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Mover" }, "mover")
    .unit(P2, "bf2", { might: 5, name: "Anvil" }, "anvil")
    .unit(P1, "base", { might: 2, name: "Friend" }, "friend")
    .hand(P1, CARD, "dr");
}

describe("Dragon's Rage (ogn-258-298)", () => {
  test("cost: 4 energy + 1 power payable with calm OR body (hybrid pip); not with 3 energy, no power, or an off-domain power", async () => {
    expect((await board(4, { calm: 1 }).build()).p1.can("cast", "dr")).toBe(true);
    expect((await board(4, { body: 1 }).build()).p1.can("cast", "dr")).toBe(true);
    expect((await board(3, { calm: 1 }).build()).p1.can("cast", "dr")).toBe(false);
    expect((await board(4, {}).build()).p1.can("cast", "dr")).toBe(false);
    expect((await board(4, { fury: 1 }).build()).p1.can("cast", "dr")).toBe(false);
  });

  test("timing: no [Action]/[Reaction] — not castable on the opponent's turn, nor with focus inside a showdown (either player's turn)", async () => {
    const quiet = await board().active(P2).build();
    expect(quiet.p1.can("cast", "dr")).toBe(false);
    const theirShowdown = await scenario()
      .active(P2)
      .resources(P1, { energy: 4, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "friend")
      .unit(P2, "base", { might: 3 }, "mover")
      .unit(P2, "base", { might: 5 }, "anvil")
      .hand(P1, CARD, "dr")
      .build();
    await theirShowdown.p2.move("mover", "bf1");
    await theirShowdown.p2.passFocus();
    expect((theirShowdown.decision() as ActionDecision).context).toBe("showdown");
    expect(theirShowdown.p1.can("cast", "dr")).toBe(false);
    const mine = await board().build();
    await mine.p1.move("friend", "bf1"); // P1 attacks → showdown, P1 has focus
    expect((mine.decision() as ActionDecision)).toMatchObject({ context: "showdown", seat: P1 });
    expect(mine.p1.can("cast", "dr")).toBe(false);
  });

  test("the only play-time target is ONE ENEMY unit (friendly units are never a choice)", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "dr")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["mover"], ["anvil"]]));
    expect(targets).toHaveLength(2);
    const noFriendly = await scenario()
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3 }, "mover")
      .hand(P1, CARD, "dr")
      .build();
    expect(noFriendly.p1.can("cast", "dr")).toBe(true);
  });

  test("moves the enemy unit to the chosen destination, then it and ANOTHER enemy unit there deal their Mights to each other", async () => {
    const game = await board().build();
    // Destination / second enemy are pre-queued as P1's answers for whenever the engine asks.
    await game.p1.cast("dr", { answers: ["bf2", "anvil"], targets: "mover" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("mover")).toBe("trash");
    expect(game.locationOf("anvil")).toBe("bf2");
    expect(game.state("anvil").damage).toBe(3);
    expect(game.state("friend").damage).toBe(0);
    expect(game.zoneOf("dr")).toBe("trash");
  });

  test("with no OTHER enemy unit at the destination the move still happens and no damage is dealt", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 3 }, "mover")
      .hand(P1, CARD, "dr")
      .build();
    await game.p1.cast("dr", { answers: ["bf2"], targets: "mover" });
    await game.settle();
    expect(game.locationOf("mover")).toBe("bf2");
    expect(game.state("mover").damage).toBe(0);
    expect(game.zoneOf("dr")).toBe("trash");
  });
});
