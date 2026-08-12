/**
 * Ruling 1c0ce6ff7ce1bc54 — Irresistible Faefolk (UNL-112 → unl-112-219) · Body unit · [2] · 1 Might
 *   "When I move to a battlefield, you may move an enemy unit to that battlefield."
 *
 * Q: Faefolk moves to an EMPTY, uncontrolled battlefield and drags an enemy unit there. Who is the attacker?
 * A: You are. Contested is applied by YOUR move (that is what grants the Attacker designation); the trigger
 *    only resolves afterwards, so the dragged enemy unit is the Defender even though your ability moved it.
 * Rules: 459.2.b (designations follow who applied Contested first), 383 (the trigger resolves after the move).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FAEFOLK = "unl-112-219";

/** P1's turn. bf1 is empty and uncontrolled. P1: Faefolk in base. P2: a 1-Might Scout sitting in their base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", FAEFOLK, "faefolk")
    .unit(P2, "base", { might: 1, name: "Scout" }, "scout");
}

/** 1. Faefolk moves to the empty battlefield. 2–3. Its trigger is accepted and drags the Scout there. */
async function moveAndDrag(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("faefolk", "bf1");
  // 1. The MOVE applied Contested — before the trigger has done anything.
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "faefolk" } });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("scout");
  }
  return game;
}

describe("Ruling 1c0ce6ff7ce1bc54 — Faefolk into an empty battlefield: the Faefolk's controller is the ATTACKER", () => {
  test("1. moving to the uncontrolled battlefield applies Contested for P1; the trigger is only queued, the Scout is still in P2's base", async () => {
    const game = await board().build();
    await game.p1.move("faefolk", "bf1");
    expect(game.locationOf("faefolk")).toBe("bf1");
    expect(game.locationOf("scout")).toBe("base");
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P1);
  });

  test("2. the ability is P1's optional trigger and P1 chooses the enemy unit — only enemy units are offered", async () => {
    const game = await board().build();
    await game.p1.move("faefolk", "bf1");
    const yn = game.decision();
    expect(yn).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.seat).toBe(P1);
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["scout"]);
      await game.p1.pick("scout");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["faefolk"]);
  });

  test("3–4. ruling: once the trigger resolves the Scout is at bf1 — Faefolk is the ATTACKER, the dragged Scout is the DEFENDER", async () => {
    const game = await moveAndDrag();
    // Resolve just the trigger — stop before the combat itself runs.
    while (game.chain().length > 0) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("scout")).toBe("bf1");
    expect(game.state("faefolk").combatRole).toBe("attacker");
    expect(game.state("scout").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control: declining the trigger leaves the Scout at home — P1 simply contests an empty battlefield, no combat", async () => {
    const game = await board().build();
    await game.p1.move("faefolk", "bf1");
    await game.p1.no();
    await game.settle();
    expect(game.locationOf("scout")).toBe("base");
    expect(game.state("scout").combatRole).toBeNull();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // solo occupant conquers
  });
});
