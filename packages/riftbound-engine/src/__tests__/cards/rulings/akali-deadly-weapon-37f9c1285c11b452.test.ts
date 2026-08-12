/**
 * Ruling 37f9c1285c11b452 — Akali, Deadly Weapon (VEN-021 → ven-021-166) · Champion Unit · Fury · [3] · 3 Might
 *     "When I move, you may deal 1 to a unit at a battlefield I moved to or from. …"
 *   × Void Seeker (ogn-024-298) · [Action] "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Stupefy (ogn-095-298) · [Reaction] "Give a unit -1 [Might] this turn… Draw 1."
 *
 * Q: Does Akali's move trigger open a window for the defender to play [Action] cards before the showdown?
 * A: No. The move completes, Akali's trigger goes straight on the Chain — a Closed State — so only
 *    [Reaction] cards are playable while it sits there. When the chain empties the Showdown is staged
 *    immediately, with no Open State in between. The defender's first [Action] window is inside the
 *    showdown, and only after Akali's controller (who applied Contested, so holds Focus first) passes.
 * Rules: 383.3 (a trigger goes on the chain at once), 310/338 (a chain = Closed State; [Action] needs an
 *        Open State), 344/345 (staged showdown opens on an empty chain; the contesting player has Focus).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKALI = "ven-021-166";
const VOID_SEEKER = "ogn-024-298"; // [Action]
const STUPEFY = "ogn-095-298"; // [Reaction]

/** P1's turn. Akali ready in P1's base; P2 holds bf1 with a 4-Might Guard and can pay for either spell. */
function board() {
  return scenario()
    .resources(P2, { energy: 4, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", AKALI, "akali")
    .hand(P2, VOID_SEEKER, "seeker")
    .hand(P2, STUPEFY, "stupefy");
}

/** Akali moves into bf1; P1 opts into her trigger and aims it at the Guard. Stops with the trigger on the chain. */
async function akaliMoved(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("akali", "bf1");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("guard");
  }
  return game;
}

describe("Ruling 37f9c1285c11b452 — Akali's move trigger is a Closed State: no [Action] window before the showdown", () => {
  test("the move stages the showdown and puts Akali's trigger on the chain at once — nobody has an Open State", async () => {
    const game = await akaliMoved();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "akali", controller: P1, triggered: true })]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("while the trigger is on the chain the defender may play a [Reaction] but NOT an [Action]", async () => {
    const game = await akaliMoved();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "seeker")).toBe(false); // Void Seeker is an [Action]
    expect(game.p2.can("cast", "stupefy")).toBe(true); // Reactions are fine
    const attempt = await game.p2.try((p) => p.cast("seeker", { targets: "akali" }));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("seeker")).toBe("hand");
  });

  test("when the chain empties the showdown is staged immediately — no Open State in between; Focus goes to Akali's controller first, and the defender still cannot act", async () => {
    const game = await akaliMoved();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Akali's trigger resolves (1 to the Guard)
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p2.decision()).toBeNull(); // the defender is not the acting seat
  });

  test("the defender's first [Action] window comes only after the attacker passes Focus inside the showdown", async () => {
    const game = await akaliMoved();
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "seeker")).toBe(true); // NOW the [Action] is legal
    await game.p2.cast("seeker", { targets: "akali" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker"]);
    await game.settle();
    expect(game.zoneOf("akali")).toBe("trash"); // 4 damage on a 3-Might champion
    expect(game.violations()).toEqual([]);
  });
});
