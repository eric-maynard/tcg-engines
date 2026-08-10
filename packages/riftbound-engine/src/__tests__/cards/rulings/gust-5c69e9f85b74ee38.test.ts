/**
 * Ruling 5c69e9f85b74ee38 — Gust (OGN-169 → ogn-169-298) · Reaction [1] "Return a unit at a battlefield with 3 [Might]
 *     or less to its owner's hand."
 *   × Teemo, Scout (OGN-197 → ogn-197-298) · 2 · 1 Might "[Hidden] When you play me, give me +3 [Might] this turn."
 *
 * Q: Can Gust return Teemo, Scout to hand before his on-play +3 Might resolves?
 * A: Yes. Teemo is played (from hand or from hidden) → his trigger goes on the chain → Gust may be played in
 *    response → Teemo (still 1 Might) returns to hand before the boost resolves.
 * Rules: 383.3 (triggered abilities use the chain), 336/337 (Reactions in response, LIFO), 811 (play from Hidden).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_SCOUT = "ogn-197-298";
const GUST = "ogn-169-298";

/** Turn 3, P1 active, holds bf1 with a Holder. P2: Gust + [1]. */
function base() {
  return scenario()
    .turn(3)
    .active(P1)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .hand(P2, GUST, "gust")
    .resources(P2, { energy: 1 });
}

async function expectTriggerPendingThenGust(game: Game): Promise<void> {
  expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
  expect(game.state("teemo").might).toBe(1);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, triggered: true })]);
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.actingSeat()).toBe(P2);
  expect(game.p2.can("cast", "gust")).toBe(true);
  await game.p2.cast("gust", { targets: "teemo" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["teemo", "gust"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Gust resolves
  expect(game.zoneOf("gust")).toBe("trash");
  expect(game.zoneOf("teemo")).toBe("hand");
  expect(game.p1.hand()).toContain("teemo");
  // The +3 trigger is still on the chain, unresolved, with its source gone.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", triggered: true })]);
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("teemo")).toBe("hand");
  expect(game.state("teemo").mightModifier).toBe(0);
  expect(game.violations()).toEqual([]);
}

describe("Ruling 5c69e9f85b74ee38 — Gust bounces Teemo, Scout while his +3 Might trigger is still on the chain", () => {
  test("played from HAND to a battlefield: trigger goes on the chain, P2 Gusts the 1-Might Teemo, he returns to hand before the boost", async () => {
    const game = await base().resources(P1, { energy: 2 }).hand(P1, TEEMO_SCOUT, "teemo").build();
    await game.p1.play("teemo", { to: "bf1" });
    expect(game.p1.energy()).toBe(0);
    await expectTriggerPendingThenGust(game);
  });

  test("played from HIDDEN at bf1: same — trigger on the chain, Gust resolves first, Teemo back in hand un-boosted", async () => {
    const game = await base().facedown(P1, "bf1", TEEMO_SCOUT, "teemo").build();
    await game.p1.reveal("teemo");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("teemo");
    }
    await expectTriggerPendingThenGust(game);
  });

  test("contrast — no response: the trigger resolves and Teemo is 4 Might this turn (out of Gust range)", async () => {
    const game = await base().resources(P1, { energy: 2 }).hand(P1, TEEMO_SCOUT, "teemo").build();
    await game.p1.play("teemo", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").might).toBe(4);
    expect(game.zoneOf("gust")).toBe("hand");
  });
});
