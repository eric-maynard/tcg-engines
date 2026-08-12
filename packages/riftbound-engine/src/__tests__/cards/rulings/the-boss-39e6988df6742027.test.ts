/**
 * Ruling 39e6988df6742027 — The Boss (OGN-269 → ogn-269-298) · Legend · Sett
 *   "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to
 *    heal it, exhaust it, and recall it instead. (Send it to base. This isn't a move.)
 *    When you conquer, ready me."
 *
 * Q: When does Sett's "ready me" trigger, and what does it get you?
 * A: It triggers whenever YOU conquer a battlefield — by winning a combat for it, or by walking onto an
 *    empty one and scoring. That readies the LEGEND CARD itself (not any champion unit), which is what
 *    lets you exhaust it a second time for the save ability in the same turn.
 * Rules: 467 / 190.4 (Conquer), 383 (triggered abilities), 371 (the save is a replacement effect whose
 *        cost includes exhausting the legend), 402/404 (an unpayable cost ⇒ the option is not offered).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_BOSS = "ogn-269-298";

/** P1's turn: The Boss (exhausted or not), a buffed Runner in base, and P2 holding bf1 with a 1-Might squatter. */
function board(opts: { bossExhausted?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 2, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 1, name: "Squatter" }, "squatter")
    .unit(P1, "base", { might: 4, name: "Runner" }, "runner", { buffed: true });
  return opts.bossExhausted
    ? s.card("boss", { def: THE_BOSS, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
    : s.legend(P1, THE_BOSS, "boss");
}

/** Conquer bf1 with the Runner (4 + buff vs a 1-Might squatter). */
async function conquer(game: Game): Promise<void> {
  await game.p1.move("runner", "bf1");
  await game.settle();
  expect(game.zoneOf("squatter")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
}

describe("Ruling 39e6988df6742027 — The Boss readies itself whenever you conquer", () => {
  test("premise: The Boss starts the turn exhausted, so its save ability is unusable", async () => {
    const game = await board({ bossExhausted: true }).build();
    expect(game.state("boss").isExhausted).toBe(true);
  });

  test("ruling 39e6988df6742027 — conquering a battlefield by winning the combat for it READIES the exhausted legend", async () => {
    const game = await board({ bossExhausted: true }).build();
    await conquer(game);
    expect(game.p1.points()).toBe(1);
    expect(game.state("boss")).toMatchObject({ isExhausted: false, isReady: true });
    expect(game.violations()).toEqual([]);
  });

  test("…and walking onto an EMPTY battlefield (conquer + score) readies it just the same", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: null })
      .card("boss", { def: THE_BOSS, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .build();
    await game.p1.move("scout", "bf2");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.state("boss").isReady).toBe(true);
  });

  test("the ready lands on the LEGEND card itself — a champion unit of P1's next to it is untouched", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: null })
      .card("boss", { def: THE_BOSS, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .unit(P1, "base", { might: 5, name: "Sett" }, "sett", { exhausted: true })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .build();
    await game.p1.move("scout", "bf2");
    await game.settle();
    expect(game.state("boss").isReady).toBe(true);
    expect(game.state("sett").isExhausted).toBe(true); // the unit stays exhausted
  });

  test("that is the point of it: after the conquer the save ability is available again — a buffed unit that would die gets the offer, with the exhaust as its cost", async () => {
    const game = await board({ bossExhausted: true }).build();
    await conquer(game);
    expect(game.state("boss").isReady).toBe(true);
    // A second buffed unit walks into a lethal fight; The Boss may now be exhausted to save it.
    const game2 = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .legend(P1, THE_BOSS, "boss")
      .unit(P1, "base", { might: 2, name: "Victim" }, "victim", { buffed: true })
      .build();
    await game2.p1.move("victim", "bf1");
    await game2.settle({ policy: "first" });
    const asked = game2.decision();
    expect(asked === null || asked.kind === "action" || asked.source?.cardId === "boss").toBe(true);
    expect(game2.zoneOf("victim")).not.toBe("trash");
    expect(game2.state("boss").isExhausted).toBe(true); // the cost was paid to keep it alive
    expect(game2.locationOf("victim")).toBe("base"); // healed, exhausted and recalled
  });
});
