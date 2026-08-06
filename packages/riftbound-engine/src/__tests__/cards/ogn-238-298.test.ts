/**
 * Leona, Determined — ogn-238-298 · Champion Unit (Leona) · Order · 4 energy + [order] · 4 Might
 *
 *   [Shield] (+1 [Might] while I'm a defender.)
 *   When I attack, stun an enemy unit here. (It doesn't deal combat damage this turn.)
 *
 * Rules: 814 (Shield), 423 (Stun: a choice per 355.5.a; stunned units contribute no Might to
 * combat damage, 423.1.b; the status clears at end of turn, 423.1.a.2).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-238-298";

function attackBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
    .unit(P2, "bf1", { might: 1, name: "Gnat" }, "gnat")
    .unit(P2, "bf2", { might: 2, name: "Elsewhere" }, "elsewhere")
    .unit(P1, "base", CARD, "leona");
}

/** Leona attacks bf1; drive the trigger, picking `target` whenever asked, and stop in the showdown. */
async function attackAndStun(game: Game, target: string): Promise<void> {
  await game.p1.move("leona", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leona", triggered: true })]);
  for (let i = 0; i < 6 && (game.chain().length > 0 || game.decision()?.kind === "pick"); i++) {
    const d = game.decision();
    if (d?.kind === "pick") {
      await game.p1.pick(target);
    } else {
      await game.acting().passPriority();
    }
  }
}

describe("Leona, Determined (ogn-238-298)", () => {
  test("costs 4 energy + 1 order; 4 Might with Shield; unaffordable without the order power", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { order: 1 } }).hand(P1, CARD, "leona").build();
    await game.p1.play("leona");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("leona")).toBe("base");
    expect(game.state("leona").might).toBe(4);
    expect(game.state("leona").keywords).toContain("Shield");
    const noOrder = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "leona").build();
    expect(noOrder.p1.can("play", "leona")).toBe(false);
  });

  test("Shield: defending against a 4-Might attacker she survives (4 < 5) and kills it; no attack trigger fires", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "leona")
      .unit(P2, "base", { might: 4 }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("leona").combatRole).toBe("defender");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("leona")).toBe("battlefield-bf1");
    expect(game.state("raider").isStunned ?? false).toBe(false);
  });

  test("When I attack: only enemy units HERE are offered; the chosen one becomes stunned before combat damage", async () => {
    const game = await attackBoard().build();
    await game.p1.move("leona", "bf1");
    let d = game.decision();
    for (let i = 0; i < 6 && d?.kind !== "pick"; i++) {
      await game.acting().passPriority();
      d = game.decision();
    }
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(keys).toEqual(["gnat", "wall"]);
    await game.p1.pick("wall");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("wall").isStunned).toBe(true);
    expect(game.state("gnat").isStunned).toBe(false);
    expect(game.state("elsewhere").isStunned).toBe(false);
  });

  test("a stunned defender deals no combat damage (423.1.b) — Leona (4) into the stunned 6-Might wall: both survive", async () => {
    // Expected: wall is stunned by the trigger, so it contributes 0 combat damage; Leona lives, wall takes 4 < 6.
    // Actual: the stun is recorded (isStunned true) but combat still has the wall deal 6, killing Leona.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "leona")
      .build();
    await attackAndStun(game, "wall");
    await game.settle();
    expect(game.state("wall").damage).toBe(0); // 4 < 6, damage clears after combat
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.zoneOf("leona")).not.toBe("trash"); // took 0 instead of 6
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("the stun wears off at end of turn (423.1.a.2)", async () => {
    // Expected: after P1's turn ends the wall is no longer stunned.
    // Actual: the stunned status applied by the trigger persists into P2's turn.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "leona")
      .build();
    await attackAndStun(game, "wall");
    await game.settle();
    expect(game.state("wall").isStunned).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("wall").isStunned).toBe(false);
  });
});
