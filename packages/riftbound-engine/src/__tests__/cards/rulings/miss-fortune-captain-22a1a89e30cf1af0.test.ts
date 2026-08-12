/**
 * Ruling 22a1a89e30cf1af0 — Miss Fortune, Captain (OGN-162 → ogn-162-298) · 5 Might · [Accelerate][Ganking]
 *     "The first time I move each turn, you may ready something else that's exhausted."
 *
 * Q: When Miss Fortune moves into an occupied battlefield for the first time, can the unit she readies be
 *    moved into that same battlefield during the resulting showdown?
 * A: No. Readying is not moving, and a Standard Move is only legal in an Open State on your turn — never
 *    inside a showdown. The readied unit can move only after the showdown has resolved.
 * Rules: 144 (Standard Move: an Open-State turn action, cost = exhaust), 344/347 (inside a showdown only
 *        legally-timed spells and abilities may be played), 460–466 (the showdown/combat runs to its end).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MF_CAPTAIN = "ogn-162-298";

/** P1's turn. P2 holds bf1 with a 2-Might Poro. P1: Miss Fortune ready in base plus an EXHAUSTED Sleepy. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Poro" }, "poro")
    .unit(P1, "base", MF_CAPTAIN, "mf")
    .unit(P1, "base", { might: 3, name: "Sleepy" }, "sleepy", { exhausted: true });
}

/** MF moves into bf1; P1 takes the "you may ready something else" offer on Sleepy and the trigger resolves. */
async function moveAndReady(game: Game): Promise<void> {
  await game.p1.move("mf", "bf1");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "mf" } });
  await game.p1.yes();
  // The exhausted Sleepy is the only candidate, so the engine binds it without asking.
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("sleepy");
  }
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.state("sleepy").isReady).toBe(true);
}

describe("Ruling 22a1a89e30cf1af0 — the unit Miss Fortune readies cannot join the showdown she opened", () => {
  test("the readied Sleepy is ready in base while the combat showdown at bf1 is live — but moving it there is illegal", async () => {
    const game = await board().build();
    await moveAndReady(game);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.locationOf("sleepy")).toBe("base");
    expect(game.state("sleepy")).toMatchObject({ combatRole: null, isReady: true });
    expect(game.p1.legal().some((o) => o.verb === "move")).toBe(false); // no Standard Move exists inside a showdown
    const r = await game.p1.try((p) => p.move("sleepy", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.p1.units("bf1")).toEqual(["mf"]); // Miss Fortune fights alone
  });

  test("after the showdown resolves (still P1's turn, Open State) the standard move IS legal and Sleepy walks in", async () => {
    const game = await board().build();
    await moveAndReady(game);
    await game.settle(); // combat: MF 5 vs Poro 2
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.legal().some((o) => o.verb === "move")).toBe(true);
    await game.p1.move("sleepy", "bf1");
    await game.settle();
    expect(game.locationOf("sleepy")).toBe("bf1");
    expect(game.state("sleepy").isExhausted).toBe(true); // the move's own cost
    expect(game.violations()).toEqual([]);
  });

  test("units that were already ready before she moved may of course be moved in with her, in the same Standard Move", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Poro" }, "poro")
      .unit(P1, "base", MF_CAPTAIN, "mf")
      .unit(P1, "base", { might: 3, name: "Awake" }, "awake")
      .build();
    await game.p1.move(["mf", "awake"], "bf1");
    expect(game.p1.units("bf1").toSorted()).toEqual(["awake", "mf"]);
  });
});
