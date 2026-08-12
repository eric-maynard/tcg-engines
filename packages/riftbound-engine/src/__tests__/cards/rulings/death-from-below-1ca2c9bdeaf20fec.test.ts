/**
 * Ruling 1ca2c9bdeaf20fec — Death from Below (UNL-186 → unl-186-219) · 4 + [rainbow]
 *   "Kill a unit at a battlefield. Then, if it had 3 [Might] or less, you may play this from your
 *    trash for [rainbow]."
 *
 * Q: I chose a 3-or-less unit with Death from Below and my opponent killed that unit in response.
 *    Can I still replay the spell from my trash?
 * A: No. At resolution the chosen unit is gone, so the target is illegal: the kill does not happen
 *    and the "if it had 3 [Might] or less" condition cannot be evaluated (it is null), so the
 *    "you may play this from your trash" permission never comes into being.
 * Rules: 359.3.e.2 (illegal target), 359.3.e.5 (its instruction is skipped), 359.3.e.12 (a
 *        look-back on a gone object yields null), 354.3 (playing from trash needs the permission).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEATH_FROM_BELOW = "unl-186-219";

/** [Reaction] "Deal 2 to a unit." — kills the 2-Might Runt outright. */
const ZAP = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Zap",
  rulesText: "[Reaction] Deal 2 to a unit.",
  timing: "reaction",
} as const;

/**
 * P1's turn with exactly 4 + [rainbow] for Death from Below plus a spare [rainbow] for the replay.
 * P2 holds bf1 with a 2-Might Runt (≤ 3 Might, so the replay rider is live) and a 5-Might Wall;
 * P2 has Zap and [1] to answer with.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 2 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Runt" }, "runt")
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .hand(P1, DEATH_FROM_BELOW, "dfb")
    .hand(P2, ZAP, "zap");
}

/** P1 aims Death from Below at the Runt; P2 Zaps the Runt in response; the Zap resolves first. */
async function zappedInResponse(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("dfb", { targets: "runt" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
  await game.p1.passPriority();
  await game.p2.cast("zap", { targets: "runt" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["dfb", "zap"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Zap resolves (LIFO)
  expect(game.zoneOf("runt")).toBe("trash");
  expect(game.chain().map((c) => c.cardId)).toEqual(["dfb"]);
  return game;
}

describe("Ruling 1ca2c9bdeaf20fec — killing Death from Below's target in response also switches off its replay-from-trash rider", () => {
  test("control: unopposed, the 2-Might Runt dies and P1 IS offered the optional [rainbow] replay from the trash", async () => {
    const game = await board().build();
    await game.p1.cast("dfb", { targets: "runt" });
    const stop = await game.settle();
    expect(game.zoneOf("runt")).toBe("trash");
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(0); // the [rainbow] replay cost was paid
    expect(game.gameState.cardsPlayedThisTurn).toMatchObject({ [P1]: 2 }); // played a second time
    expect(game.zoneOf("wall")).toBe("trash"); // the replayed copy killed the other unit
  });

  test("premise: the target is dead before Death from Below resolves — the spell is still on the chain when the Runt hits the trash", async () => {
    const game = await zappedInResponse();
    expect(game.zoneOf("zap")).toBe("trash");
    expect(game.zoneOf("dfb")).toBe("chain");
    expect(game.state("wall").damage).toBe(0);
  });

  test("ruling: Death from Below resolves with an illegal target — nothing else dies, P1 is NOT asked about the replay, and the spell sits in the trash unplayable", async () => {
    const game = await zappedInResponse();
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("wall")).toBe("battlefield-bf1"); // the kill did not wander to another unit
    expect(game.zoneOf("dfb")).toBe("trash");
    expect(game.p1.power("rainbow")).toBe(1); // the replay cost was never charged
    expect(game.p1.can("playFrom", "dfb")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("…and the trashed Death from Below is not castable from the trash later in the turn either", async () => {
    const game = await zappedInResponse();
    await game.settle();
    expect(game.p1.can("cast", "dfb")).toBe(false);
    const retry = await game.p1.try((p) => p.playFrom("dfb"));
    expect(retry.ok).toBe(false);
    expect(game.zoneOf("dfb")).toBe("trash");
  });
});
