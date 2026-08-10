/**
 * Ruling bf6852b80c50b8c4 — The Ruination (UNL-180 → unl-180-219) · Action · 9+[order]×3 · "Kill all units."
 *   × Evelynn, Entrancing (UNL-141 → unl-141-219) · 2 Might · "[Hidden] [Backline] When you play me from face down on your turn, you may
 *     move an enemy unit at a different location to my battlefield."
 *
 * Q: Can I reveal a hidden Evelynn at my battlefield after my opponent plays The Ruination and keep control of the battlefield?
 * A: Revealing her in response is legal (a hidden card plays at Reaction speed) and control can't be lost while the chain is active —
 *    but it doesn't help: she enters BEFORE The Ruination resolves (LIFO), so "Kill all units" kills her too. With no units left the
 *    battlefield becomes uncontrolled at the post-chain cleanup. You cannot keep control this way.
 * Rules: 811 (Hidden → Reaction-speed play "here"), 187.4.c (no control loss mid-chain), 340 (LIFO), 461.5 / 323.6 (no units →
 *        uncontrolled at cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_RUINATION = "unl-180-219";
const EVELYNN = "unl-141-219";

/** P2's turn 3 with 9 + [order]×3. P1 controls bf1 with a Keeper (2) and has Evelynn face down there (hidden earlier). P2 has a unit too. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 9, power: { order: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Keeper" }, "keeper")
    .facedown(P1, "bf1", EVELYNN, "eve")
    .unit(P2, "base", { might: 3, name: "Theirs" }, "theirs")
    .hand(P2, THE_RUINATION, "ruin");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;

/** P2 casts The Ruination and passes; P1 flips Evelynn at bf1 in response. */
async function ruinationThenEvelynn(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("ruin");
  expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ruin"]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "eve")).toBe(true); // legal: hidden → Reaction speed, even in this Closed state on P2's turn
  await game.p1.reveal("eve");
  if (game.decision()?.kind === "yes-no" && game.decision()?.seat === P1) {
    await game.p1.no();
  }
  return game;
}

describe("Ruling bf6852b80c50b8c4 — revealing hidden Evelynn into The Ruination is legal but cannot save the battlefield", () => {
  test("the reveal is legal and Evelynn ENTERS bf1 at once (a permanent), while The Ruination is still on the chain; mid-chain P1 still controls bf1", async () => {
    const game = await ruinationThenEvelynn();
    expect(game.zoneOf("eve")).toBe("battlefield-bf1");
    expect(game.p1.units("bf1").toSorted()).toEqual(["eve", "keeper"]);
    expect(game.chain().some((c) => c.cardId === "ruin")).toBe(true);
    expect(bf1(game)?.controller).toBe(P1); // 187.4.c — no control change while the chain is active
    // It is P2's turn: Evelynn's "on your turn" move trigger does not apply; nothing of hers targets anything.
    expect(game.chain().every((c) => c.cardId !== "eve" || (c.targets ?? []).length === 0)).toBe(true);
  });

  test("The Ruination then resolves and kills ALL units — the Keeper, P2's unit AND the freshly revealed Evelynn", async () => {
    const game = await ruinationThenEvelynn();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ruin")).toBe("trash");
    expect(game.zoneOf("keeper")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.zoneOf("eve")).toBe("trash");
    expect(game.p1.units()).toEqual([]);
  });

  test("conclusion: with no units left there, bf1 is UNCONTROLLED after the post-chain cleanup — P1 did not keep it (and P2 didn't take it either)", async () => {
    const game = await ruinationThenEvelynn();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(bf1(game)?.controller ?? null).toBeNull();
    expect(game.p1.battlefields({ controlled: true })).toEqual([]);
    expect(game.p2.battlefields({ controlled: true })).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: NOT revealing doesn't keep the battlefield either — the Keeper dies, control lapses, and the still-hidden Evelynn is trashed with the lost battlefield (811)", async () => {
    const game = await board().build();
    await game.p2.cast("ruin");
    await game.settle();
    expect(game.zoneOf("keeper")).toBe("trash");
    expect(bf1(game)?.controller ?? null).toBeNull();
    expect(game.zoneOf("eve")).toBe("trash");
  });
});
