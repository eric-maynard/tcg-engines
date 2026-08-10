/**
 * Ruling 09d954da2382c235 — Here to Help (SFD-111 → sfd-111-221) · Spell · Body · [2][body] · [Hidden] [Action]
 *     "You may play a unit from hand to a battlefield you control, reducing its cost by [3]."
 *
 * Q: I have a unit at a battlefield with Here to Help hidden there. The opponent moves in and starts a showdown. Am I still in
 *    control of the battlefield, and can I reveal Here to Help to play another unit?
 * A: Yes and yes. The battlefield becomes Contested but you remain its controller for the whole showdown (control can't change
 *    mid-combat). A hidden card has [Reaction], so once you may act you can flip Here to Help and play a unit — and, played from
 *    hidden, that unit must go to THIS battlefield.
 * Rules: 190.3/190.4.b (Contested; control frozen during a showdown), 811.1 (Hidden ⇒ Reaction, [0], "here"), 347.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HERE_TO_HELP = "sfd-111-221";

/**
 * P2's turn 3. P1 controls bfA (Warden 3, Here to Help facedown) and bfB (Sentry 2). P2's Raider (5) attacks bfA.
 * P1 holds a 4-cost Reinforcement (4 Might) with exactly [1] — only affordable through Here to Help's −[3].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 1 })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfA", { might: 3, name: "Warden" }, "warden")
    .unit(P1, "bfB", { might: 2, name: "Sentry" }, "sentry")
    .facedown(P1, "bfA", HERE_TO_HELP, "help")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, { cardType: "unit", energyCost: 4, might: 4, name: "Reinforcement" }, "reinf");
}

const bfA = (game: Game) => game.gameState.battlefields.bfA;

async function raiderAttacksP2Passes(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bfA");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 09d954da2382c235 — attacked at the battlefield where Here to Help is hidden: still your battlefield, flip it and reinforce HERE", () => {
  test("after the Raider moves in, bfA is CONTESTED but its controller is still P1 — and stays P1 throughout the showdown", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bfA");
    expect(bfA(game)).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.zoneOf("help")).toBe("facedown-bfA"); // not trashed — P1 never lost control
    await game.p2.passFocus();
    expect(bfA(game)?.controller).toBe(P1);
  });

  test("with Focus, P1 can reveal the hidden Here to Help (Reaction, [0]); it resolves and lets P1 play the Reinforcement from hand for 4 − 3 = [1]", async () => {
    const game = await raiderAttacksP2Passes();
    expect(game.p1.can("reveal", "help")).toBe(true);
    await game.p1.reveal("help");
    expect(game.p1.energy()).toBe(1); // the flip itself is free
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "help", controller: P1 })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Here to Help resolves
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toContain("reinf");
    await game.p1.pick("reinf");
    // Played from hidden: "a battlefield you control" is narrowed to HERE (bfA) — bfB is not on offer; if asked at all, only bfA.
    const where = game.decision();
    if (where?.kind === "pick" && where.seat === P1 && where.options.some((o) => o.key.startsWith("battlefield-"))) {
      expect(where.options.map((o) => o.key)).toEqual(["battlefield-bfA"]);
      await game.p1.pick("battlefield-bfA");
    }
    expect(game.zoneOf("reinf")).toBe("battlefield-bfA");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("help")).toBe("trash");
  });

  test("the Reinforcement joins as a DEFENDER at bfA; the combat then goes P1's way (3 + 4 = 7 kills the Raider; its 5 can't kill both) and P1 keeps bfA", async () => {
    const game = await raiderAttacksP2Passes();
    await game.p1.reveal("help");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("reinf");
    const where = game.decision();
    if (where?.kind === "pick" && where.seat === P1 && where.options.some((o) => o.key.startsWith("battlefield-"))) {
      await game.p1.pick("battlefield-bfA");
    }
    expect(game.state("reinf").combatRole).toBe("defender");
    expect(bfA(game)).toMatchObject({ contested: true, controller: P1 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(bfA(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.units("bfA").length).toBeGreaterThanOrEqual(1);
    expect(game.violations()).toEqual([]);
  });
});
